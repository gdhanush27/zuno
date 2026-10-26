import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths, type DownloadTask } from "expo-file-system";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Keyboard, Platform } from "react-native";

import { useToast } from "@/components/toast";
import {
  downloadFileName,
  parseStoredList,
  upsertByEpisode,
  type DownloadedEpisode,
} from "@/lib/media-library";
import {
  LETTERS,
  MOVIES_PATH,
  MovieClient,
  NEW_MOVIES_PATH,
  SINGLE_PARTS_PATH,
  HD_MOBILE_PATH,
  YEARS,
  letterPath,
  yearPath,
  type MovieEntry,
  type MovieInfo,
} from "@/lib/movie-client";
import {
  DEFAULT_BASE,
  errorMessage,
  fetchRemoteBase,
  normalizeBase,
} from "@/lib/series-client";

export type MovieSort = "default" | "asc" | "desc";

export type MovieFolder = {
  title: string;
  url: string;
  entries: MovieEntry[];
  info: MovieInfo | null;
  query: string;
  sortOrder: MovieSort;
};

export type MovieResolved = {
  entry: MovieEntry;
  link?: string;
  error?: string;
};

export type MovieQueueItem = {
  entry: MovieEntry;
  mediaUrl: string;
  heading: string;
  status: "queued" | "downloading" | "failed";
  progress: number;
  error?: string;
};

const DOWNLOADS_KEY = "movies:downloads";
const POSITIONS_KEY = "movies:positions";
const BASE_KEY = "movies:base";
const RESOLVE_CONCURRENCY = 3;

function sortEntries(
  entries: readonly MovieEntry[],
  query: string,
  order: MovieSort,
): MovieEntry[] {
  const filtered = entries.filter((entry) =>
    entry.title.toLowerCase().includes(query.toLowerCase()),
  );
  if (order === "default") return filtered;
  return filtered.sort((a, b) => {
    const comparison = a.title.localeCompare(b.title, "en", {
      sensitivity: "base",
      numeric: true,
    });
    return order === "asc" ? comparison : -comparison;
  });
}

