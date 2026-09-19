export type DownloadedEpisode = {
  episodeUrl: string;
  mediaUrl?: string;
  title: string;
  heading: string;
  fileUri: string;
  fileName: string;
  size: number;
  downloadedAt: string;
};

export function compareEpisodeTitles(
  left: { title: string },
  right: { title: string },
): number {
  return left.title.localeCompare(right.title, "en", {
    numeric: true,
    sensitivity: "base",
  });
}

export function parseStoredList<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function upsertByEpisode<T extends { episodeUrl: string }>(
  items: readonly T[],
  item: T,
): T[] {
  return [
    item,
    ...items.filter((existing) => existing.episodeUrl !== item.episodeUrl),
  ];
}

const VIDEO_EXTENSIONS = [
  ".mp4",
  ".mkv",
  ".m4v",
  ".mov",
  ".webm",
  ".avi",
  ".ts",
];

export function downloadFileName(title: string, mediaUrl: string): string {
  let extension = ".mp4";
  try {
    const candidate = new URL(mediaUrl).pathname
      .match(/\.[a-z0-9]{2,5}$/i)?.[0]
      ?.toLowerCase();
    // Link hosts often end in .php or similar; only trust real media extensions.
    if (candidate && VIDEO_EXTENSIONS.includes(candidate))
      extension = candidate;
  } catch {
    // The resolved URL is validated elsewhere; retain a playable fallback extension.
  }
  const stem = title
    .normalize("NFKD")
    .replace(/[^a-z0-9 _-]/gi, "")
    .trim()
    .replace(/[ _]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return `${stem || "episode"}-${Date.now()}${extension}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
