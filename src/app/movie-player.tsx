import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MediaPlayer } from "@/components/media-player";
import { IconButton } from "@/components/ui";
import { palettes, playerColor, space } from "@/constants/theme";

// Loading chrome sits on the always-dark player canvas.
const chrome = palettes.dark;
import { useMovies } from "@/context/movie-store";
import { errorMessage } from "@/lib/series-client";

export default function MoviePlayerScreen() {
  const router = useRouter();
  const {
    queue,
    positions,
    resolveDownload,
    resolveEntryLink,
    enqueue,
    savePosition,
  } = useMovies();
  const params = useLocalSearchParams<{
    source?: string;
    title?: string;
    movieUrl?: string;
  }>();
  const streamedSource = params.source ? decodeURIComponent(params.source) : "";
  const movieUrl = params.movieUrl ?? streamedSource;
  const title = params.title ?? "Movie";

  const localSource = resolveDownload(movieUrl);
  const [resolved, setResolved] = useState<{
    movieUrl: string;
    source: string;
  } | null>(null);
  const [resolveError, setResolveError] = useState("");
  const source =
    localSource ??
    (streamedSource ||
      (resolved?.movieUrl === movieUrl ? resolved.source : ""));

  const startAt = positions[movieUrl] ?? 0;
  const latest = useRef(startAt);

  useEffect(() => {
    latest.current = startAt;
  }, [movieUrl, startAt]);

  useEffect(() => {
    if (localSource || streamedSource) return;
    const controller = new AbortController();
    void resolveEntryLink(movieUrl, controller.signal)
      .then((nextSource) => {
        if (!controller.signal.aborted)
          setResolved({ movieUrl, source: nextSource });
      })
      .catch((exception: unknown) => {
        if (!controller.signal.aborted)
          setResolveError(errorMessage(exception));
      });
    return () => controller.abort();
  }, [movieUrl, localSource, streamedSource, resolveEntryLink]);

  useEffect(
    () => () => {
      if (movieUrl) savePosition(movieUrl, latest.current);
    },
    [movieUrl, savePosition],
  );

  const queued = queue.some((item) => item.entry.url === movieUrl);

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
            {resolveError || `Loading ${title}…`}
          </Text>
        </View>
      </SafeAreaView>
    );

  return (
    <MediaPlayer
      key={movieUrl}
      source={source}
      title={title}
      startAt={startAt}
      onProgress={(seconds) => {
        latest.current = seconds;
      }}
      onClose={() => router.back()}
      downloadState={
        localSource ? "saved" : queued ? "queued" : source ? "download" : undefined
      }
      onDownload={
        source && !localSource
          ? () => enqueue({ title, url: movieUrl, kind: "file" }, source, title)
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
});
