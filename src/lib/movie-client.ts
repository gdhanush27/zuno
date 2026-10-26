import { DomUtils, parseDocument } from "htmlparser2";

import {
  errorMessage,
  normalizeBase,
  type Page,
  type Transport,
} from "./series-client";

export type MovieEntry = {
  title: string;
  url: string;
  kind: "folder" | "file";
  size?: string;
  format?: string;
  poster?: string;
};

export type MovieInfo = {
  title: string;
  poster?: string;
  director?: string;
  starring?: string;
  genres?: string;
  quality?: string;
  language?: string;
  rating?: string;
  updated?: string;
  synopsis?: string;
};

export type MoviePage = {
  info: MovieInfo | null;
  entries: MovieEntry[];
  total: number;
  url: string;
};

export const MOVIES_PATH = "/tamil-movies-collection/";
export const NEW_MOVIES_PATH = "/moviesda-tamil-movies-2026/";
export const SINGLE_PARTS_PATH = "/moviesda-tamil-collections/";
export const HD_MOBILE_PATH = "/tamil-hd-movies/";
export const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
export const YEARS = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015,
  2012,
];

export function letterPath(letter: string) {
  return `/tamil-movies/${letter.toLowerCase()}/`;
}

export function yearPath(year: number) {
  return `/tamil-${year}-movies/`;
}

const PAGE_CONCURRENCY = 6;
const MAX_PAGES = 200;

function tidy(text: string) {
  return text.replace(/\s+/g, " ").trim();
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
    // Malformed links are skipped; the rest of the page is still usable.
  }
  return undefined;
}

function infoField(document: ReturnType<typeof parseDocument>, label: string) {
  const items = DomUtils.findAll(
    (node) => node.name === "li" && !!node.attribs,
    document.children,
  );
  for (const item of items) {
    const strong = DomUtils.findOne(
      (node) => node.name === "strong",
      item.children,
    );
    if (!strong) continue;
    if (tidy(DomUtils.textContent(strong)).replace(/:$/, "") !== label) continue;
    const span = DomUtils.findOne(
      (node) => node.name === "span",
      item.children,
    );
    return span ? tidy(DomUtils.textContent(span)) : "";
  }
  return "";
}

function parseInfo(document: ReturnType<typeof parseDocument>, pageUrl: string) {
  const heading = DomUtils.findOne((node) => node.name === "h1", document.children);
  // Listing pages (years, letters, collections) have no <h1> but do carry
  // poster <img> tags, so an image alone must not be treated as movie details.
  if (!heading) return null;
  const title = tidy(DomUtils.textContent(heading));
  if (!title) return null;
  const image = DomUtils.findOne(
    (node) => node.name === "img" && !!node.attribs?.src,
    document.children,
  );
  const synopsisNode = DomUtils.findOne(
    (node) =>
      !!node.attribs &&
      (node.attribs.class ?? "").split(/\s+/).includes("movie-synopsis"),
    document.children,
  );
  const synopsis = synopsisNode
    ? tidy(DomUtils.textContent(synopsisNode)).replace(/^Synopsis:\s*/i, "")
    : "";
  return {
    title,
    poster: image ? publicUrl(image.attribs.src, pageUrl) : undefined,
    director: infoField(document, "Director") || undefined,
    starring: infoField(document, "Starring") || undefined,
    genres: infoField(document, "Genres") || undefined,
    quality: infoField(document, "Quality") || undefined,
    language: infoField(document, "Language") || undefined,
    rating: infoField(document, "Movie Rating") || undefined,
    updated: infoField(document, "Last Updated") || undefined,
    synopsis: synopsis || undefined,
  } satisfies MovieInfo;
}

function parseTotal(document: ReturnType<typeof parseDocument>) {
  const counter = DomUtils.findOne(
    (node) => node.attribs?.id === "totalPages",
    document.children,
  );
  // Short letter pages omit the pagination block entirely; treat them as a
  // single page instead of failing the whole listing.
  if (!counter) return 1;
  const raw = tidy(DomUtils.textContent(counter));
  const total = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(total) || total < 1 || total > MAX_PAGES)
    throw new Error(
      `Unexpected pagination count. Refusing to load more than ${MAX_PAGES} pages.`,
    );
  return total;
}

