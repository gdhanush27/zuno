const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

let parseStoredList, upsertByEpisode, downloadFileName, formatBytes;
before(() => {
  const filename = path.resolve(__dirname, "../src/lib/media-library.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded._compile(compiled, filename);
  ({ parseStoredList, upsertByEpisode, downloadFileName, formatBytes } =
    loaded.exports);
});

test("stored lists tolerate missing, malformed and non-array data", () => {
  assert.deepEqual(parseStoredList(null), []);
  assert.deepEqual(parseStoredList("{"), []);
  assert.deepEqual(parseStoredList('{"title":"Episode"}'), []);
  assert.deepEqual(parseStoredList('[{"episodeUrl":"/1"}]'), [
    { episodeUrl: "/1" },
  ]);
});

test("episode upserts are newest first and unique", () => {
  const old = { episodeUrl: "/1", title: "Old" };
  const other = { episodeUrl: "/2", title: "Other" };
  const updated = { episodeUrl: "/1", title: "Updated" };
  assert.deepEqual(upsertByEpisode([old, other], updated), [updated, other]);
});

test("download names are safe and preserve common URL extensions", () => {
  const originalNow = Date.now;
  Date.now = () => 42;
  try {
    assert.equal(
      downloadFileName(
        "../ Episode: 01? ",
        "https://media.example/show.MKV?q=1",
      ),
      "Episode-01-42.mkv",
    );
    assert.equal(downloadFileName("தமிழ்", "not a url"), "episode-42.mp4");
    assert.equal(
      downloadFileName("Episode 02", "https://links.example/dl.php?id=7"),
      "Episode-02-42.mp4",
    );
  } finally {
    Date.now = originalNow;
  }
});

test("byte sizes use readable units", () => {
  assert.equal(formatBytes(0), "Unknown size");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(12 * 1024 * 1024), "12 MB");
});
