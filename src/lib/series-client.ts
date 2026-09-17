import { DomUtils, parseDocument } from "htmlparser2";

export const DEFAULT_BASE = "https://moviezda.com";
export type Entry = { title: string; url: string; kind: "folder" | "episode" };
export type Result = { episode: Entry; link?: string; error?: string };
export type Page = { text: string; url: string };
export type Transport = (url: string, signal: AbortSignal) => Promise<Page>;

export function searchEntries(
  entries: readonly Entry[],
  query: string,
  order: "asc" | "desc",
): Entry[] {
  return entries
    .filter((entry) => entry.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const comparison = a.title.localeCompare(b.title, "en", {
        sensitivity: "base",
        numeric: true,
      });
      return order === "asc" ? comparison : -comparison;
    });
}

export function normalizeBase(value: string): string {
  const input = value.trim();
  try {
    if (!input || /\s|\\/.test(input)) throw new Error();
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Error(
      "Enter an HTTP(S) domain or URL without spaces or credentials.",
    );
  }
}

function publicUrl(href: string, base: string): string | undefined {
  try {
    const url = new URL(href, base);
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    /* Ignore malformed links, not the entire page. */
  }
  return undefined;
}

function tidy(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function parsePage(text: string, pageUrl: string) {
  const document = parseDocument(text);
  const anchors = DomUtils.findAll(
    (node) => node.name === "a" && !!node.attribs.href,
    document.children,
  );
  const links = anchors.flatMap((node) => {
    const url = publicUrl(node.attribs.href, pageUrl);
    return url ? [{ title: tidy(DomUtils.textContent(node)) || url, url }] : [];
  });
  const entries = new Map<string, Entry>();
  const folders = DomUtils.findAll(
    (node) =>
      node.name === "div" &&
      (node.attribs.class ?? "").split(/\s+/).includes("f"),
    document.children,
  );
  for (const folder of folders) {
    const anchor = DomUtils.findAll(
      (node) => node.name === "a" && !!node.attribs.href,
      folder.children,
    )[0];
    if (!anchor) continue;
    const url = publicUrl(anchor.attribs.href, pageUrl);
    if (url)
      entries.set(url, {
        title: tidy(DomUtils.textContent(anchor)) || url,
        url,
        kind: "folder",
      });
  }
  for (const link of links) {
    if (
      new URL(link.url).pathname.startsWith("/download/") &&
      !entries.has(link.url)
    ) {
      entries.set(link.url, { ...link, kind: "episode" });
    }
  }
  const counter = DomUtils.findAll(
    (node) => node.attribs.id === "totalPages",
    document.children,
  )[0];
  const raw = counter ? tidy(DomUtils.textContent(counter)) : "1";
  const total = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(total) || total < 1 || total > 200) {
    throw new Error(
      "Unexpected pagination count. Refusing to load more than 200 pages.",
    );
  }
  return { entries: [...entries.values()], links, total };
}

export function parseSelection(value: string, count: number): number[] {
  const selected = new Set<number>();
  for (const part of value.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match)
      throw new Error("Use numbers or ranges, such as 1,2 or 1-3,5-6.");
    const start = Number(match[1]);
    const end = Number(match[2] ?? start);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      start > end ||
      end > count
    ) {
      throw new Error(
        `Choose numbers from 1 to ${count}; ranges must be ascending.`,
      );
    }
    for (let index = start - 1; index < end; index++) selected.add(index);
  }
  return [...selected];
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) throw new Error("Cancelled.");
}

