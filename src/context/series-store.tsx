import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths } from "expo-file-system";
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
    DEFAULT_BASE,
    errorMessage,
    fetchRemoteBase,
    searchEntries,
    SeriesClient,
    type Entry,
    type Result,
} from "@/lib/series-client";

export type SortOrder = "default" | "asc" | "desc";
export type Folder = {
  title: string;
  url: string;
  entries: Entry[];
  query: string;
  sortOrder: SortOrder;
};
export type Batch = {
  heading: string;
  generated: string;
  episodes: Entry[];
  results: Result[];
};
export type QueueItem = {
  episode: Entry;
  mediaUrl: string;
  heading: string;
  status: "queued" | "downloading" | "failed";
  progress: number;
  error?: string;
};

const DOWNLOADS_KEY = "tamil-web-series:downloads";
const POSITIONS_KEY = "tamil-web-series:positions";
const BASE_KEY = "tamil-web-series:base";
const RESOLVE_CONCURRENCY = 4;

function sortResults(results: Result[], episodes: Entry[]): Result[] {
  const order = new Map(episodes.map((episode, index) => [episode.url, index]));
  return [...results].sort(
    (a, b) => (order.get(a.episode.url) ?? 0) - (order.get(b.episode.url) ?? 0),
  );
}

function useSeriesStore() {
  const toast = useToast();
  const [base, setBase] = useState(DEFAULT_BASE);
  const [checkingBase, setCheckingBase] = useState(false);
  const [client, setClient] = useState<SeriesClient | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [downloads, setDownloads] = useState<DownloadedEpisode[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeDownloadUrl, setActiveDownloadUrl] = useState<string | null>(
    null,
  );
  const [positions, setPositions] = useState<Record<string, number>>({});

  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const retry = useRef<(() => void) | null>(null);
  const baseEdited = useRef(false);

  const current = folders[folders.length - 1];
  const heading = folders.map((folder) => folder.title).join(" › ");
  const visible = useMemo(
    () =>
      searchEntries(
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
      if (cached && !baseEdited.current) setBase(cached);
      try {
        const remote = await fetchRemoteBase(controller.signal);
        if (!mounted.current || baseEdited.current) return;
        setBase(remote);
        void AsyncStorage.setItem(BASE_KEY, remote);
      } catch {
        // Offline or the list moved; the cached or default domain still works.
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
          // App container paths change between installs, so re-resolve by name.
          const current = new File(Paths.document, item.fileName);
          if (!current.exists) return [];
          return current.uri === item.fileUri
            ? [item]
            : [{ ...item, fileUri: current.uri }];
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
          // Ignore corrupt resume data; playback simply starts from zero.
        }
      })
      .catch(() =>
        toast("Could not restore the local library.", { tone: "error" }),
      );
  }, [toast]);

  const patchFolder = useCallback((patch: Partial<Folder>) => {
    setFolders((items) =>
      items.map((item, index) =>
        index === items.length - 1 ? { ...item, ...patch } : item,
      ),
    );
  }, []);

  const cancel = useCallback(() => active.current?.abort(), []);

  const load = useCallback(
    async (url?: string, title = "Series", refresh = false) => {
      if (active.current || Platform.OS === "web") return;
      Keyboard.dismiss();
      setError("");
      const controller = new AbortController();
      active.current = controller;
      setBusy(true);
      retry.current = () => void load(url, title, refresh);
      const snapshot = folders[folders.length - 1];
      try {
        const source =
          url && client ? client : new SeriesClient(base || DEFAULT_BASE);
        const target = url ?? `${source.baseUrl}/tamil-web-series-download/`;
        const catalog = !url || (refresh && folders.length === 1);
        const entries = await source.listing(
          target,
          catalog,
          controller.signal,
          (text) => {
            if (mounted.current) setProgress(text);
          },
          refresh,
        );
        if (!mounted.current || controller.signal.aborted) return;
        if (!entries.length)
          throw new Error(
            "No folders or episodes found. Check the source URL; the site layout may have changed.",
          );
        const folder: Folder = {
          title,
          url: target,
          entries,
          query: refresh ? (snapshot?.query ?? "") : "",
          sortOrder: refresh
            ? (snapshot?.sortOrder ?? "default")
            : entries.some((entry) => entry.kind === "episode")
              ? "desc"
              : "default",
        };
        setClient(source);
        setFolders((items) =>
          !url
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
    [base, client, folders, toast],
  );

  const resolve = useCallback(
    async (items: Entry[], previous?: Batch) => {
      if (!client || !items.length || active.current) return;
      Keyboard.dismiss();
      const controller = new AbortController();
      active.current = controller;
      const episodes = previous?.episodes ?? items;
      const next: Batch = {
        heading: previous?.heading ?? heading,
        generated: previous?.generated ?? new Date().toISOString(),
        episodes,
        results:
          previous?.results.filter(
            (result) => !items.some((item) => item.url === result.episode.url),
          ) ?? [],
      };
      setBatch({ ...next, results: [...next.results] });
      setBusy(true);
      setError("");
      try {
        let started = 0;
        let finished = 0;
        const worker = async () => {
          for (;;) {
            const index = started++;
            if (index >= items.length || controller.signal.aborted) return;
            const episode = items[index];
            setProgress(`Resolving ${finished + 1} of ${items.length}`);
            try {
              const link = await client.downloadLink(
                episode.url,
                controller.signal,
              );
              next.results.push({ episode, link });
            } catch (exception) {
              if (controller.signal.aborted) return;
              next.results.push({ episode, error: errorMessage(exception) });
            }
            finished++;
            if (mounted.current)
              setBatch({
                ...next,
                results: sortResults(next.results, episodes),
              });
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

  const resolveEpisodeLink = useCallback(
    async (episodeUrl: string, signal: AbortSignal) => {
      const source = client ?? new SeriesClient(base || DEFAULT_BASE);
      return source.downloadLink(episodeUrl, signal);
    },
    [base, client],
  );

  const enqueue = useCallback(
    (episode: Entry, mediaUrl: string, batchHeading: string) => {
      const existing = downloads.find(
        (item) => item.episodeUrl === episode.url,
      );
      if (existing && new File(existing.fileUri).exists) {
        toast("Already in Downloads.");
        return;
      }
      if (queue.some((item) => item.episode.url === episode.url)) {
        toast("Already in the download queue.");
        return;
      }
      setQueue((items) => [
        ...items,
        {
          episode,
          mediaUrl,
          heading: batchHeading,
          status: "queued",
          progress: 0,
        },
      ]);
      toast(`Queued ${episode.title}.`, { tone: "success" });
    },
    [downloads, queue, toast],
  );

  useEffect(() => {
    const queued = queue.find((item) => item.status === "queued");
    if (activeDownloadUrl || !queued) return;
    const episodeUrl = queued.episode.url;
    const destination = new File(
      Paths.document,
      downloadFileName(queued.episode.title, queued.mediaUrl),
    );
    setActiveDownloadUrl(episodeUrl);
    setQueue((items) =>
      items.map((item) =>
        item.episode.url === episodeUrl
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
                  item.episode.url === episodeUrl
                    ? { ...item, progress: bytesWritten / totalBytes }
                    : item,
                ),
              );
          },
        });
        const file = await task.downloadAsync();
        if (!file || !file.exists)
          throw new Error("The downloaded file could not be found.");
        const record: DownloadedEpisode = {
          episodeUrl,
          mediaUrl: queued.mediaUrl,
          title: queued.episode.title,
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
        setQueue((items) =>
          items.filter((item) => item.episode.url !== episodeUrl),
        );
        toast(`${queued.episode.title} saved.`, { tone: "success" });
      } catch (exception) {
        if (destination.exists) destination.delete();
        setQueue((items) =>
          items.map((item) =>
            item.episode.url === episodeUrl
              ? { ...item, status: "failed", error: errorMessage(exception) }
              : item,
          ),
        );
        toast(`Download failed: ${queued.episode.title}`, { tone: "error" });
      } finally {
        setActiveDownloadUrl(null);
      }
    })();
  }, [activeDownloadUrl, queue, toast]);

  const retryDownload = useCallback((episodeUrl: string) => {
    setQueue((items) =>
      items.map((item) =>
        item.episode.url === episodeUrl
          ? { ...item, status: "queued", progress: 0, error: undefined }
          : item,
      ),
    );
  }, []);

  const removeQueued = useCallback(
    (episodeUrl: string) => {
      if (episodeUrl === activeDownloadUrl) return;
      setQueue((items) =>
        items.filter((item) => item.episode.url !== episodeUrl),
      );
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

  const savePosition = useCallback((episodeUrl: string, seconds: number) => {
    setPositions((items) => {
      const next =
        seconds < 15
          ? omit(items, episodeUrl)
          : { ...items, [episodeUrl]: seconds };
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
      setClient(null);
      setSelected(new Set());
      setError("");
      return true;
    }
    return false;
  }, [folders.length]);

  const downloadingItem = queue.find((item) => item.status === "downloading");

  const savedUrls = useMemo(
    () => new Set(downloads.map((item) => item.episodeUrl)),
    [downloads],
  );
  const queuedUrls = useMemo(
    () => new Set(queue.map((item) => item.episode.url)),
    [queue],
  );

  const resolveDownload = useCallback(
    (episodeUrl: string): string | null => {
      const item = downloads.find(
        (download) => download.episodeUrl === episodeUrl,
      );
      if (!item) return null;
      const file = new File(Paths.document, item.fileName);
      if (!file.exists) return null;
      return Platform.OS === "android" ? file.contentUri : file.uri;
    },
    [downloads],
  );

  const changeBase = useCallback((value: string) => {
    baseEdited.current = true;
    setBase(value);
    void AsyncStorage.setItem(BASE_KEY, value);
  }, []);

  const refreshBase = useCallback(async () => {
    setCheckingBase(true);
    const controller = new AbortController();
    try {
      const remote = await fetchRemoteBase(controller.signal);
      if (!mounted.current) return;
      baseEdited.current = false;
      setBase(remote);
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
    setBase: changeBase,
    refreshBase,
    checkingBase,
    resolveDownload,
    client,
    folders,
    current,
    heading,
    visible,
    selected,
    setSelected,
    batch,
    setBatch,
    busy,
    progress,
    error,
    setError,
    retry,
    downloads,
    queue,
    downloadingItem,
    savedUrls,
    queuedUrls,
    positions,
    patchFolder,
    load,
    resolve,
    resolveEpisodeLink,
    cancel,
    enqueue,
    retryDownload,
    removeQueued,
    deleteDownload,
    savePosition,
    goBack,
  };
}

function omit(source: Record<string, number>, key: string) {
  const next = { ...source };
  delete next[key];
  return next;
}

type Store = ReturnType<typeof useSeriesStore>;
const SeriesContext = createContext<Store | null>(null);

export function SeriesProvider({ children }: { children: ReactNode }) {
  const store = useSeriesStore();
  return (
    <SeriesContext.Provider value={store}>{children}</SeriesContext.Provider>
  );
}

export function useSeries(): Store {
  const store = useContext(SeriesContext);
  if (!store) throw new Error("useSeries must be used inside SeriesProvider.");
  return store;
}