function useMovieStore() {
  const toast = useToast();
  const [base, setBaseState] = useState(DEFAULT_BASE);
  const [folders, setFolders] = useState<MovieFolder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<MovieResolved[]>([]);
  const [resultHeading, setResultHeading] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [downloads, setDownloads] = useState<DownloadedEpisode[]>([]);
  const [queue, setQueue] = useState<MovieQueueItem[]>([]);
  const [activeDownloadUrl, setActiveDownloadUrl] = useState<string | null>(
    null,
  );
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [checkingBase, setCheckingBase] = useState(false);

  const clientRef = useRef<MovieClient | null>(null);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const retry = useRef<(() => void) | null>(null);
  const activeTask = useRef<DownloadTask | null>(null);
  const cancelledUrls = useRef(new Set<string>());

  const current = folders[folders.length - 1];
  const heading = folders.map((folder) => folder.title).join(" › ");
  const visible = useMemo(
    () =>
      sortEntries(
        current?.entries ?? [],
        current?.query ?? "",
        current?.sortOrder ?? "default",
      ),
    [current],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const cached = await AsyncStorage.getItem(BASE_KEY).catch(() => null);
      if (!mounted.current) return;
      if (cached) setBaseState(cached);
      try {
        const remote = await fetchRemoteBase(controller.signal);
        if (!mounted.current) return;
        setBaseState(remote);
        void AsyncStorage.setItem(BASE_KEY, remote);
      } catch {
        // Keep the cached or default domain when the list is unreachable.
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    void AsyncStorage.multiGet([DOWNLOADS_KEY, POSITIONS_KEY])
      .then(([[, savedDownloads], [, savedPositions]]) => {
        if (!mounted.current) return;
        const stored = parseStoredList<DownloadedEpisode>(savedDownloads);
        const available = stored.flatMap((item) => {
          const file = new File(Paths.document, item.fileName);
          if (!file.exists) return [];
          return file.uri === item.fileUri
            ? [item]
            : [{ ...item, fileUri: file.uri }];
        });
        setDownloads(available);
        if (
          available.length !== stored.length ||
          available.some(
            (item, index) => item.fileUri !== stored[index].fileUri,
          )
        )
          void AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(available));
        try {
          const parsed: unknown = savedPositions
            ? JSON.parse(savedPositions)
            : {};
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            setPositions(parsed as Record<string, number>);
        } catch {
          // Corrupt resume data only costs the saved timestamp.
        }
      })
      .catch(() =>
        toast("Could not restore movie downloads.", { tone: "error" }),
      );
  }, [toast]);

  const client = useCallback(() => {
    if (!clientRef.current || clientRef.current.baseUrl !== normalizeBase(base))
      clientRef.current = new MovieClient(base || DEFAULT_BASE);
    return clientRef.current;
  }, [base]);

  const patchFolder = useCallback((patch: Partial<MovieFolder>) => {
    setFolders((items) =>
      items.map((item, index) =>
        index === items.length - 1 ? { ...item, ...patch } : item,
      ),
    );
  }, []);

  const cancel = useCallback(() => active.current?.abort(), []);

  const load = useCallback(
    async (path?: string, title = "Movies", refresh = false) => {
      if (active.current || Platform.OS === "web") return;
      Keyboard.dismiss();
      setError("");
      const controller = new AbortController();
      active.current = controller;
      setBusy(true);
      const snapshot = folders[folders.length - 1];
      retry.current = () => void load(path, title, refresh);
      try {
        const source = client();
        const target = new URL(path ?? MOVIES_PATH, source.baseUrl).href;
        const page = await source.listing(
          target,
          controller.signal,
          (text) => {
            if (mounted.current) setProgress(text);
          },
          refresh,
        );
        if (!mounted.current || controller.signal.aborted) return;
        if (!page.entries.length)
          throw new Error(
            "No movies found. Check the source URL; the site layout may have changed.",
          );
        // A movie's details page opens its download sub-folders, which have no
        // <h1>. Inherit the nearest ancestor details so the banner and synopsis
        // stay visible all the way down.
        const inherited = page.info
          ? null
          : [...folders].reverse().find((folder) => folder.info)?.info;
        const folder: MovieFolder = {
          title,
          url: page.url,
          entries: page.entries,
          info: page.info ?? inherited ?? null,
          query: refresh ? (snapshot?.query ?? "") : "",
          sortOrder: refresh ? (snapshot?.sortOrder ?? "default") : "default",
        };
        setFolders((items) =>
          !path
            ? [folder]
            : refresh
              ? [...items.slice(0, -1), folder]
              : [...items, folder],
        );
        setSelected(new Set());
      } catch (exception) {
        if (mounted.current) {
          if (controller.signal.aborted) toast("Loading cancelled.");
          else setError(errorMessage(exception));
        }
      } finally {
        if (active.current === controller) active.current = null;
        if (mounted.current) {
          setBusy(false);
          setProgress("");
        }
      }
    },
    [client, folders, toast],
  );

  const openLetter = useCallback(
    (letter: string) => {
      const normalized = letter.toLowerCase();
      if (!LETTERS.includes(normalized)) return;
      void load(letterPath(normalized), `${normalized.toUpperCase()} · Movies`);
    },
    [load],
  );

  const openNew = useCallback(() => {
    void load(NEW_MOVIES_PATH, "New Releases");
  }, [load]);

  const openYear = useCallback(
    (year: number) => {
      if (!YEARS.includes(year)) return;
      void load(yearPath(year), `${year} · Movies`);
    },
    [load],
  );

  const openPath = useCallback(
    (path: string, title: string) => {
      void load(path, title);
    },
    [load],
  );

  const openEntry = useCallback(
    (entry: MovieEntry) => {
      if (entry.kind === "folder") {
        if (folders.some((folder) => folder.url === entry.url)) {
          toast("Already browsing this folder.");
          return;
        }
        void load(entry.url, entry.title);
      }
    },
    [folders, load, toast],
  );

  const resolve = useCallback(
    async (items: MovieEntry[]) => {
      if (!items.length || active.current) return;
      Keyboard.dismiss();
      const controller = new AbortController();
      active.current = controller;
      const source = client();
      const next: MovieResolved[] = [];
      setResults([]);
      setResultHeading(heading || "Movies");
      setBusy(true);
      setError("");
      try {
        let started = 0;
        let finished = 0;
        const worker = async () => {
          for (;;) {
            const index = started++;
            if (index >= items.length || controller.signal.aborted) return;
            const entry = items[index];
            setProgress(`Resolving ${finished + 1} of ${items.length}`);
            try {
              const link = await source.downloadLink(
                entry.url,
                controller.signal,
              );
              next.push({ entry, link });
            } catch (exception) {
              if (controller.signal.aborted) return;
              next.push({ entry, error: errorMessage(exception) });
            }
            finished++;
            if (mounted.current) setResults([...next]);
          }
        };
        await Promise.all(
          Array.from(
            { length: Math.min(RESOLVE_CONCURRENCY, items.length) },
            worker,
          ),
        );
      } finally {
        if (active.current === controller) active.current = null;
        if (mounted.current) {
          setBusy(false);
          setProgress("");
          if (controller.signal.aborted)
            toast("Cancelled. Completed results are kept.");
        }
      }
    },
    [client, heading, toast],
  );

  const resolveEntryLink = useCallback(
    async (entryUrl: string, signal: AbortSignal) =>
      client().downloadLink(entryUrl, signal),
    [client],
  );

  const enqueue = useCallback(
    (entry: MovieEntry, mediaUrl: string, batchHeading: string) => {
      const existing = downloads.find((item) => item.episodeUrl === entry.url);
      if (existing && new File(existing.fileUri).exists) {
        toast("Already in Downloads.");
        return;
      }
      if (queue.some((item) => item.entry.url === entry.url)) {
        toast("Already in the download queue.");
        return;
      }
      setQueue((items) => [
        ...items,
        {
          entry,
          mediaUrl,
          heading: batchHeading,
          status: "queued",
          progress: 0,
        },
      ]);
      toast(`Queued ${entry.title}.`, { tone: "success" });
    },
    [downloads, queue, toast],
  );

  useEffect(() => {
    const queued = queue.find((item) => item.status === "queued");
    if (activeDownloadUrl || !queued) return;
    const entryUrl = queued.entry.url;
    const destination = new File(
      Paths.document,
      downloadFileName(queued.entry.title, queued.mediaUrl),
    );
    setActiveDownloadUrl(entryUrl);
    setQueue((items) =>
      items.map((item) =>
        item.entry.url === entryUrl
          ? { ...item, status: "downloading", progress: 0 }
          : item,
      ),
    );
    void (async () => {
      try {
        const task = File.createDownloadTask(queued.mediaUrl, destination, {
          onProgress: ({ bytesWritten, totalBytes }) => {
            if (totalBytes > 0)
              setQueue((items) =>
                items.map((item) =>
                  item.entry.url === entryUrl
                    ? { ...item, progress: bytesWritten / totalBytes }
                    : item,
                ),
              );
          },
        });
        activeTask.current = task;
        const file = await task.downloadAsync();
        if (cancelledUrls.current.has(entryUrl)) return;
        if (!file || !file.exists)
          throw new Error("The downloaded file could not be found.");
        const record: DownloadedEpisode = {
          episodeUrl: entryUrl,
          mediaUrl: queued.mediaUrl,
          title: queued.entry.title,
          heading: queued.heading,
          fileUri: file.uri,
          fileName: file.name,
          size: file.size,
          downloadedAt: new Date().toISOString(),
        };
        setDownloads((items) => {
          const nextDownloads = upsertByEpisode(items, record);
          void AsyncStorage.setItem(
            DOWNLOADS_KEY,
            JSON.stringify(nextDownloads),
          );
          return nextDownloads;
        });
        setQueue((items) => items.filter((item) => item.entry.url !== entryUrl));
        toast(`${queued.entry.title} saved.`, { tone: "success" });
      } catch (exception) {
        if (destination.exists) destination.delete();
        if (cancelledUrls.current.has(entryUrl)) {
          cancelledUrls.current.delete(entryUrl);
          return;
        }
        setQueue((items) =>
          items.map((item) =>
            item.entry.url === entryUrl
              ? { ...item, status: "failed", error: errorMessage(exception) }
              : item,
          ),
        );
        toast(`Download failed: ${queued.entry.title}`, { tone: "error" });
      } finally {
        activeTask.current = null;
        setActiveDownloadUrl(null);
      }
    })();
  }, [activeDownloadUrl, queue, toast]);

  const retryDownload = useCallback((entryUrl: string) => {
    setQueue((items) =>
      items.map((item) =>
        item.entry.url === entryUrl
          ? { ...item, status: "queued", progress: 0, error: undefined }
          : item,
      ),
    );
  }, []);

  const removeQueued = useCallback(
    (entryUrl: string) => {
      if (entryUrl === activeDownloadUrl) {
        cancelledUrls.current.add(entryUrl);
        activeTask.current?.cancel();
      }
      setQueue((items) => items.filter((item) => item.entry.url !== entryUrl));
    },
    [activeDownloadUrl],
  );

  const deleteDownload = useCallback(
    async (item: DownloadedEpisode) => {
      const file = new File(item.fileUri);
      if (file.exists) file.delete();
      const next = downloads.filter(
        (entry) => entry.episodeUrl !== item.episodeUrl,
      );
      setDownloads(next);
      await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(next));
      toast(`Deleted ${item.title}.`, { tone: "success" });
    },
    [downloads, toast],
  );

  const savePosition = useCallback((entryUrl: string, seconds: number) => {
    setPositions((items) => {
      const next = { ...items };
      if (seconds < 15) delete next[entryUrl];
      else next[entryUrl] = seconds;
      void AsyncStorage.setItem(POSITIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const goBack = useCallback(() => {
    if (active.current) {
      active.current.abort();
      return true;
    }
    if (folders.length > 1) {
      setFolders((items) => items.slice(0, -1));
      setSelected(new Set());
      setError("");
      return true;
    }
    if (folders.length) {
      setFolders([]);
      setSelected(new Set());
      setError("");
      return true;
    }
    return false;
  }, [folders.length]);

  const savedUrls = useMemo(
    () => new Set(downloads.map((item) => item.episodeUrl)),
    [downloads],
  );
  const queuedUrls = useMemo(
    () => new Set(queue.map((item) => item.entry.url)),
    [queue],
  );

  const resolveDownload = useCallback(
    (entryUrl: string): string | null => {
      const item = downloads.find(
        (download) => download.episodeUrl === entryUrl,
      );
      if (!item) return null;
      const file = new File(Paths.document, item.fileName);
      if (!file.exists) return null;
      return Platform.OS === "android" ? file.contentUri : file.uri;
    },
    [downloads],
  );

  const setBase = useCallback((value: string) => {
    setBaseState(value);
    void AsyncStorage.setItem(BASE_KEY, value);
  }, []);

  const refreshBase = useCallback(async () => {
    setCheckingBase(true);
    const controller = new AbortController();
    try {
      const remote = await fetchRemoteBase(controller.signal);
      if (!mounted.current) return;
      setBaseState(remote);
      void AsyncStorage.setItem(BASE_KEY, remote);
      toast(
        remote === base
          ? "Already on the latest address."
          : `Updated to ${remote}.`,
        { tone: "success" },
      );
    } catch (exception) {
      if (mounted.current) toast(errorMessage(exception), { tone: "error" });
    } finally {
      if (mounted.current) setCheckingBase(false);
    }
  }, [base, toast]);

  return {
    base,
    setBase,
    refreshBase,
    checkingBase,
    folders,
    current,
    heading,
    visible,
    selected,
    setSelected,
    results,
    resultHeading,
    busy,
    progress,
    error,
    setError,
    retry,
    downloads,
    queue,
    savedUrls,
    queuedUrls,
    positions,
    patchFolder,
    load,
    openLetter,
    openNew,
    openYear,
    openPath,
    openEntry,
    resolve,
    resolveEntryLink,
    cancel,
    enqueue,
    retryDownload,
    removeQueued,
    deleteDownload,
    savePosition,
    resolveDownload,
    goBack,
  };
}

type Store = ReturnType<typeof useMovieStore>;
const MovieContext = createContext<Store | null>(null);

export function MovieProvider({ children }: { children: ReactNode }) {
  const store = useMovieStore();
  return (
    <MovieContext.Provider value={store}>{children}</MovieContext.Provider>
  );
}

export function useMovies(): Store {
  const store = useContext(MovieContext);
  if (!store) throw new Error("useMovies must be used inside MovieProvider.");
  return store;
}