export function parseMoviePage(text: string, pageUrl: string): MoviePage {
  const document = parseDocument(text);
  const entries = new Map<string, MovieEntry>();

  const folders = DomUtils.findAll(
    (node) =>
      node.name === "div" &&
      (node.attribs.class ?? "").split(/\s+/).includes("f"),
    document.children,
  );
  for (const folder of folders) {
    const anchor = DomUtils.findOne(
      (node) => node.name === "a" && !!node.attribs?.href,
      folder.children,
    );
    if (!anchor) continue;
    const url = publicUrl(anchor.attribs.href, pageUrl);
    if (!url || entries.has(url)) continue;
    entries.set(url, {
      title: tidy(DomUtils.textContent(anchor)) || url,
      url,
      kind: "folder",
    });
  }

  // Year listings use a modern card layout: <a class="movie-item"> wrapping
  // the title, instead of the classic `div.f` folder rows.
  const cards = DomUtils.findAll(
    (node) =>
      node.name === "a" &&
      (node.attribs.class ?? "").split(/\s+/).includes("movie-item"),
    document.children,
  );
  for (const card of cards) {
    const url = publicUrl(card.attribs.href, pageUrl);
    if (!url || entries.has(url)) continue;
    const heading = DomUtils.findOne(
      (node) => node.name === "h3",
      card.children,
    );
    const image = DomUtils.findOne(
      (node) => node.name === "img" && !!node.attribs?.src,
      card.children,
    );
    entries.set(url, {
      title:
        (heading ? tidy(DomUtils.textContent(heading)) : "") ||
        tidy(card.attribs["data-title"] ?? "") ||
        url,
      url,
      kind: "folder",
      poster: image ? publicUrl(image.attribs.src, pageUrl) : undefined,
    });
  }

  const rows = DomUtils.findAll(
    (node) =>
      node.name === "div" &&
      (node.attribs.class ?? "").split(/\s+/).includes("mv-content"),
    document.children,
  );
  for (const row of rows) {
    const anchor = DomUtils.findOne(
      (node) =>
        node.name === "a" &&
        !!node.attribs?.href &&
        new URL(node.attribs.href, pageUrl).pathname.startsWith("/download/"),
      row.children,
    );
    if (!anchor) continue;
    const url = publicUrl(anchor.attribs.href, pageUrl);
    if (!url || entries.has(url)) continue;
    const details = DomUtils.findAll(
      (node) => node.name === "li",
      row.children,
    ).map((node) => tidy(DomUtils.textContent(node)));
    const size = details
      .find((line) => /^File Size:/i.test(line))
      ?.replace(/^File Size:\s*/i, "");
    const format = details
      .find((line) => /^Download Format:/i.test(line))
      ?.replace(/^Download Format:\s*/i, "");
    entries.set(url, {
      title: tidy(DomUtils.textContent(anchor)) || url,
      url,
      kind: "file",
      size: size || undefined,
      format: format || undefined,
    });
  }

  return {
    info: parseInfo(document, pageUrl),
    entries: [...entries.values()],
    total: parseTotal(document),
    url: pageUrl,
  };
}

export type DownloadRow = { title: string; url: string };

/** Reads the Download / Watch Online links from a movie file page. */
export function parseDownloadLinks(text: string, pageUrl: string) {
  const document = parseDocument(text);
  const self = new URL(pageUrl).href;
  const links = DomUtils.findAll(
    (node) => node.name === "a" && !!node.attribs?.href,
    document.children,
  ).flatMap((node) => {
    const href = node.attribs.href.trim();
    // In-page anchors (`#`, `#top`) resolve back to this page and would make
    // the resolver walk itself forever.
    if (!href || href.startsWith("#")) return [];
    const url = publicUrl(href, pageUrl);
    if (!url || url === self) return [];
    return [{ title: tidy(DomUtils.textContent(node)) || url, url }];
  });
  const downloads = links.filter(
    (link) =>
      !/^watch online/i.test(link.title) &&
      (/^download server/i.test(link.title) ||
        /^\/download\//.test(new URL(link.url).pathname)),
  );
  const online = links.find((link) => /^watch online/i.test(link.title));
  return { downloads, online };
}

/**
 * The final hop is a redirect host, so the .mp4 URL only appears in a
 * Location header. Decoding `dl` also exposes the signed expiry timestamp.
 */
export function decodeLinkToken(value: string): URLSearchParams | null {
  try {
    const url = new URL(value);
    const token = url.searchParams.get("dl");
    if (!token) return null;
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return new URLSearchParams(binary);
  } catch {
    return null;
  }
}

export function linkExpiry(value: string): Date | null {
  const exp = Number(decodeLinkToken(value)?.get("exp"));
  if (!Number.isFinite(exp) || exp <= 0) return null;
  return new Date(exp * 1000);
}

export type ResolveTransport = (
  url: string,
  signal: AbortSignal,
) => Promise<{ url: string; location?: string; text?: string }>;

async function redirectTransport(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    signal,
    redirect: "manual",
    credentials: "include",
    headers: {
      "User-Agent": "SeriesDownloaderCLI/1.0",
      Accept: "*/*",
    },
  });
  const location = response.headers.get("location") ?? undefined;
  if (location) {
    response.body?.cancel().catch(() => undefined);
    return { url, location: new URL(location, url).href };
  }
  if (!response.ok)
    throw new Error(
      `HTTP ${response.status}. The file host may be unavailable or blocking requests.`,
    );
  const type = response.headers.get("content-type") ?? "";
  const text = /text\/|html/i.test(type) ? await response.text() : undefined;
  if (text === undefined) response.body?.cancel().catch(() => undefined);
  return { url: response.url || url, text };
}

