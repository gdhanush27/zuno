import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, Linking, StyleSheet, Text, View } from "react-native";
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
import { color, radius, space } from "@/constants/theme";
import { useSeries } from "@/context/series-store";
import { compareEpisodeTitles } from "@/lib/media-library";
import { errorMessage, type Result } from "@/lib/series-client";

function displayUrl(value: string): string {
  try {
    const url = new URL(value);
    const compact = `${url.hostname}${url.pathname}`;
    return compact.length > 42 ? `${compact.slice(0, 42)}…` : compact;
  } catch {
    return value.length > 42 ? `${value.slice(0, 42)}…` : value;
  }
}

export default function ResultsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { batch, busy, progress, cancel, resolve, enqueue, queue, downloads } =
    useSeries();
  const [menu, setMenu] = useState<Result | null>(null);

  if (!batch)
    return (
      <SafeAreaView style={styles.screen}>
        <EmptyState
          icon="link-outline"
          title="No batch in progress"
          body="Select episodes from the Browse tab to resolve download links."
          action={
            <Button
              title="Back"
              icon="arrow-back"
              onPress={() => router.back()}
            />
          }
        />
      </SafeAreaView>
    );

  const ready = batch.results.filter((result) => result.link).length;
  const failed = batch.results.filter((result) => result.error).length;
  const remaining = batch.episodes.length - batch.results.length;
  const pending = batch.episodes.filter(
    (episode) =>
      !batch.results.some(
        (result) => result.episode.url === episode.url && result.link,
      ),
  );
  const orderedResults = [...batch.results].sort((left, right) =>
    compareEpisodeTitles(left.episode, right.episode),
  );

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

  const done = ready + failed;
  const overall = batch.episodes.length ? done / batch.episodes.length : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <FlatList<Result>
        data={orderedResults}
        keyExtractor={(item) => item.episode.url}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.crumbRow}>
              <IconButton
                icon="arrow-back"
                label="Back to episodes"
                onPress={() => router.back()}
              />
              <View style={styles.grow}>
                <Text style={styles.title}>Your links</Text>
                <Text numberOfLines={1} style={styles.small}>
                  {batch.heading}
                </Text>
              </View>
            </View>
            <Card>
              <ProgressBar value={overall} />
              <Text accessibilityLiveRegion="polite" style={styles.summary}>
                {busy
                  ? progress || "Resolving…"
                  : `${ready} ready · ${failed} failed · ${remaining} remaining`}
              </Text>
              {busy ? (
                <Button title="Cancel" icon="stop-circle" onPress={cancel} />
              ) : null}
              <Text style={styles.small}>
                Links only — no media downloaded. Links can expire; resolve
                again if needed.
              </Text>
            </Card>
          </View>
        }
        ListEmptyComponent={
          busy ? (
            <SkeletonList count={4} />
          ) : (
            <EmptyState
              icon="alert-circle-outline"
              title="No results yet"
              body="Go back and select the episodes you want to resolve."
            />
          )
        }
        ListFooterComponent={
          !busy && pending.length > 0 ? (
            <Button
              title={`Retry ${pending.length} failed or remaining`}
              icon="refresh"
              onPress={() => void resolve(pending, batch)}
            />
          ) : null
        }
        renderItem={({ item, index }) => {
          const queued = queue.find(
            (entry) => entry.episode.url === item.episode.url,
          );
          const saved = downloads.some(
            (entry) => entry.episodeUrl === item.episode.url,
          );
          return (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.grow}>
                  <Text
                    style={[
                      styles.eyebrow,
                      !item.link && { color: color.error },
                    ]}
                  >
                    {String(index + 1).padStart(2, "0")} ·{" "}
                    {item.link ? "READY" : "FAILED"}
                  </Text>
                  <Text numberOfLines={2} style={styles.rowTitle}>
                    {item.episode.title}
                  </Text>
                  {item.link ? (
                    <Text numberOfLines={1} style={styles.url}>
                      {displayUrl(item.link)}
                    </Text>
                  ) : (
                    <Text numberOfLines={3} style={styles.error}>
                      {item.error}
                    </Text>
                  )}
                </View>
                {item.link ? (
                  <IconButton
                    icon="ellipsis-horizontal"
                    label={`More options for ${item.episode.title}`}
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
                        pathname: "/player",
                        params: {
                          source: encodeURIComponent(item.link!),
                          title: item.episode.title,
                          episodeUrl: item.episode.url,
                          playlist: "results",
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
                      enqueue(item.episode, item.link!, batch.heading)
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
        title={menu?.episode.title ?? ""}
        actions={menuActions}
        onClose={() => setMenu(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  title: { color: color.text, fontSize: 26, fontWeight: "800" },
  summary: { color: color.text, fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  card: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    gap: space.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  rowTitle: { color: color.text, fontSize: 15, fontWeight: "700" },
  eyebrow: {
    color: color.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  url: { color: color.faint, fontSize: 12, marginTop: 3 },
  small: { color: color.muted, fontSize: 12, lineHeight: 18 },
  error: { color: color.error, fontSize: 12, lineHeight: 18, marginTop: 3 },
});
