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
import { radius, space, type Palette } from "@/constants/theme";
import { useMovies } from "@/context/movie-store";
import { useSeries } from "@/context/series-store";
import {
    compareEpisodeTitles,
    formatBytes,
    type DownloadedEpisode,
} from "@/lib/media-library";
import { useThemedStyles } from "@/context/theme-store";

function formatClock(seconds: number) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export default function DownloadsScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const series = useSeries();
  const movies = useMovies();

  const downloads = [...movies.downloads, ...series.downloads];
  const queue = [
    ...movies.queue.map((item) => ({
      title: item.entry.title,
      url: item.entry.url,
      status: item.status,
      progress: item.progress,
      error: item.error,
    })),
    ...series.queue.map((item) => ({
      title: item.episode.title,
      url: item.episode.url,
      status: item.status,
      progress: item.progress,
      error: item.error,
    })),
  ];
  const positions = { ...series.positions, ...movies.positions };

  const retryDownload = (url: string) => {
    if (movies.queue.some((item) => item.entry.url === url))
      movies.retryDownload(url);
    else series.retryDownload(url);
  };
  const removeQueued = (url: string) => {
    if (movies.queue.some((item) => item.entry.url === url))
      movies.removeQueued(url);
    else series.removeQueued(url);
  };
  const deleteDownload = async (item: DownloadedEpisode) => {
    if (movies.downloads.some((entry) => entry.episodeUrl === item.episodeUrl))
      await movies.deleteDownload(item);
    else await series.deleteDownload(item);
  };
  const resolveDownload = (url: string) =>
    movies.downloads.some((entry) => entry.episodeUrl === url)
      ? movies.resolveDownload(url)
      : series.resolveDownload(url);

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
                  <View key={item.url} style={styles.queueItem}>
                    <View style={styles.queueText}>
                      <Text numberOfLines={1} style={styles.rowTitle}>
                        {item.title}
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
                        label={`Retry ${item.title}`}
                        onPress={() => retryDownload(item.url)}
                      />
                    ) : (
                      <IconButton
                        icon="close"
                        label={
                          item.status === "downloading"
                            ? `Cancel ${item.title}`
                            : `Remove ${item.title}`
                        }
                        onPress={() => removeQueued(item.url)}
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

function createStyles(color: Palette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  list: {
    padding: space.lg,
    paddingBottom: space.xxl,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    gap: space.sm,
  },
  header: { gap: space.sm, marginBottom: space.md },
  title: {
    color: color.text,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: color.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: space.xs,
  },
  eyebrow: {
    color: color.taupe,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  card: {
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    gap: space.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: space.sm,
  },
  queueText: { flex: 1, gap: 5 },
  rowTitle: { color: color.text, fontSize: 15, fontWeight: "600" },
  small: { color: color.muted, fontSize: 12, lineHeight: 18 },
  error: { color: color.error, fontSize: 12, lineHeight: 18 },
  });
}
