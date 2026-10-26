import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MediaPlayer } from "@/components/media-player";
import { IconButton } from "@/components/ui";
import { palettes, playerColor, space } from "@/constants/theme";
import { useSeries } from "@/context/series-store";
import { compareEpisodeTitles } from "@/lib/media-library";
import type { Entry } from "@/lib/series-client";

type PlayerEpisode = {
  episode: Entry;
};

// Loading chrome sits on the always-dark player canvas.
const chrome = palettes.dark;

export default function PlayerScreen() {
  const router = useRouter();
  const {
    batch,
    current: folder,
    downloads,
    queue,
    positions,
    resolveDownload,
    resolveEpisodeLink,
    enqueue,
    savePosition,
  } = useSeries();
  const params = useLocalSearchParams<{
    source?: string;
    title?: string;
    episodeUrl?: string;
    downloaded?: string;
    playlist?: "results" | "downloads";
  }>();
  const streamedSource = params.source ? decodeURIComponent(params.source) : "";
  const initialUrl = params.episodeUrl ?? streamedSource;
  const playlist: PlayerEpisode[] =
    params.playlist === "downloads"
      ? downloads
          .map((item) => ({
            episode: {
              title: item.title,
              url: item.episodeUrl,
              kind: "episode" as const,
            },
          }))
          .sort((left, right) =>
            compareEpisodeTitles(left.episode, right.episode),
          )
      : (folder?.entries ?? batch?.episodes ?? [])
          .filter((episode) => episode.kind === "episode")
          .map((episode) => ({ episode }))
          .sort((left, right) =>
            compareEpisodeTitles(left.episode, right.episode),
          );
  const initialIndex = playlist.findIndex(
    (item) => item.episode.url === initialUrl,
  );
  const [index, setIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const current = playlist[index] ?? {
    episode: {
      title: params.title ?? "Episode",
      url: initialUrl,
      kind: "episode" as const,
    },
  };
  const episodeUrl = current.episode.url;
  const localSource = resolveDownload(episodeUrl);
  const [resolved, setResolved] = useState<{
    episodeUrl: string;
    source: string;
  } | null>(null);
  const [resolveError, setResolveError] = useState("");
  const source =
    localSource ?? (resolved?.episodeUrl === episodeUrl ? resolved.source : "");
  const startAt = positions[episodeUrl] ?? 0;
  const latest = useRef(startAt);

  useEffect(() => {
    latest.current = startAt;
  }, [episodeUrl, startAt]);

  useEffect(() => {
    if (localSource) return;
    const controller = new AbortController();
    void resolveEpisodeLink(episodeUrl, controller.signal)
      .then((nextSource) => {
        if (!controller.signal.aborted)
          setResolved({ episodeUrl, source: nextSource });
      })
      .catch((exception: unknown) => {
        if (!controller.signal.aborted)
          setResolveError(
            exception instanceof Error
              ? exception.message
              : "Could not load this episode.",
          );
      });
    return () => controller.abort();
  }, [episodeUrl, localSource, resolveEpisodeLink]);

  useEffect(
    () => () => {
      if (episodeUrl) savePosition(episodeUrl, latest.current);
    },
    [episodeUrl, savePosition],
  );

  function move(nextIndex: number) {
    savePosition(episodeUrl, latest.current);
    setIndex(nextIndex);
  }

  const queued = queue.some((item) => item.episode.url === episodeUrl);

  if (!source)
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.missing}>
          <IconButton
            icon="close"
            label="Close player"
            palette={chrome}
            onPress={() => router.back()}
          />
          {resolveError ? null : (
            <ActivityIndicator color={playerColor.accent} size="large" />
          )}
          <Text style={styles.text}>
            {resolveError || `Loading ${current.episode.title}…`}
          </Text>
          <View style={styles.navigation}>
            <IconButton
              icon="play-skip-back"
              label="Previous episode"
              palette={chrome}
              disabled={index === 0}
              onPress={() => move(index - 1)}
            />
            <IconButton
              icon="play-skip-forward"
              label="Next episode"
              palette={chrome}
              disabled={index >= playlist.length - 1}
              onPress={() => move(index + 1)}
            />
          </View>
        </View>
      </SafeAreaView>
    );

  return (
    <MediaPlayer
      key={episodeUrl}
      source={source}
      title={current.episode.title}
      startAt={startAt}
      onProgress={(seconds) => {
        latest.current = seconds;
      }}
      onClose={() => router.back()}
      onPrevious={index > 0 ? () => move(index - 1) : undefined}
      onNext={index < playlist.length - 1 ? () => move(index + 1) : undefined}
      onEnded={index < playlist.length - 1 ? () => move(index + 1) : undefined}
      downloadState={
        localSource
          ? "saved"
          : queued
            ? "queued"
            : source
              ? "download"
              : undefined
      }
      onDownload={
        source && !localSource
          ? () =>
              enqueue(current.episode, source, batch?.heading ?? "Downloads")
          : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: playerColor.screen },
  missing: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    padding: space.lg,
  },
  text: {
    color: playerColor.muted,
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 360,
  },
  navigation: {
    flexDirection: "row",
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: playerColor.border,
    paddingTop: space.md,
  },
});
