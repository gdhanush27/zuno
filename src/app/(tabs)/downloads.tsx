import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActionSheet, type SheetAction } from "@/components/action-sheet";
import {
    Button,
    Card,
    EmptyState,
    IconButton,
    ProgressBar,
} from "@/components/ui";
import { color, radius, space } from "@/constants/theme";
import { useSeries } from "@/context/series-store";
import {
    compareEpisodeTitles,
    formatBytes,
    type DownloadedEpisode,
} from "@/lib/media-library";

function formatClock(seconds: number) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export default function DownloadsScreen() {
  const router = useRouter();
  const {
    downloads,
    queue,
    positions,
    retryDownload,
    removeQueued,
    deleteDownload,
    resolveDownload,
  } = useSeries();
  const [menu, setMenu] = useState<DownloadedEpisode | null>(null);
  const orderedDownloads = [...downloads].sort(compareEpisodeTitles);

  function play(item: DownloadedEpisode) {
    if (!resolveDownload(item.episodeUrl)) {
      Alert.alert(
        "Download unavailable",
        "The saved file is missing. Delete this item and download it again.",
      );
      return;
    }
    router.push({
      pathname: "/player",
      params: {
        title: item.title,
        episodeUrl: item.episodeUrl,
        downloaded: "true",
        playlist: "downloads",
      },
    });
  }

  function confirmDelete(item: DownloadedEpisode) {
    Alert.alert(
      "Delete download?",
      `${item.title} will be removed from this device.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deleteDownload(item),
        },
      ],
    );
  }

  const menuActions: SheetAction[] = menu
    ? [
        {
          label: "Play offline",
          icon: "play",
          onPress: () => play(menu),
        },
        {
          label: "Delete from device",
          icon: "trash",
          destructive: true,
          onPress: () => confirmDelete(menu),
        },
      ]
    : [];

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <FlatList
        data={orderedDownloads}
        keyExtractor={(item) => item.episodeUrl}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Downloads</Text>
            <Text style={styles.subtitle}>
              {`${downloads.length} episode${downloads.length === 1 ? "" : "s"} saved for offline playback.`}
            </Text>
            {queue.length > 0 ? (
              <Card>
                <Text style={styles.eyebrow}>{queue.length} IN QUEUE</Text>
                {queue.map((item, index) => (
                  <View key={item.episode.url} style={styles.queueItem}>
                    <View style={styles.queueText}>
                      <Text numberOfLines={1} style={styles.rowTitle}>
                        {item.episode.title}
                      </Text>
                      <Text
                        numberOfLines={2}
                        style={
                          item.status === "failed" ? styles.error : styles.small
                        }
                      >
                        {item.status === "downloading"
                          ? `Downloading · ${Math.round(item.progress * 100)}%`
                          : item.status === "failed"
                            ? item.error
                            : `Waiting · position ${index + 1}`}
                      </Text>
                      {item.status === "downloading" ? (
                        <ProgressBar value={item.progress} />
                      ) : null}
                    </View>
                    {item.status === "failed" ? (
                      <IconButton
                        icon="refresh"
                        label={`Retry ${item.episode.title}`}
                        onPress={() => retryDownload(item.episode.url)}
                      />
                    ) : (
                      <IconButton
                        icon="close"
                        label={`Remove ${item.episode.title}`}
                        disabled={item.status === "downloading"}
                        onPress={() => removeQueued(item.episode.url)}
                      />
                    )}
                  </View>
                ))}
              </Card>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="cloud-download-outline"
            title="Nothing saved yet"
            body="Resolve links from the Browse tab, then tap Download to keep a local copy."
            action={
              <Button
                title="Go to Browse"
                icon="albums-outline"
                onPress={() => router.replace("/")}
              />
            }
          />
        }
        renderItem={({ item }) => {
          const resume = positions[item.episodeUrl];
          return (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.queueText}>
                  <Text numberOfLines={2} style={styles.rowTitle}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.small}>
                    {formatBytes(item.size)} · {item.heading || item.fileName}
                  </Text>
                </View>
                <IconButton
                  icon="ellipsis-horizontal"
                  label={`More options for ${item.title}`}
                  onPress={() => setMenu(item)}
                />
              </View>
              <Button
                title={
                  resume ? `Resume at ${formatClock(resume)}` : "Play offline"
                }
                icon="play"
                variant="primary"
                onPress={() => play(item)}
              />
            </View>
          );
        }}
      />
      <ActionSheet
        visible={!!menu}
        title={menu?.title ?? ""}
        actions={menuActions}
        onClose={() => setMenu(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  list: {
    padding: space.lg,
    paddingBottom: space.xl,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: space.sm,
  },
  header: { gap: space.sm, marginBottom: space.sm },
  title: { color: color.text, fontSize: 30, fontWeight: "800" },
  subtitle: { color: color.muted, fontSize: 14, marginBottom: space.xs },
  eyebrow: {
    color: color.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  card: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    gap: space.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  queueItem: { flexDirection: "row", alignItems: "center", gap: space.sm },
  queueText: { flex: 1, gap: 5 },
  rowTitle: { color: color.text, fontSize: 15, fontWeight: "700" },
  small: { color: color.muted, fontSize: 12, lineHeight: 18 },
  error: { color: color.error, fontSize: 12, lineHeight: 18 },
});
