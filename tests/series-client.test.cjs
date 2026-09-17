const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// Compile in memory and load the real ESM parser through dynamic import.
// No Expo runtime, network, or generated files are needed.
let normalizeBase,
  parsePage,
  parseSelection,
  searchEntries,
  SeriesClient,
  buildReport;
before(async () => {
  const parser = await import("htmlparser2");
  const filename = path.resolve(__dirname, "../src/lib/series-client.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (name) =>
    name === "htmlparser2" ? parser : originalRequire(name);
  loaded._compile(compiled, filename);
  ({
    normalizeBase,
    parsePage,
    parseSelection,
    searchEntries,
    SeriesClient,
    buildReport,
  } = loaded.exports);
});
const base = "https://catalog.example";
const folder = (name, href) =>
  `<div class="f"><img src="folder.png"><a href="${href}">${name}</a></div>`;
const episode = (name, href) => `<a href="${href}">${name}</a>`;

test("normalizes source and rejects invalid/credential URLs", () => {
  assert.equal(normalizeBase(" catalog.example/folder/ "), base);
  assert.equal(
    normalizeBase("http://catalog.example:8080/path"),
    "http://catalog.example:8080",
  );
  for (const value of [
    "",
    "ftp://catalog.example",
    "https://u:p@catalog.example",
    "bad host",
    "https://",
  ]) {
    assert.throws(() => normalizeBase(value));
  }
});

test("extracts folders first, decodes entities and ignores unsafe URLs", () => {
  const html =
    folder("A &amp; B <b>தமிழ்</b>", "/series?a=1&amp;b=2") +
    episode("Ep &#49;", "/download/1") +
    episode("Duplicate", "/download/1") +
    episode("Unsafe", "javascript:alert(1)") +
    episode("Other", "/about");
  const parsed = parsePage(html, base);
  assert.equal(parsed.total, 1);
  assert.deepEqual(parsed.entries, [
    { title: "A & B தமிழ்", url: `${base}/series?a=1&b=2`, kind: "folder" },
    { title: "Ep 1", url: `${base}/download/1`, kind: "episode" },
  ]);
  assert.ok(parsed.links.every((item) => item.url.startsWith("https:")));
});

test("pagination limits are enforced", () => {
  assert.equal(parsePage('<span id="totalPages">200</span>', base).total, 200);
  for (const value of ["201", "0", "-1", "oops"]) {
    assert.throws(() =>
      parsePage(`<span id="totalPages">${value}</span>`, base),
    );
  }
});

test("range selection is ordered, unique and validated", () => {
  assert.deepEqual(parseSelection("3,1-3,5-6", 6), [2, 0, 1, 4, 5]);
  for (const value of ["", "0", "4-2", "7", "1,", "abc"])
    assert.throws(() => parseSelection(value, 6));
});

test("search filtering and name sorting is natural, case-insensitive and bidirectional", () => {
  const entries = [
    { title: "Episode 10", url: `${base}/download/10`, kind: "episode" },
    { title: "season 2 promo", url: `${base}/promo`, kind: "folder" },
    { title: "Episode 2", url: `${base}/download/2`, kind: "episode" },
    { title: "Episode 1", url: `${base}/download/1`, kind: "episode" },
  ];
  const asc = searchEntries(entries, "", "asc");
  assert.deepEqual(
    asc.map((entry) => entry.title),
    ["Episode 1", "Episode 2", "Episode 10", "season 2 promo"],
  );
  assert.deepEqual(
    searchEntries(entries, "", "desc").map((entry) => entry.title),
    ["season 2 promo", "Episode 10", "Episode 2", "Episode 1"],
  );
  assert.deepEqual(
    searchEntries(entries, "EPISODE", "asc").map((entry) => entry.url),
    [`${base}/download/1`, `${base}/download/2`, `${base}/download/10`],
  );
  assert.deepEqual(searchEntries(entries, "missing", "asc"), []);
  // Sorting must not mutate the caller's array order.
  assert.equal(entries[0].title, "Episode 10");
});

test("catalog pagination, deduplication, cache and refresh", async () => {
  const calls = [];
  const client = new SeriesClient(base, async (url) => {
    calls.push(url);
    const second = new URL(url).searchParams.has("get-page");
    return {
      url,
      text: second
        ? folder("Two", "/two") + folder("One", "/one")
        : folder("One", "/one") +
          episode("Ignore", "/download/1") +
          '<span id="totalPages">2</span>',
    };
  });
  const signal = new AbortController().signal;
  const entries = await client.listing(
    `${base}/catalog`,
    true,
    signal,
    () => {},
  );
  assert.equal(entries.length, 2);
  assert.equal(calls[1], `${base}/catalog?get-page=2`);
  await client.listing(`${base}/catalog`, true, signal, () => {});
  assert.equal(calls.length, 2);
  await client.listing(`${base}/catalog`, true, signal, () => {}, true);
  assert.equal(calls.length, 4);
});

test("folder pagination uses page and resolves relative redirected URLs", async () => {
  const calls = [];
  const client = new SeriesClient(base, async (url) => {
    calls.push(url);
    return {
      url: "https://redirect.example/season/",
      text: episode("Ep", "/download/1") + '<span id="totalPages">2</span>',
    };
  });
  const entries = await client.listing(
    `${base}/folder?quality=hd`,
    false,
    new AbortController().signal,
    () => {},
  );
  assert.equal(calls[1], `${base}/folder?quality=hd&page=2`);
  assert.equal(entries[0].url, "https://redirect.example/download/1");
});

test("three public link stages are resolved without downloading media", async () => {
  const responses = [
    episode(
      "Wrong host",
      "https://download.moviespage.xyz.evil.example/download/file/1",
    ) + episode("Server", "https://download.moviespage.xyz/download/file/1"),
    episode("Continue", "https://movies.downloadpage.xyz/download/page/1"),
    episode(
      "<b>Download Server 1</b>",
      "https://files.example/media.mp4?a=1&amp;b=2",
    ),
  ];
  const calls = [];
  const client = new SeriesClient(base, async (url) => {
    calls.push(url);
    return { url, text: responses.shift() };
  });
  const link = await client.downloadLink(
    `${base}/download/1`,
    new AbortController().signal,
  );
  assert.equal(link, "https://files.example/media.mp4?a=1&b=2");
  assert.equal(calls.length, 3);
  assert.equal(calls[1], "https://download.moviespage.xyz/download/file/1");
});

test("missing stages and failed fetches produce actionable errors", async () => {
  const client = new SeriesClient(base, async (url) => ({
    url,
    text: "<p>Changed</p>",
  }));
  await assert.rejects(
    client.downloadLink(`${base}/download/1`, new AbortController().signal),
    /Could not find download server/,
  );
  const failing = new SeriesClient(base, async () => {
    throw new Error("offline");
  });
  await assert.rejects(
    failing.listing(base, true, new AbortController().signal, () => {}),
    /offline/,
  );
});

test("cancellation prevents requests and discards in-flight results", async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  let calls = 0;
  const client = new SeriesClient(base, async (url) => {
    calls++;
    return { url, text: "" };
  });
  await assert.rejects(
    client.listing(base, true, cancelled.signal, () => {}),
    /Cancelled/,
  );
  assert.equal(calls, 0);
  const controller = new AbortController();
  const pending = new SeriesClient(base, async (url) => {
    controller.abort();
    return { url, text: folder("One", "/one") };
  });
  await assert.rejects(
    pending.listing(base, true, controller.signal, () => {}),
    /Cancelled/,
  );
});

test("report includes successes, failures and unprocessed episodes", () => {
  const ep = {
    title: "தமிழ் episode",
    url: `${base}/download/1`,
    kind: "episode",
  };
  const text = buildReport(
    base,
    "Season 1",
    [
      { episode: ep, link: "https://files.example/1" },
      { episode: ep, error: "offline" },
    ],
    3,
    "2026-09-17",
  );
  assert.match(text, /Successful: 1 \| Failed: 1 \| Unprocessed: 1/);
  assert.match(text, /தமிழ் episode/);
  assert.match(text, /Reason: offline/);
});
