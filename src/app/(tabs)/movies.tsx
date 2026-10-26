import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  BackHandler,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HomeHeader, SourceRow } from "@/components/home";
import { useToast } from "@/components/toast";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Poster,
  Segmented,
  SkeletonList,
} from "@/components/ui";
import { radius, space, type Palette } from "@/constants/theme";
import { useMovies, type MovieSort } from "@/context/movie-store";
import { useThemeColor, useThemedStyles } from "@/context/theme-store";
import {
  HD_MOBILE_PATH,
  LETTERS,
  SINGLE_PARTS_PATH,
  YEARS,
  type MovieEntry,
} from "@/lib/movie-client";

const SORTS = [
  { value: "default" as MovieSort, label: "Default" },
  { value: "asc" as MovieSort, label: "A–Z" },
  { value: "desc" as MovieSort, label: "Z–A" },
];

export default function MoviesScreen() {
  const router = useRouter();
  const toast = useToast();
  const color = useThemeColor();
  const styles = useThemedStyles(createStyles);
  const {
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
    openLetter,
    openNew,
    openYear,
    openPath,
    openEntry,
    resolve,
    cancel,
    goBack,
    savedUrls,
    queuedUrls,
    base,
    refreshBase,
    checkingBase,
  } = useMovies();

  const [picking, setPicking] = useState(false);
  const files = visible.filter((entry) => entry.kind === "file");

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
          return goBack();
        },
      );
      return () => subscription.remove();
    }, [goBack, picking, setSelected]),
  );

  function press(entry: MovieEntry) {
    if (entry.kind === "folder") {
      if (folders.some((folder) => folder.url === entry.url)) {
        toast("Already browsing this folder.");
        return;
      }
      openEntry(entry);
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
      (entry) => entry.kind === "file" && selected.has(entry.url),
    );
    if (!items.length) {
      setPicking(false);
      setSelected(new Set());
      return;
    }
    router.push("/movie-results");
    await resolve(items);
  }

  if (Platform.OS === "web")
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.list}>
          <HomeHeader
            brand="ZUNO"
            title="Movies, ready to stream."
            subtitle="Pick a collection, a year, or jump straight to a letter."
          />
          <Card>
            <Text style={styles.eyebrow}>MOBILE ONLY</Text>
            <Text style={styles.cardTitle}>Open in Expo Go</Text>
            <Text style={styles.body}>
              Browser CORS blocks direct website requests, so movie fetching is
              disabled on web. No proxy or backend is used.
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    );

  if (!current)
    return (
      <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.list}>
          <HomeHeader
            brand="ZUNO"
            title="Movies, ready to stream."
            subtitle="Pick a collection, a year, or jump straight to a letter."
          />

          <Card>
            <Text style={styles.eyebrow}>01 / SOURCE</Text>
            <SourceRow
              base={base}
              checking={checkingBase}
              disabled={busy}
              onRefresh={() => void refreshBase()}
            />
          </Card>

          <Card>
            <Text style={styles.eyebrow}>02 / COLLECTIONS</Text>
            <Button
              title="New releases"
              icon="sparkles-outline"
              variant="primary"
              loading={busy}
              onPress={openNew}
            />
            <Button
              title="All movie collections"
              icon="albums-outline"
              disabled={busy}
              onPress={() => void load()}
            />
          </Card>

          <Card>
            <Text style={styles.eyebrow}>03 / BROWSE BY YEAR</Text>
            <View style={styles.years}>
              {YEARS.map((year) => (
                <Pressable
                  key={year}
                  accessibilityRole="button"
                  accessibilityLabel={`Browse ${year} movies`}
                  disabled={busy}
                  onPress={() => openYear(year)}
                  style={({ pressed }) => [
                    styles.year,
                    pressed && styles.yearPressed,
                    busy && styles.disabled,
                  ]}
                >
                  {({ pressed }) => (
                    <Text
                      style={[
                        styles.yearText,
                        pressed && styles.yearTextPressed,
                      ]}
                    >
                      {year}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
            <Button
              title="Single parts"
              icon="film-outline"
              disabled={busy}
              onPress={() => openPath(SINGLE_PARTS_PATH, "Single Parts")}
            />
            <Button
              title="HD mobile movies"
              icon="phone-portrait-outline"
              disabled={busy}
              onPress={() => openPath(HD_MOBILE_PATH, "HD Mobile Movies")}
            />
          </Card>

          <Card>
            <Text style={styles.eyebrow}>04 / BROWSE A–Z</Text>
            <View style={styles.letters}>
              {LETTERS.map((letter) => (
                <Pressable
                  key={letter}
                  accessibilityRole="button"
                  accessibilityLabel={`Browse movies starting with ${letter.toUpperCase()}`}
                  disabled={busy}
                  onPress={() => openLetter(letter)}
                  style={({ pressed }) => [
                    styles.letter,
                    pressed && styles.letterPressed,
                    busy && styles.disabled,
                  ]}
                >
                  {({ pressed }) => (
                    <Text
                      style={[
                        styles.letterText,
                        pressed && styles.letterTextPressed,
                      ]}
                    >
                      {letter.toUpperCase()}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          </Card>

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
        </ScrollView>
      </SafeAreaView>
    );

  const header = (
    <View style={styles.header}>
      <View style={styles.crumbRow}>
        <IconButton icon="arrow-back" label="Go back" onPress={goBack} />
        <Text numberOfLines={2} style={styles.crumbs}>
          {heading}
        </Text>
      </View>
      {current.info?.poster ? (
        <Banner
          source={current.info.poster}
          title={current.info.title}
          subtitle={[current.info.quality, current.info.language]
            .filter(Boolean)
            .join(" · ")}
        />
      ) : null}
      {current.info ? (
        <Card>
          <Text numberOfLines={2} style={styles.cardTitle}>
            {current.info.title}
          </Text>
          {current.info.quality || current.info.language ? (
            <Text style={styles.small}>
              {[current.info.quality, current.info.language]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
          {current.info.synopsis ? (
            <Text numberOfLines={4} style={styles.body}>
              {current.info.synopsis}
            </Text>
          ) : null}
        </Card>
      ) : null}
      <Field
        label="Search this folder"
        value={current.query}
        editable={!busy}
        onChangeText={(query) => patchFolder({ query })}
        placeholder="Search titles, qualities, years…"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {files.length > 0 ? (
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
              label="Clear selection"
              disabled={busy || !selected.size}
              onPress={() => {
                setPicking(false);
                setSelected(new Set());
              }}
            />
          </View>
        ) : files.length > 0 ? (
          <Text style={styles.small}>Tap a file to start selecting</Text>
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
      <FlatList<MovieEntry>
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
            onRefresh={() =>
              void load(current.url, current.title, true)
            }
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
              onPress={() => press(item)}
              onLongPress={() =>
                item.kind === "file" && !picking ? press(item) : null
              }
              disabled={busy}
              accessibilityRole={
                item.kind === "file" && picking ? "checkbox" : "button"
              }
              accessibilityLabel={`${index + 1}. ${item.title}${saved ? ", downloaded" : queued ? ", queued" : ""}`}
              accessibilityHint={
                item.kind === "folder"
                  ? "Opens this folder"
                  : picking
                    ? "Toggles selection"
                    : "Starts selecting files"
              }
              accessibilityState={{
                checked: item.kind === "file" && picking ? chosen : undefined,
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
              {item.poster ? (
                <Poster source={item.poster} title={item.title} size={40} />
              ) : null}
              <View style={styles.grow}>
                <Text numberOfLines={2} style={styles.entryTitle}>
                  {item.title}
                </Text>
                <View style={styles.entryMeta}>
                  <Text style={styles.small}>
                    {item.kind === "folder" ? "Folder" : "File"}
                  </Text>
                  {item.format || item.size ? (
                    <Text style={styles.small}>
                      {[item.format, item.size].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
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
  eyebrow: {
    color: color.taupe,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  body: { color: color.muted, fontSize: 14, lineHeight: 22 },
  small: { color: color.muted, fontSize: 12, lineHeight: 18 },
  // Swiss grid: every cell carries a full hairline and overlaps its neighbours
  // by 1px (negative margin) so adjacent edges collapse into a single rule.
  // This keeps the outer frame closed on partially filled final rows.
  years: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: -1,
    marginLeft: -1,
  },
  letters: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: -1,
    marginLeft: -1,
  },
  year: {
    flexBasis: "33.3333%",
    flexGrow: 1,
    height: 44,
    paddingHorizontal: space.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.raised,
    marginLeft: 1,
    marginTop: 1,
    borderWidth: 1,
    borderColor: color.rule,
  },
  yearPressed: { backgroundColor: color.accent },
  yearText: {
    color: color.text,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  yearTextPressed: { color: color.ink },
  letter: {
    width: "12.5%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.raised,
    marginLeft: 1,
    marginTop: 1,
    borderWidth: 1,
    borderColor: color.rule,
  },
  letterPressed: { backgroundColor: color.accent },
  letterText: {
    color: color.text,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  letterTextPressed: { color: color.ink },
  disabled: { opacity: 0.35 },
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
