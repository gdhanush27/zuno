import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, IconButton } from "@/components/ui";
import { palettes, playerColor, space } from "@/constants/theme";

// The player is always dark, so its shared controls opt out of the app theme.
const chrome = palettes.dark;

export function MediaPlayer({
  source,
  title,
  startAt,
  onProgress,
  onClose,
  onPrevious,
  onNext,
  onEnded,
  onDownload,
  downloadState,
}: {
  source: string;
  title: string;
  startAt: number;
  onProgress: (seconds: number) => void;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onEnded?: () => void;
  onDownload?: () => void;
  downloadState?: "download" | "queued" | "saved";
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const resumed = useRef(false);

  const player = useVideoPlayer(source, (instance) => {
    instance.timeUpdateEventInterval = 5;
    instance.play();
  });

  useEventListener(player, "statusChange", ({ status: next, error }) => {
    if (next === "error") {
      setStatus("error");
      setMessage(error?.message ?? "This video could not be played.");
      return;
    }
    if (next === "readyToPlay") {
      setStatus("ready");
    }
  });

  useEffect(() => {
    if (status !== "ready" || resumed.current || startAt <= 0) return;
    resumed.current = true;
    try {
      player.currentTime = startAt;
    } catch {
      // The player can be released while seeking during a fast close.
    }
  }, [player, startAt, status]);

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    onProgress(currentTime);
  });

  useEventListener(player, "playToEnd", () => {
    onEnded?.();
  });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.toolbar}>
        <IconButton
          icon="chevron-down"
          label="Close player"
          palette={chrome}
          onPress={onClose}
        />
        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>
      </View>
      <View style={styles.stage}>
        <VideoView
          player={player}
          nativeControls
          contentFit="contain"
          allowsPictureInPicture
          style={styles.video}
        />
        {status === "loading" ? (
          <View pointerEvents="none" style={styles.overlay}>
            <ActivityIndicator color={playerColor.accent} size="large" />
            <Text style={styles.overlayText}>
              {startAt > 0 ? "Resuming…" : "Buffering…"}
            </Text>
          </View>
        ) : null}
        {status === "error" ? (
          <View style={styles.overlay}>
            <Text style={styles.errorTitle}>Playback failed</Text>
            <Text style={styles.overlayText}>{message}</Text>
            <Button
              title="Retry"
              icon="refresh"
              palette={chrome}
              onPress={() => {
                setStatus("loading");
                player.replace(source);
                player.play();
              }}
            />
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button
          title="Previous"
          icon="play-skip-back"
          palette={chrome}
          disabled={!onPrevious}
          onPress={() => onPrevious?.()}
        />
        {downloadState ? (
          <IconButton
            icon={downloadState === "saved" ? "checkmark" : "download-outline"}
            label={
              downloadState === "saved"
                ? "Available offline"
                : downloadState === "queued"
                  ? "Download queued"
                  : "Download for offline use"
            }
            palette={chrome}
            disabled={downloadState !== "download"}
            onPress={() => onDownload?.()}
          />
        ) : null}
        <Button
          title="Next"
          icon="play-skip-forward"
          palette={chrome}
          disabled={!onNext}
          onPress={() => onNext?.()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: playerColor.screen },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: playerColor.border,
  },
  title: {
    flex: 1,
    color: playerColor.text,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  stage: { flex: 1, justifyContent: "center" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: playerColor.border,
  },
  video: { flex: 1, width: "100%", backgroundColor: "#000" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    padding: space.xl,
    backgroundColor: playerColor.overlay,
  },
  overlayText: {
    color: playerColor.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 360,
  },
  errorTitle: {
    color: playerColor.error,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});