const nativeTransport: Transport = async (url, signal) => {
  const response = await fetch(url, {
    signal,
    credentials: "include",
    headers: {
      "User-Agent": "SeriesDownloaderCLI/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok)
    throw new Error(
      `HTTP ${response.status}. The site may be unavailable or blocking requests.`,
    );
  const type = response.headers.get("content-type") ?? "";
  if (type && !/text\/|application\/xhtml\+xml/i.test(type)) {
    throw new Error(
      "Expected an HTML page, but the server returned a different file type.",
    );
  }
  return { text: await response.text(), url: response.url || url };
};

export class SeriesClient {
  readonly baseUrl: string;
  private cache = new Map<string, Entry[]>();
  private transport: Transport;

  constructor(baseUrl: string, transport: Transport = nativeTransport) {
    this.baseUrl = normalizeBase(baseUrl);
    this.transport = transport;
  }

  private async fetchPage(url: string, signal: AbortSignal): Promise<Page> {
    checkCancelled(signal);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener("abort", cancel);
    const timeout = setTimeout(cancel, 15000);
    try {
      const page = await this.transport(url, controller.signal);
      checkCancelled(signal);
      if (controller.signal.aborted)
        throw new Error("Request timed out after 15 seconds.");
      return page;
    } catch (error) {
      checkCancelled(signal);
      if (controller.signal.aborted)
        throw new Error("Request timed out after 15 seconds.");
      throw new Error(
        `Could not load ${new URL(url).hostname}: ${errorMessage(error)}`,
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
    }
  }

  async listing(
    url: string,
    catalog: boolean,
    signal: AbortSignal,
    progress: (text: string) => void,
    refresh = false,
  ) {
    checkCancelled(signal);
    const key = `${catalog}:${url}`;
    if (!refresh && this.cache.has(key)) return this.cache.get(key)!;
    progress("Loading page 1…");
    const first = await this.fetchPage(url, signal);
    const parsed = parsePage(first.text, first.url);
    const entries = parsed.entries;
    for (let page = 2; page <= parsed.total; page++) {
      checkCancelled(signal);
      progress(`Loading page ${page} of ${parsed.total}…`);
      const next = new URL(url);
      next.searchParams.set(catalog ? "get-page" : "page", String(page));
      const response = await this.fetchPage(next.href, signal);
      entries.push(...parsePage(response.text, response.url).entries);
    }
    const unique = [
      ...new Map(
        entries
          .filter((entry) => !catalog || entry.kind === "folder")
          .map((entry) => [entry.url, entry]),
      ).values(),
    ];
    checkCancelled(signal);
    // Bound session-only cache growth. Never cache resolved/expiring download links.
    if (this.cache.size >= 30)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, unique);
    return unique;
  }

  async downloadLink(url: string, signal: AbortSignal): Promise<string> {
    const stages = [
      {
        host: "download.moviespage.xyz",
        path: "/download/file/",
        label: "download server",
      },
      {
        host: "movies.downloadpage.xyz",
        path: "/download/page/",
        label: "intermediate page",
      },
      { host: "", path: "", label: "Download Server 1" },
    ];
    for (const stage of stages) {
      const response = await this.fetchPage(url, signal);
      const { links } = parsePage(response.text, response.url);
      const match = links.find((link) => {
        const candidate = new URL(link.url);
        return stage.host
          ? candidate.hostname === stage.host &&
              candidate.pathname.startsWith(stage.path)
          : link.title.toLowerCase() === stage.label.toLowerCase();
      });
      if (!match)
        throw new Error(
          `Could not find ${stage.label}. The website may have changed or requires browser verification.`,
        );
      url = match.url;
    }
    return url;
  }
}

export function buildReport(
  base: string,
  heading: string,
  results: Result[],
  selected: number,
  generated: string,
) {
  const success = results.filter((result) => result.link).length;
  const lines = [
    "=".repeat(72),
    "Tamil Web Series - DOWNLOAD LINKS",
    "=".repeat(72),
    "Created by gdhanush27 | https://github.com/gdhanush27",
    `Selection: ${heading}`,
    `Source: ${base}`,
    `Generated: ${generated}`,
    `Selected: ${selected} | Successful: ${success} | Failed: ${results.length - success} | Unprocessed: ${selected - results.length}`,
    "Only links are listed below; no media files were downloaded.",
    "",
  ];
  results.forEach(({ episode, link, error }, index) => {
    lines.push(
      "-".repeat(72),
      `${String(index + 1).padStart(2, "0")}. ${episode.title}`,
      `Status: ${link ? "OK" : "FAILED"}`,
      `Episode page: ${episode.url}`,
      link ? `Download link:\n${link}` : `Reason: ${error}`,
      "",
    );
  });
  return lines.join("\n") + "\n";
}
