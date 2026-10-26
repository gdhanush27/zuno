const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// Compile the real movie parser in memory; no Expo runtime, network, or
// generated files are needed because the network hops are injected.
let parseMoviePage,
  parseDownloadLinks,
  decodeLinkToken,
  linkExpiry,
  letterPath,
  MovieClient;
before(async () => {
  const parser = await import("htmlparser2");
  const cache = new Map();
  const loadModule = (name) => {
    if (cache.has(name)) return cache.get(name);
    const filename = path.resolve(__dirname, `../src/lib/${name}.ts`);
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
    loaded.require = (request) => {
      if (request === "htmlparser2") return parser;
      if (request.startsWith("./")) {
        const dependency = request.slice(2).replace(/\.js$/, "");
        return loadModule(dependency);
      }
      return originalRequire(request);
    };
    loaded._compile(compiled, filename);
    cache.set(name, loaded.exports);
    return loaded.exports;
  };
  ({
    parseMoviePage,
    parseDownloadLinks,
    decodeLinkToken,
    linkExpiry,
    letterPath,
    MovieClient,
  } = loadModule("movie-client"));
});

const base = "https://catalog.example";
const folder = (name, href) =>
  `<div class="f"><img src="folder.png"><a href="${href}">${name}</a></div>`;
const fileRow = (name, href, details = []) =>
  `<div class="mv-content"><h4><a href="${href}">${name}</a></h4><ul>${details
    .map((line) => `<li>${line}</li>`)
    .join("")}</ul></div>`;

test("letter paths are lowercase and rooted", () => {
  assert.equal(letterPath("A"), "/tamil-movies/a/");
  assert.equal(letterPath("z"), "/tamil-movies/z/");
});

test("movie pages expose folders, files, sizes and info", () => {
  const html =
    "<h1>Meesaya Murukku 2 (2026)</h1>" +
    '<img src="/poster.jpg">' +
    '<div class="movie-synopsis">Synopsis: A musical sequel.</div>' +
    '<ul><li><strong>Director:</strong><span>Hiphop Tamizha</span></li>' +
    '<li><strong>Quality:</strong><span>480p, 720p</span></li>' +
    '<li><strong>Last Updated:</strong><span>10 Feb 2026</span></li></ul>' +
    folder("Meesaya Murukku 2 (2026) HD", "/hd/") +
    fileRow("720p", "/download/720/", [
      "File Size: 1.2GB",
      "Download Format: mkv",
    ]) +
    '<span id="totalPages">3</span>';
  const parsed = parseMoviePage(html, `${base}/movies/`);
  assert.equal(parsed.total, 3);
  assert.equal(parsed.info.title, "Meesaya Murukku 2 (2026)");
  assert.equal(parsed.info.poster, `${base}/poster.jpg`);
  assert.equal(parsed.info.director, "Hiphop Tamizha");
  assert.equal(parsed.info.synopsis, "A musical sequel.");
  assert.deepEqual(parsed.entries, [
    { title: "Meesaya Murukku 2 (2026) HD", url: `${base}/hd/`, kind: "folder" },
    {
      title: "720p",
      url: `${base}/download/720/`,
      kind: "file",
      size: "1.2GB",
      format: "mkv",
    },
  ]);
});

test("listing pages without an h1 never report movie info", () => {
  const html =
    '<a class="movie-item" href="/movie-one/" data-title="Movie One"><picture><img class="movie-poster" src="/p1.jpg"></picture><h3 class="movie-title">Movie One (2025)</h3></a>' +
    '<div class="f"><img src="folder.png"><a href="/collection-one/">Collection One</a></div>' +
    '<span id="totalPages">2</span>';
  const parsed = parseMoviePage(html, `${base}/tamil-2025-movies/`);
  assert.equal(parsed.info, null);
  assert.equal(parsed.entries.length, 2);
});

test("pagination limits are enforced for movies", () => {
  assert.equal(
    parseMoviePage('<span id="totalPages">200</span>', base).total,
    200,
  );
  for (const value of ["201", "0", "-1", "oops"])
    assert.throws(() =>
      parseMoviePage(`<span id="totalPages">${value}</span>`, base),
    );
});

