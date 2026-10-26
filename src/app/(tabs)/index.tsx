import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
    Alert,
    BackHandler,
    FlatList,
    Platform,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HomeHeader, SourceRow } from "@/components/home";
import { useToast } from "@/components/toast";
import {
    Button,
    Card,
    EmptyState,
    Field,
    IconButton,
    Segmented,
    SkeletonList,
} from "@/components/ui";
import { radius, space, type Palette } from "@/constants/theme";
import { useSeries, type SortOrder } from "@/context/series-store";
import { useThemeColor, useThemedStyles } from "@/context/theme-store";
import { DEFAULT_BASE, type Entry } from "@/lib/series-client";

const SORTS = [
  { value: "default" as SortOrder, label: "Default" },
  { value: "asc" as SortOrder, label: "A–Z" },
  { value: "desc" as SortOrder, label: "Z–A" },
];

export default function BrowseScreen() {
  const router = useRouter();
  const toast = useToast();
  const color = useThemeColor();
  const styles = useThemedStyles(createStyles);
  const store = useSeries();
  const {
    base,
    current,
    folders,
    heading,
    visible,
    selected,
    setSelected,
    busy,
    progress,
    error,
    retry,
    patchFolder,
    load,
    resolve,
    cancel,
    goBack,
    savedUrls,
    queuedUrls,
    refreshBase,
    checkingBase,
  } = store;

  const [picking, setPicking] = useState(false);
  const episodes = visible.filter((entry) => entry.kind === "episode");

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (picking) {
            setPicking(false);
            setSelected(new Set());
            return true;
          }
          if (goBack()) return true;
          Alert.alert("Quit app?", "You are at the start of the flow.", [
            { text: "Stay", style: "cancel" },
            {
              text: "Quit",
              style: "destructive",
              onPress: () => BackHandler.exitApp(),
            },
          ]);
          return true;
        },
      );
      return () => subscription.remove();
    }, [goBack, picking, setSelected]),
  );

  function openEntry(entry: Entry) {
    if (entry.kind === "folder") {
      if (folders.some((folder) => folder.url === entry.url)) {
        toast("Already browsing this folder.");
        return;
      }
      void load(entry.url, entry.title);
      return;
    }
    if (!picking) {
      setPicking(true);
      setSelected(new Set([entry.url]));
      return;
    }
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(entry.url)) next.delete(entry.url);
      else next.add(entry.url);
      return next;
    });
  }

  async function getLinks() {
    const items = (current?.entries ?? []).filter(
      (entry) => entry.kind === "episode" && selected.has(entry.url),
    );
    if (!items.length) {
      setPicking(false);
      setSelected(new Set());
      return;
    }
    router.push("/results");
    await resolve(items);
  }

  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.list}>
          <HomeHeader
            brand="ZUNO"
            title="One place. Every episode."
            subtitle="Browse. Select. Export. Straight from your phone."
          />
          <Card>
            <Text style={styles.eyebrow}>MOBILE ONLY</Text>
            <Text style={styles.cardTitle}>Open in Expo Go</Text>
            <Text style={styles.body}>
              This flow is for Android and iOS. Browser CORS blocks direct
              website requests, so web fetching is disabled. No proxy or backend
              is used.
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  if (!current) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.list}>
          <HomeHeader
            brand="ZUNO"
            title="One place. Every episode."
            subtitle="Browse. Select. Export. Straight from your phone."
          />
          <Card>
            <Text style={styles.eyebrow}>01 / SOURCE</Text>
            <SourceRow
              base={base || DEFAULT_BASE}
              checking={checkingBase}
              disabled={busy}
              onRefresh={() => void refreshBase()}
            />
            <Button
              title={busy ? progress || "Connecting…" : "Browse series"}
              icon="arrow-forward"
              variant="primary"
              loading={busy}
              onPress={() => void load()}
            />
            <Text style={styles.small}>
              The source address is fetched automatically. Session only. No
              account, no backend. Use sources you have permission to access.
            </Text>
          </Card>
          {error ? (
            <Card style={styles.errorCard}>
              <Text accessibilityRole="alert" style={styles.errorText}>
                {error}
              </Text>
              {retry.current ? (
                <Button
                  title="Try again"
                  icon="refresh"
                  disabled={busy}
                  onPress={() => retry.current?.()}
                />
              ) : null}
            </Card>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.crumbRow}>
        <IconButton icon="arrow-back" label="Go back" onPress={goBack} />
        <Text numberOfLines={2} style={styles.crumbs}>
          {heading}
        </Text>
      </View>
      <Field
        label="Search this folder"
        value={current.query}
        editable={!busy}
        onChangeText={(query) => patchFolder({ query })}
        placeholder="Search titles, seasons, years…"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {episodes.length > 0 ? (
        <Segmented
          options={SORTS}
          value={current.sortOrder}
          disabled={busy}
          onChange={(sortOrder) => patchFolder({ sortOrder })}
        />
      ) : null}
      <View style={styles.metaRow}>
        <Text style={styles.eyebrow}>{visible.length} ITEMS</Text>
        {picking ? (
          <View style={styles.selectionActions}>
            <Text style={styles.small}>{selected.size} selected</Text>
            <IconButton
              icon="close"
              label="Clear episode selection"
              disabled={busy || !selected.size}
              onPress={() => {
                setPicking(false);
                setSelected(new Set());
              }}
            />
          </View>
        ) : episodes.length > 0 ? (
          <Text style={styles.small}>Tap an episode to start selecting</Text>
        ) : null}
      </View>
      {error ? (
        <Card style={styles.errorCard}>
          <Text accessibilityRole="alert" style={styles.errorText}>
            {error}
          </Text>
          {retry.current ? (
            <Button
              title="Try again"
              icon="refresh"
              disabled={busy}
              onPress={() => retry.current?.()}
            />
          ) : null}
        </Card>
      ) : null}
      {busy ? (
        <View style={styles.busyRow}>
          <Text
            accessibilityLiveRegion="polite"
            numberOfLines={1}
            style={[styles.small, styles.grow]}
          >
            {progress || "Working…"}
          </Text>
          <Button title="Cancel" icon="stop-circle" onPress={cancel} />
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <FlatList<Entry>
        data={busy && !visible.length ? [] : visible}
        keyExtractor={(item) => item.url}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        extraData={`${selected.size}:${picking}:${savedUrls.size}:${queuedUrls.size}`}
        refreshControl={
          <RefreshControl
            refreshing={false}
            tintColor={color.accent}
            colors={[color.accent]}
            onRefresh={() => void load(current.url, current.title, true)}
          />
        }
        ListEmptyComponent={
          busy ? (
            <SkeletonList />
          ) : (
            <EmptyState
              icon="search"
              title="No matches"
              body="Nothing here fits that search. Try a different term or clear the filter."
              action={
                current.query ? (
                  <Button
                    title="Clear search"
                    onPress={() => patchFolder({ query: "" })}
                  />
                ) : undefined
              }
            />
          )
        }
        renderItem={({ item, index }) => {
          const chosen = selected.has(item.url);
          const saved = savedUrls.has(item.url);
          const queued = !saved && queuedUrls.has(item.url);
          return (
            <Pressable
              onPress={() => openEntry(item)}
              onLongPress={() =>
                item.kind === "episode" && !picking ? openEntry(item) : null
              }
              disabled={busy}
              accessibilityRole={
                item.kind === "episode" && picking ? "checkbox" : "button"
              }
              accessibilityLabel={`${index + 1}. ${item.title}${
                saved ? ", downloaded" : queued ? ", queued" : ""
              }`}
              accessibilityHint={
                item.kind === "folder"
                  ? "Opens this folder"
                  : picking
                    ? "Toggles selection"
                    : "Starts selecting episodes"
              }
              accessibilityState={{
                checked:
                  item.kind === "episode" && picking ? chosen : undefined,
                disabled: busy,
              }}
              style={({ pressed }) => [
                styles.entry,
                chosen && styles.entrySelected,
                pressed && styles.entryPressed,
              ]}
            >
              <Text style={styles.number}>
                {String(index + 1).padStart(2, "0")}
              </Text>
              <View style={styles.grow}>
                <Text numberOfLines={2} style={styles.entryTitle}>
                  {item.title}
                </Text>
                <View style={styles.entryMeta}>
                  <Text style={styles.small}>
                    {item.kind === "folder" ? "Folder" : "Episode"}
                  </Text>
                  {saved || queued ? (
                    <View style={[styles.tag, saved && styles.tagSaved]}>
                      <Ionicons
                        name={saved ? "checkmark-circle" : "time-outline"}
                        size={11}
                        color={saved ? color.accent : color.muted}
                      />
                      <Text
                        style={[styles.tagText, saved && styles.tagTextSaved]}
                      >
                        {saved ? "Downloaded" : "Queued"}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.marker}>
                <Ionicons
                  name={
                    item.kind === "folder"
                      ? "chevron-forward"
                      : chosen
                        ? "checkmark-circle"
                        : picking
                          ? "ellipse-outline"
                          : "play-circle-outline"
                  }
                  size={22}
                  color={chosen ? color.accent : color.faint}
                />
              </View>
            </Pressable>
          );
        }}
      />
      {selected.size > 0 ? (
        <View style={styles.dock}>
          <Button
            title={`Get ${selected.size} link${selected.size === 1 ? "" : "s"}`}
            icon="link"
            variant="primary"
            grow
            disabled={busy}
            onPress={() => void getLinks()}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}


function createStyles(color: Palette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  grow: { flex: 1 },
  list: {
    padding: space.lg,
    paddingBottom: 96,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: space.sm,
  },
  header: { gap: space.md, marginBottom: space.sm },
  cardTitle: {
    color: color.text,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  eyebrow: {
    color: color.taupe,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  body: { color: color.muted, fontSize: 14, lineHeight: 22 },
  small: { color: color.muted, fontSize: 12, lineHeight: 18 },
  link: {
    color: color.text,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  selectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  crumbRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  crumbs: {
    flex: 1,
    color: color.text,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.card,
  },
  errorCard: { borderColor: color.errorBg, backgroundColor: color.errorBg },
  errorText: { color: color.error, fontSize: 13, lineHeight: 20 },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    minHeight: 64,
  },
  entrySelected: { borderColor: color.accent, backgroundColor: color.raised },
  entryPressed: { backgroundColor: color.raised },
  entryTitle: {
    color: color.text,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  entryMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.xs,
    marginTop: 4,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: color.rule,
  },
  tagSaved: { borderColor: color.accent },
  tagText: {
    color: color.muted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tagTextSaved: { color: color.accent },
  number: {
    color: color.faint,
    fontSize: 11,
    fontWeight: "600",
    width: 22,
    textAlign: "left",
    letterSpacing: 0.5,
  },
  marker: { width: 24, alignItems: "flex-end" },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    padding: space.md,
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.rule,
  },
  });
}
