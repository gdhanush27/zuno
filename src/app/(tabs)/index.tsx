import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
    Alert,
    BackHandler,
    FlatList,
    Linking,
    Platform,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
import { color, radius, space } from "@/constants/theme";
import { useSeries, type SortOrder } from "@/context/series-store";
import { DEFAULT_BASE, errorMessage, type Entry } from "@/lib/series-client";

const SORTS = [
  { value: "default" as SortOrder, label: "Default" },
  { value: "asc" as SortOrder, label: "A–Z" },
  { value: "desc" as SortOrder, label: "Z–A" },
];

export default function BrowseScreen() {
  const router = useRouter();
  const toast = useToast();
  const store = useSeries();
  const {
    base,
    setBase,
    current,
    folders,
    heading,
    visible,
    selected,
    setSelected,
    busy,
    progress,
    error,
    setError,
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
          <Brand />
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
          <Brand />
          <Text style={styles.title}>One place. Every episode.</Text>
          <Text style={styles.subtitle}>
            Browse. Select. Export. Straight from your phone.
          </Text>
          <Card>
            <Text style={styles.eyebrow}>01 / CONNECT YOUR SOURCE</Text>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, styles.grow]}>
                Website address
              </Text>
              <IconButton
                icon="cloud-download-outline"
                label="Check for a new website address"
                onPress={() => void refreshBase()}
                disabled={busy || checkingBase}
              />
            </View>
            <Field
              label="Website address"
              value={base}
              onChangeText={setBase}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder={DEFAULT_BASE}
              returnKeyType="go"
              onSubmitEditing={() => void load()}
            />
            <Button
              title={busy ? progress || "Connecting…" : "Browse series"}
              icon="arrow-forward"
              variant="primary"
              loading={busy}
              onPress={() => void load()}
            />
            <Text style={styles.small}>
              Session only. No account, no backend. Use sources you have
              permission to access.
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

function Brand() {
  return (
    <View style={styles.topline}>
      <Text style={styles.brand}>TAMIL WEB SERIES</Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Created by gdhanush27. Open GitHub profile"
        hitSlop={8}
        onPress={() => {
          void Linking.openURL("https://github.com/gdhanush27").catch(
            (exception) =>
              Alert.alert("Could not open GitHub", errorMessage(exception)),
          );
        }}
      >
        <Text style={styles.pill}>@gdhanush27 ↗</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  topline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  brand: {
    color: color.text,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  pill: {
    color: color.accent,
    backgroundColor: "#1E2C1B",
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    fontSize: 11,
    fontWeight: "800",
  },
  title: {
    color: color.text,
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "800",
    letterSpacing: -1,
  },
  subtitle: {
    color: color.muted,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: space.xs,
  },
  cardTitle: { color: color.text, fontSize: 18, fontWeight: "700" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  eyebrow: {
    color: color.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  body: { color: color.muted, fontSize: 15, lineHeight: 23 },
  small: { color: color.muted, fontSize: 12, lineHeight: 18 },
  link: { color: color.accent, fontSize: 12, fontWeight: "800" },
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
  crumbs: { flex: 1, color: color.text, fontSize: 16, fontWeight: "700" },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.card,
  },
  errorCard: { borderColor: "#5A2B33", backgroundColor: color.errorBg },
  errorText: { color: color.error, fontSize: 14, lineHeight: 21 },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: 64,
  },
  entrySelected: { borderColor: color.accent, backgroundColor: color.raised },
  entryPressed: { backgroundColor: color.raised },
  entryTitle: { color: color.text, fontSize: 15, fontWeight: "600" },
  entryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    marginTop: 3,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: color.raised,
  },
  tagSaved: { backgroundColor: "#1E2C1B" },
  tagText: { color: color.muted, fontSize: 10, fontWeight: "800" },
  tagTextSaved: { color: color.accent },
  number: {
    color: color.faint,
    fontSize: 12,
    fontWeight: "800",
    width: 24,
    textAlign: "center",
  },
  marker: { width: 26, alignItems: "center" },
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    padding: space.md,
    backgroundColor: color.card,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
});