test("download pages separate download and watch-online links", () => {
  const html =
    '<a href="https://download.moviespage.xyz/download/file/1" rel="nofollow"><b>Download Server 1</b></a>' +
    '<a href="https://play.onestream.today/stream/page/1"><b>Watch Online Server 1</b></a>' +
    '<a href="/about/">About</a>';
  const { downloads, online } = parseDownloadLinks(html, base);
  assert.equal(downloads.length, 1);
  assert.equal(
    downloads[0].url,
    "https://download.moviespage.xyz/download/file/1",
  );
  assert.equal(online.url, "https://play.onestream.today/stream/page/1");
});

test("dl tokens decode to the signed file path and expiry", () => {
  const payload =
    "server=fastly&hash=abc123&exp=1770000000&path=Meesaya.Murukku.2.mp4&stream=0";
  const token = Buffer.from(payload, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const url = `https://fastly.fastbytes.xyz/open.php?dl=${token}`;
  const params = decodeLinkToken(url);
  assert.equal(params.get("path"), "Meesaya.Murukku.2.mp4");
  assert.equal(linkExpiry(url).getTime(), 1770000000 * 1000);
  assert.equal(decodeLinkToken("https://example.com/no-token"), null);
  assert.equal(linkExpiry("https://example.com/no-token"), null);
});

test("movie listing paginates with page and deduplicates", async () => {
  const calls = [];
  const client = new MovieClient(base, async (url) => {
    calls.push(url);
    const page = Number(new URL(url).searchParams.get("page") ?? "1");
    return {
      url,
      text:
        (page === 1
          ? folder("One", "/one") + folder("Shared", "/shared")
          : folder("Two", "/two") + folder("Shared", "/shared")) +
        '<span id="totalPages">2</span>',
    };
  });
  const signal = new AbortController().signal;
  const result = await client.listing(
    `${base}/tamil-movies-collection/`,
    signal,
    () => {},
  );
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.entries.map((entry) => entry.url),
    [`${base}/one`, `${base}/shared`, `${base}/two`],
  );
  assert.equal(calls[1], `${base}/tamil-movies-collection/?page=2`);
});

test("download resolution walks the chain and follows the media redirect", async () => {
  const pages = new Map([
    [
      `${base}/download/720/`,
      '<a href="https://download.moviespage.xyz/download/file/1"><b>Download Server 1</b></a>',
    ],
    [
      "https://download.moviespage.xyz/download/file/1",
      '<a href="https://movies.downloadpage.xyz/download/page/1"><b>Download Server 1</b></a>',
    ],
    [
      "https://movies.downloadpage.xyz/download/page/1",
      '<a href="https://fastly.fastbytes.xyz/open.php?dl=token"><b>Download Server 1</b></a>',
    ],
  ]);
  const hops = [];
  const client = new MovieClient(
    base,
    async (url) => ({ url, text: pages.get(url) ?? "<p>missing</p>" }),
    async (url) => {
      hops.push(url);
      if (url.startsWith("https://fastly.fastbytes.xyz/"))
        return {
          url,
          location:
            "https://web.skyvault-assets.xyz/Meesaya.Murukku.2.mp4?exp=1&sig=abc",
        };
      return { url };
    },
  );
  const link = await client.downloadLink(
    `${base}/download/720/`,
    new AbortController().signal,
  );
  assert.equal(
    link,
    "https://web.skyvault-assets.xyz/Meesaya.Murukku.2.mp4?exp=1&sig=abc",
  );
  assert.deepEqual(hops, [
    "https://download.moviespage.xyz/download/file/1",
    "https://movies.downloadpage.xyz/download/page/1",
    "https://fastly.fastbytes.xyz/open.php?dl=token",
  ]);
});

test("missing download stages surface an actionable error", async () => {
  const client = new MovieClient(
    base,
    async (url) => ({ url, text: "<p>Changed layout</p>" }),
    async (url) => ({ url }),
  );
  await assert.rejects(
    () =>
      client.downloadLink(
        `${base}/download/720/`,
        new AbortController().signal,
      ),
    /Could not find a download link/,
  );
});

test("cancellation aborts resolution immediately", async () => {
  const client = new MovieClient(
    base,
    async (url) => ({
      url,
      text: '<a href="https://download.moviespage.xyz/download/file/1"><b>Download Server 1</b></a>',
    }),
    async (url) => ({ url }),
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => client.downloadLink(`${base}/download/720/`, controller.signal),
    /Cancelled/,
  );
});
