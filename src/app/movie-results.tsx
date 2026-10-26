import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActionSheet, type SheetAction } from "@/components/action-sheet";
import { useToast } from "@/components/toast";
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  ProgressBar,
  SkeletonList,
} from "@/components/ui";
import { radius, space, type Palette } from "@/constants/theme";
import { useMovies, type MovieResolved } from "@/context/movie-store";
import { useThemeColor, useThemedStyles } from "@/context/theme-store";
import { errorMessage } from "@/lib/series-client";

function displayUrl(value: string): string {
  try {
    const url = new URL(value);
    const compact = `${url.hostname}${url.pathname}`;
    return compact.length > 42 ? `${compact.slice(0, 42)}…` : compact;
  } catch {
    return value.length > 42 ? `${value.slice(0, 42)}…` : value;
  }
}

export default function MovieResultsScreen() {
  const router = useRouter();
  const toast = useToast();
  const color = useThemeColor();
  const styles = useThemedStyles(createStyles);
  const {
    results,
    resultHeading,
    busy,
    progress,
    cancel,
    enqueue,
    queue,
    downloads,
    resolve,
  } = useMovies();
  const [menu, setMenu] = useState<MovieResolved | null>(null);

  const ready = results.filter((item) => item.link).length;
  const failed = results.filter((item) => item.error).length;

  async function copy(text: string) {
    try {
      if (!(await Clipboard.setStringAsync(text)))
        throw new Error("Clipboard is unavailable.");
      toast("Copied to clipboard.", { tone: "success" });
    } catch (exception) {
      toast(errorMessage(exception), { tone: "error" });
    }
  }

  const menuActions: SheetAction[] = menu?.link
    ? [
        {
          label: "Copy link",
          icon: "copy-outline",
          onPress: () => void copy(menu.link!),
        },
        {
          label: "Open in browser",
          icon: "open-outline",
          onPress: () => {
            void Linking.openURL(menu.link!).catch((exception) =>
              Alert.alert("Could not open link", errorMessage(exception)),
            );
          },
        },
      ]
    : [];

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <FlatList<MovieResolved>
        data={results}
        keyExtractor={(item) => item.entry.url}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.crumbRow}>
              <IconButton
                icon="arrow-back"
                label="Back to movies"
                onPress={() => router.back()}
              />
              <View style={styles.grow}>
                <Text style={styles.title}>Movie links</Text>
                <Text numberOfLines={1} style={styles.small}>
                  {resultHeading}
                </Text>
              </View>
            </View>
            <Card>
              <ProgressBar value={busy ? 0.4 : 1} />
              <Text accessibilityLiveRegion="polite" style={styles.summary}>
                {busy
                  ? progress || "Resolving…"
                  : `${ready} ready · ${failed} failed`}
              </Text>
              {busy ? (
                <Button title="Cancel" icon="stop-circle" onPress={cancel} />
              ) : null}
              <Text style={styles.small}>
                Links can expire. Download promptly or resolve again.
              </Text>
            </Card>
          </View>
        }
        ListEmptyComponent={
          busy ? (
            <SkeletonList count={3} />
          ) : (
            <EmptyState
              icon="alert-circle-outline"
              title="No results yet"
              body="Go back and select the movie files you want to resolve."
            />
          )
        }
        ListFooterComponent={
          !busy && failed > 0 ? (
            <Button
              title={`Retry ${failed} failed`}
              icon="refresh"
              onPress={() =>
                void resolve(
                  results.filter((item) => item.error).map((item) => item.entry),
                )
              }
            />
          ) : undefined
        }
        renderItem={({ item, index }) => {
          const queued = queue.find(
            (entry) => entry.entry.url === item.entry.url,
          );
          const saved = downloads.some(
            (entry) => entry.episodeUrl === item.entry.url,
          );
          return (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.grow}>
                  <Text
                    style={[styles.eyebrow, !item.link && { color: color.error }]}
                  >
                    {String(index + 1).padStart(2, "0")} ·{" "}
                    {item.link ? "READY" : item.error ? "FAILED" : "PENDING"}
                  </Text>
                  <Text numberOfLines={2} style={styles.rowTitle}>
                    {item.entry.title}
                  </Text>
                  {item.entry.size || item.entry.format ? (
                    <Text style={styles.url}>
                      {[item.entry.format, item.entry.size]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  ) : null}
                  {item.link ? (
                    <Text numberOfLines={1} style={styles.url}>
                      {displayUrl(item.link)}
                    </Text>
                  ) : item.error ? (
                    <Text numberOfLines={3} style={styles.error}>
                      {item.error}
                    </Text>
                  ) : null}
                </View>
                {item.link ? (
                  <IconButton
                    icon="ellipsis-horizontal"
                    label={`More options for ${item.entry.title}`}
                    onPress={() => setMenu(item)}
                  />
                ) : null}
              </View>
              {queued?.status === "downloading" ? (
                <ProgressBar value={queued.progress} />
              ) : null}
              {item.link ? (
                <View style={styles.row}>
                  <Button
                    title="Play"
                    icon="play"
                    variant="primary"
                    grow
                    onPress={() =>
                      router.push({
                        pathname: "/movie-player",
                        params: {
                          source: encodeURIComponent(item.link!),
                          title: item.entry.title,
                          movieUrl: item.entry.url,
                        },
                      })
                    }
                  />
                  <Button
                    title={
                      saved
                        ? "Saved"
                        : queued?.status === "downloading"
                          ? `${Math.round(queued.progress * 100)}%`
                          : queued
                            ? "Queued"
                            : "Download"
                    }
                    icon={saved ? "checkmark" : "download-outline"}
                    disabled={saved || !!queued}
                    onPress={() =>
                      enqueue(item.entry, item.link!, resultHeading)
                    }
                  />
                </View>
              ) : null}
            </View>
          );
        }}
      />
      <ActionSheet
        visible={!!menu}
        title={menu?.entry.title ?? ""}
        actions={menuActions}
        onClose={() => setMenu(null)}
      />
    </SafeAreaView>
  );
}

function createStyles(color: Palette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  grow: { flex: 1 },
  list: {
    padding: space.lg,
    paddingBottom: space.xl,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: space.sm,
  },
  header: { gap: space.md, marginBottom: space.sm },
  crumbRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  title: {
    color: color.text,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  summary: { color: color.text, fontSize: 13, fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  card: {
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    gap: space.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  rowTitle: {
    color: color.text,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  eyebrow: {
    color: color.taupe,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  url: {
    color: color.faint,
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  small: { color: color.muted, fontSize: 12, lineHeight: 18 },
  error: { color: color.error, fontSize: 12, lineHeight: 18, marginTop: 4 },
  });
}
