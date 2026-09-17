import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import { useFocusEffect } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    BackHandler,
    FlatList,
    Keyboard,
    Linking,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
    buildReport,
    DEFAULT_BASE,
    errorMessage,
    parseSelection,
    searchEntries,
    SeriesClient,
    type Entry,
    type Result,
} from "@/lib/series-client";

type Folder = { title: string; url: string; entries: Entry[]; query: string };
type Batch = {
  heading: string;
  generated: string;
  episodes: Entry[];
  results: Result[];
};
const color = {
  bg: "#0C111B",
  card: "#151D2C",
  border: "#29364A",
  text: "#F0F4FC",
  muted: "#A3B0C6",
  accent: "#B4F272",
  ink: "#172511",
  error: "#FFACAC",
};

function Action({
  title,
  onPress,
  disabled = false,
  primary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        (disabled || pressed) && styles.dim,
      ]}
    >
      <Text style={[styles.buttonText, primary && { color: color.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export default function SeriesBrowser() {
  const [base, setBase] = useState(DEFAULT_BASE);
  const [client, setClient] = useState<SeriesClient | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [range, setRange] = useState("");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const retry = useRef<(() => void) | null>(null);
  const current = folders[folders.length - 1];
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const visible = searchEntries(
    current?.entries ?? [],
    current?.query ?? "",
    sortOrder,
  );
  const episodes = visible.filter((entry) => entry.kind === "episode");
  const heading = folders.map((folder) => folder.title).join(" › ");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);

  const back = useCallback(() => {
    if (active.current) {
      active.current.abort();
      return true;
    }
    if (batch) {
      setBatch(null);
      setError("");
      setNotice("");
      return true;
    }
    if (folders.length > 1) {
      setFolders((items) => items.slice(0, -1));
      setSelected(new Set());
      setRange("");
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
  }, [batch, folders.length]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        back,
      );
      return () => subscription.remove();
    }, [back]),
  );

  async function load(url?: string, title = "Series", refresh = false) {
    if (active.current || Platform.OS === "web") return;
    Keyboard.dismiss();
    setError("");
    setNotice("");
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    retry.current = () => {
      void load(url, title, refresh);
    };
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
      const folder = {
        title,
        url: target,
        entries,
        query: refresh ? (current?.query ?? "") : "",
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
      setRange("");
    } catch (exception) {
      if (mounted.current) {
        if (controller.signal.aborted) setNotice("Loading cancelled.");
        else setError(errorMessage(exception));
      }
    } finally {
      if (active.current === controller) active.current = null;
      if (mounted.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }

  async function resolve(items: Entry[], previous?: Batch) {
    if (!client || !items.length || active.current) return;
    Keyboard.dismiss();
    const controller = new AbortController();
    active.current = controller;
    const next: Batch = {
      heading: previous?.heading ?? heading,
      generated: previous?.generated ?? new Date().toISOString(),
      episodes: previous?.episodes ?? items,
      results:
        previous?.results.filter(
          (result) => !items.some((item) => item.url === result.episode.url),
        ) ?? [],
    };
    setBatch({ ...next, results: [...next.results] });
    setBusy(true);
    setError("");
    setNotice("");
    try {
      for (let index = 0; index < items.length; index++) {
        if (controller.signal.aborted) break;
        const episode = items[index];
        setProgress(
          `Resolving ${index + 1} of ${items.length} · ${episode.title}`,
        );
        try {
          const link = await client.downloadLink(
            episode.url,
            controller.signal,
          );
          next.results.push({ episode, link });
        } catch (exception) {
          if (controller.signal.aborted) break;
          next.results.push({ episode, error: errorMessage(exception) });
        }
        if (mounted.current) setBatch({ ...next, results: [...next.results] });
      }
    } finally {
      if (active.current === controller) active.current = null;
      if (mounted.current) {
        setBusy(false);
        setProgress("");
        if (controller.signal.aborted)
          setNotice("Cancelled. Completed results are kept below.");
      }
    }
  }

  async function copy(text: string) {
    try {
      if (!(await Clipboard.setStringAsync(text)))
        throw new Error("Clipboard is unavailable.");
      if (mounted.current) setNotice("Copied to clipboard.");
    } catch (exception) {
      Alert.alert("Could not copy", errorMessage(exception));
    }
  }

  async function exportReport() {
    if (!batch || !client || exporting) return;
    setExporting(true);
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error(
          "File sharing is unavailable. Use Copy report instead.",
        );
      const file = new File(Paths.cache, `series-links-${Date.now()}.txt`);
      file.create();
      file.write(
        buildReport(
          client.baseUrl,
          batch.heading,
          batch.results,
          batch.episodes.length,
          batch.generated,
        ),
      );
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/plain",
        UTI: "public.plain-text",
        dialogTitle: "Export download links",
      });
    } catch (exception) {
      Alert.alert("Could not export", errorMessage(exception));
    } finally {
      if (mounted.current) setExporting(false);
    }
  }

  function toggle(entry: Entry) {
    if (entry.kind === "folder") {
      if (folders.some((folder) => folder.url === entry.url)) {
        setNotice("Already browsing this folder.");
        return;
      }
      void load(entry.url, entry.title);
    } else {
      setSelected((old) => {
        const next = new Set(old);
        if (next.has(entry.url)) next.delete(entry.url);
        else next.add(entry.url);
        return next;
      });
    }
  }

  function applyRange() {
    try {
      const picked = parseSelection(range, visible.length).map(
        (index) => visible[index],
      );
      if (picked.some((entry) => entry.kind !== "episode"))
        throw new Error(
          "Ranges may only include episodes. Open folders one at a time.",
        );
      setSelected(new Set(picked.map((entry) => entry.url)));
      setError("");
    } catch (exception) {
      retry.current = null;
      setError(errorMessage(exception));
    }
  }

  const summary = batch
    ? `${batch.results.filter((result) => result.link).length} ready · ${batch.results.filter((result) => result.error).length} failed · ${batch.episodes.length - batch.results.length} remaining`
    : "";

  const header = (
    <View style={styles.header}>
      <View style={styles.topline}>
        <Text style={styles.brand}>Tamil Web Series</Text>
        <Text style={styles.pill}>DIRECT</Text>
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Created by gdhanush27. Open GitHub profile"
        onPress={() => {
          void Linking.openURL("https://github.com/gdhanush27").catch(
            (exception) =>
              Alert.alert("Could not open GitHub", errorMessage(exception)),
          );
        }}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={styles.url}>By @gdhanush27 · GitHub ↗</Text>
      </Pressable>
      <Text style={styles.title}>
        {batch
          ? "Your links."
          : current
            ? "Find your next\nseries."
            : "One place.\nEvery episode."}
      </Text>
      <Text style={styles.subtitle}>
        {batch ? summary : "Browse. Select. Export. Straight from your phone."}
      </Text>
      {Platform.OS === "web" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Open in Expo Go</Text>
          <Text style={styles.body}>
            This flow is for Android and iOS. Browser CORS can prevent direct
            website requests, so web fetching is disabled. No proxy or backend
            is used.
          </Text>
        </View>
      ) : !current ? (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>01 / CONNECT YOUR SOURCE</Text>
          <Text style={styles.cardTitle}>Website address</Text>
          <TextInput
            accessibilityLabel="Website address"
            style={styles.input}
            value={base}
            onChangeText={setBase}
            editable={!busy}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={DEFAULT_BASE}
            placeholderTextColor={color.muted}
            returnKeyType="go"
            onSubmitEditing={() => void load()}
          />
          <Action
            title="Browse series →"
            primary
            disabled={busy}
            onPress={() => void load()}
          />
          <Text style={styles.small}>
            Session only. No account, no backend. Use sources you have
            permission to access.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.row}>
            <Action
              title={
                batch
                  ? "← Episodes"
                  : folders.length > 1
                    ? "← Back"
                    : "← Source"
              }
              disabled={busy}
              onPress={back}
            />
            {!batch && (
              <Action
                title="Refresh"
                disabled={busy}
                onPress={() => void load(current.url, current.title, true)}
              />
            )}
          </View>
          <Text style={styles.small}>{batch?.heading ?? heading}</Text>
          {!batch && (
            <>
              <TextInput
                accessibilityLabel="Search this folder"
                value={current.query}
                editable={!busy}
                onChangeText={(query) =>
                  setFolders((items) =>
                    items.map((item, index) =>
                      index === items.length - 1 ? { ...item, query } : item,
                    ),
                  )
                }
                placeholder="Search titles, seasons, years…"
                placeholderTextColor={color.muted}
                style={styles.input}
                autoCorrect={false}
              />
              <View style={styles.row}>
                <Text style={styles.small}>Sort by name</Text>
                <Action
                  title="Name A–Z"
                  primary={sortOrder === "asc"}
                  disabled={busy}
                  onPress={() => {
                    setSortOrder("asc");
                    setRange("");
                  }}
                />
                <Action
                  title="Name Z–A"
                  primary={sortOrder === "desc"}
                  disabled={busy}
                  onPress={() => {
                    setSortOrder("desc");
                    setRange("");
                  }}
                />
              </View>
              <View style={styles.row}>
                <Text style={styles.eyebrow}>{visible.length} ITEMS</Text>
                <Text style={styles.small}>{selected.size} selected</Text>
              </View>
              {episodes.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.row}>
                    <Action
                      title="Select visible"
                      disabled={busy}
                      onPress={() =>
                        setSelected(
                          (old) =>
                            new Set([
                              ...old,
                              ...episodes.map((entry) => entry.url),
                            ]),
                        )
                      }
                    />
                    <Action
                      title="Clear"
                      disabled={busy || !selected.size}
                      onPress={() => setSelected(new Set())}
                    />
                  </View>
                  <Text style={styles.small}>
                    Or select by the displayed numbers. Selection is kept when
                    filtering.
                  </Text>
                  <View style={styles.row}>
                    <TextInput
                      accessibilityLabel="Episode numbers or ranges"
                      value={range}
                      onChangeText={setRange}
                      editable={!busy}
                      placeholder="1-3,5-6"
                      placeholderTextColor={color.muted}
                      style={[styles.input, styles.grow]}
                      autoCapitalize="none"
                    />
                    <Action
                      title="Apply"
                      disabled={busy || !range.trim()}
                      onPress={applyRange}
                    />
                  </View>
                </View>
              )}
            </>
          )}
          {batch && batch.results.length > 0 && (
            <View style={styles.card}>
              <View style={styles.row}>
                <Action
                  title="Share TXT"
                  primary
                  disabled={busy || exporting}
                  onPress={() => void exportReport()}
                />
                <Action
                  title="Copy report"
                  disabled={busy}
                  onPress={() =>
                    void copy(
                      buildReport(
                        client!.baseUrl,
                        batch.heading,
                        batch.results,
                        batch.episodes.length,
                        batch.generated,
                      ),
                    )
                  }
                />
              </View>
              <Text style={styles.small}>
                Links only — no media downloaded. Links can expire; resolve
                again if needed.
              </Text>
            </View>
          )}
        </>
      )}
      {!!error && (
        <View style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
          {!!retry.current && (
            <Action
              title="Try again"
              disabled={busy}
              onPress={() => retry.current?.()}
            />
          )}
        </View>
      )}
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      )}
      {busy && (
        <View style={styles.card}>
          <View style={styles.row}>
            <ActivityIndicator color={color.accent} />
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.body, styles.grow]}
            >
              {progress}
            </Text>
          </View>
          <Action title="Cancel" onPress={() => active.current?.abort()} />
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      {batch ? (
        <FlatList<Result>
          key="results"
          data={batch.results}
          keyExtractor={(item) => item.episode.url}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            !busy ? (
              <Text style={styles.empty}>
                No completed results yet. Go back to select episodes.
              </Text>
            ) : null
          }
          ListFooterComponent={
            !busy &&
            batch.episodes.some(
              (episode) =>
                !batch.results.some(
                  (result) => result.episode.url === episode.url && result.link,
                ),
            ) ? (
              <Action
                title="Retry failed / remaining"
                onPress={() =>
                  void resolve(
                    batch.episodes.filter(
                      (episode) =>
                        !batch.results.some(
                          (result) =>
                            result.episode.url === episode.url && result.link,
                        ),
                    ),
                    batch,
                  )
                }
              />
            ) : null
          }
          renderItem={({ item, index }) => (
            <View style={styles.result}>
              <Text style={styles.eyebrow}>
                {String(index + 1).padStart(2, "0")} /{" "}
                {item.link ? "READY" : "FAILED"}
              </Text>
              <Text style={styles.cardTitle}>{item.episode.title}</Text>
              <Text selectable style={item.link ? styles.url : styles.error}>
                {item.link ?? item.error}
              </Text>
              {item.link && (
                <View style={styles.row}>
                  <Action
                    title="Copy link"
                    onPress={() => void copy(item.link!)}
                  />
                  <Action
                    title="Open ↗"
                    onPress={() => {
                      void Linking.openURL(item.link!).catch((exception) =>
                        Alert.alert(
                          "Could not open link",
                          errorMessage(exception),
                        ),
                      );
                    }}
                  />
                </View>
              )}
            </View>
          )}
        />
      ) : (
        <FlatList<Entry>
          key="entries"
          data={Platform.OS === "web" ? [] : visible}
          keyExtractor={(item) => item.url}
          contentContainerStyle={styles.list}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          extraData={selected}
          ListEmptyComponent={
            current && !busy ? (
              <Text style={styles.empty}>No matches. Try another search.</Text>
            ) : null
          }
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => toggle(item)}
              disabled={busy}
              accessibilityRole={
                item.kind === "episode" ? "checkbox" : "button"
              }
              accessibilityLabel={`${index + 1}. ${item.title}`}
              accessibilityState={{
                checked:
                  item.kind === "episode" ? selected.has(item.url) : undefined,
                disabled: busy,
              }}
              style={({ pressed }) => [
                styles.entry,
                selected.has(item.url) && styles.selected,
                pressed && styles.dim,
              ]}
            >
              <Text style={styles.number}>
                {String(index + 1).padStart(2, "0")}
              </Text>
              <View style={styles.grow}>
                <Text style={styles.entryTitle}>{item.title}</Text>
                <Text style={styles.small}>
                  {item.kind === "folder" ? "Browse folder" : "Episode"}
                </Text>
              </View>
              <Text style={styles.check}>
                {item.kind === "folder"
                  ? "›"
                  : selected.has(item.url)
                    ? "✓"
                    : "○"}
              </Text>
            </Pressable>
          )}
        />
      )}
      {!batch && current && selected.size > 0 && (
        <View style={styles.dock}>
          <Action
            title={`Get ${selected.size} link${selected.size === 1 ? "" : "s"} →`}
            primary
            disabled={busy}
            onPress={() =>
              void resolve(
                current.entries.filter(
                  (entry) =>
                    entry.kind === "episode" && selected.has(entry.url),
                ),
              )
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  list: {
    padding: 22,
    paddingBottom: 36,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: 10,
  },
  header: { gap: 18, marginBottom: 14 },
  topline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 14,
  },
  brand: {
    color: color.text,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
  },
  pill: {
    color: color.accent,
    backgroundColor: "#213121",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    color: color.text,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "800",
    letterSpacing: -1.5,
  },
  subtitle: { color: color.muted, fontSize: 16, lineHeight: 24 },
  card: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    gap: 14,
  },
  cardTitle: {
    color: color.text,
    fontSize: 19,
    fontWeight: "700",
    lineHeight: 27,
  },
  eyebrow: {
    color: color.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  body: { color: color.muted, fontSize: 15, lineHeight: 23 },
  small: { color: color.muted, fontSize: 12, lineHeight: 19 },
  input: {
    backgroundColor: color.bg,
    color: color.text,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 50,
  },
  button: {
    backgroundColor: "#253148",
    borderRadius: 13,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: color.accent },
  buttonText: { color: color.text, fontWeight: "700", fontSize: 14 },
  dim: { opacity: 0.45 },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  grow: { flex: 1, minWidth: 80 },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: color.card,
    borderRadius: 17,
    padding: 17,
    borderWidth: 1,
    borderColor: color.border,
  },
  selected: { borderColor: color.accent, backgroundColor: "#1D2B26" },
  number: { color: color.muted, fontSize: 12, fontWeight: "700", minWidth: 23 },
  entryTitle: {
    color: color.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    marginBottom: 3,
  },
  check: { color: color.accent, fontSize: 25 },
  errorBox: {
    backgroundColor: "#37232A",
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  error: { color: color.error, fontSize: 14, lineHeight: 22 },
  notice: { color: color.accent, fontSize: 13, lineHeight: 20 },
  empty: { color: color.muted, textAlign: "center", padding: 25 },
  result: {
    backgroundColor: color.card,
    borderRadius: 20,
    padding: 19,
    gap: 13,
    borderWidth: 1,
    borderColor: color.border,
  },
  url: { color: color.accent, fontSize: 13, lineHeight: 21 },
  dock: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.bg,
  },
});