function looksLikeMedia(url: string) {
  return /\.(mp4|mkv|m4v|mov|webm|avi|ts)(\?|$)/i.test(url);
}

export class MovieClient {
  readonly baseUrl: string;
  private cache = new Map<string, MovieEntry[]>();
  private transport: Transport;
  private hops: ResolveTransport;

  constructor(
    baseUrl: string,
    transport?: Transport,
    hops: ResolveTransport = redirectTransport,
  ) {
    this.baseUrl = normalizeBase(baseUrl);
    this.transport =
      transport ??
      (async (url, signal) => {
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
        return { text: await response.text(), url: response.url || url };
      });
    this.hops = hops;
  }

  private async fetchPage(url: string, signal: AbortSignal): Promise<Page> {
    if (signal.aborted) throw new Error("Cancelled.");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener("abort", cancel);
    const timeout = setTimeout(cancel, 15000);
    try {
      const page = await this.transport(url, controller.signal);
      if (signal.aborted) throw new Error("Cancelled.");
      if (controller.signal.aborted)
        throw new Error("Request timed out after 15 seconds.");
      return page;
    } catch (error) {
      if (signal.aborted) throw new Error("Cancelled.");
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
    signal: AbortSignal,
    progress: (text: string) => void,
    refresh = false,
  ): Promise<MoviePage> {
    if (!refresh && this.cache.has(url)) {
      const first = await this.fetchPage(url, signal);
      return {
        info: parseInfo(parseDocument(first.text), first.url),
        entries: this.cache.get(url)!,
        total: 1,
        url: first.url,
      };
    }
    progress("Loading page 1…");
    const first = await this.fetchPage(url, signal);
    const parsed = parseMoviePage(first.text, first.url);
    const entries = parsed.entries;
    const remaining = parsed.total - 1;
    if (remaining > 0) {
      const pages: MovieEntry[][] = new Array(remaining);
      let next = 2;
      let done = 0;
      progress(`Loading page 1 of ${parsed.total}…`);
      const worker = async () => {
        for (;;) {
          const page = next++;
          if (page > parsed.total) return;
          if (signal.aborted) throw new Error("Cancelled.");
          const target = new URL(url);
          target.searchParams.set("page", String(page));
          const response = await this.fetchPage(target.href, signal);
          pages[page - 2] = parseMoviePage(response.text, response.url)
            .entries;
          done++;
          progress(`Loading page ${done + 1} of ${parsed.total}…`);
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(PAGE_CONCURRENCY, remaining) },
          worker,
        ),
      );
      for (const page of pages) if (page) entries.push(...page);
    }
    const unique = [
      ...new Map(entries.map((entry) => [entry.url, entry])).values(),
    ];
    if (signal.aborted) throw new Error("Cancelled.");
    if (this.cache.size >= 30) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(url, unique);
    return { info: parsed.info, entries: unique, total: parsed.total, url: first.url };
  }

  /** Walks the download page chain until a playable media URL is reached. */
  async downloadLink(url: string, signal: AbortSignal): Promise<string> {
    let current = url;
    for (let step = 0; step < 6; step++) {
      if (signal.aborted) throw new Error("Cancelled.");
      const page = await this.fetchPage(current, signal);
      const { downloads } = parseDownloadLinks(page.text, page.url);
      const next = downloads[0]?.url;
      if (!next)
        throw new Error(
          "Could not find a download link. The website may have changed or requires browser verification.",
        );
      const hop = await this.hops(next, signal);
      if (hop.location) {
        current = hop.location;
        if (looksLikeMedia(current)) return current;
        continue;
      }
      if (looksLikeMedia(hop.url)) return hop.url;
      current = hop.url;
    }
    throw new Error("Too many redirects while resolving the file link.");
  }
}
