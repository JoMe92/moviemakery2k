import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type RecorderDeps, useNarrationRecorder } from "../audio/useNarrationRecorder";
import type { Translate } from "../i18n/t";
import { useT } from "../i18n/useT";
import type { AudioItem, NarrationClip } from "../lib/apiClient";
import { TrimDialog, VolumeDialog } from "../musictrack/MusicClipDialogs";
import { timelineOf } from "../player/controls";
import { ConfirmDialog } from "../shell/AppDialogs";
import { useRevealRequest } from "../shell/reveal";
import { audioDurations } from "../store/musicOps";
import { NARRATION_TRACK_MAX, narrationClipLength } from "../store/narrationOps";
import { useAppStore, useAppStoreApi } from "../store/useAppStore";
import { Button } from "../ui/Button";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { NARRATION_PX_PER_SECOND, NarrationClipBlock } from "./NarrationClipBlock";
import styles from "./NarrationTrack.module.css";

interface MenuState {
  clipId: string;
  x: number;
  y: number;
}

type DialogState = { kind: "volume" | "trim"; clipId: string };

export interface NarrationClipMenuActions {
  remove: (clipId: string) => void;
  volume: (clipId: string) => void;
  /** Absent if the audio file is missing (no duration to trim against). */
  trim?: (clipId: string) => void;
  setFade: (clipId: string, patch: { fadeIn: boolean } | { fadeOut: boolean }) => void;
  /** Moves the clip to the current playhead position. */
  moveToPlayhead: (clipId: string) => void;
}

/**
 * Context menu entries of a narration clip (spec narration-track
 * "Erzählungsleiste"): the same pattern as a music clip, plus "Move to the
 * playback position" — the one thing a music clip has no use for.
 */
export function narrationClipMenuItems(
  clip: NarrationClip,
  t: Translate,
  actions: NarrationClipMenuActions,
): ContextMenuItem[] {
  const { trim } = actions;
  return [
    { label: t("narrationTrack.remove"), onSelect: () => actions.remove(clip.id) },
    {
      label: t("narrationTrack.moveToPlayhead"),
      onSelect: () => actions.moveToPlayhead(clip.id),
    },
    { label: t("narrationTrack.volume"), onSelect: () => actions.volume(clip.id) },
    {
      label: t("narrationTrack.fadeIn"),
      checked: clip.fadeIn,
      onSelect: () => actions.setFade(clip.id, { fadeIn: !clip.fadeIn }),
    },
    {
      label: t("narrationTrack.fadeOut"),
      checked: clip.fadeOut,
      onSelect: () => actions.setFade(clip.id, { fadeOut: !clip.fadeOut }),
    },
    {
      label: t("narrationTrack.trim"),
      disabled: trim === undefined,
      onSelect: () => trim?.(clip.id),
    },
  ];
}

export interface NarrationTrackProps {
  /** Injected in tests; the browser's microphone otherwise. */
  recorderDeps?: RecorderDeps;
}

/**
 * Narration bar below the music bar (spec narration-track "Erzählungsleiste").
 *
 * Unlike the music bar this is not a row of blocks: every clip sits at its own
 * absolute `at`, so the lane is a time axis and the blocks are positioned on it.
 * Overlapping clips stay where they are and are drawn on top of each other —
 * both are audible (design.md D2), so hiding one would lie.
 *
 * The record button starts the microphone and playback in the same click
 * (design.md D3); stopping creates the clip at the position the recording
 * started.
 */
export function NarrationTrack({ recorderDeps }: NarrationTrackProps = {}) {
  const { t } = useT();
  const headingId = useId();
  const storeApi = useAppStoreApi();
  const narration = useAppStore((s) => s.narration);
  const media = useAppStore((s) => s.media);
  const slides = useAppStore((s) => s.slides);
  const selection = useAppStore((s) => s.narrationSelection);
  const selectClip = useAppStore((s) => s.selectNarrationClip);
  const removeClip = useAppStore((s) => s.removeNarrationClip);
  const updateClip = useAppStore((s) => s.updateNarrationClip);
  const moveClip = useAppStore((s) => s.moveNarrationClip);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const tiles = useRef(new Map<string, HTMLElement>());
  const recorder = useNarrationRecorder(storeApi, recorderDeps);

  // A finished recording asks for its new clip to be shown (app-shell D6).
  useRevealRequest("narrationClip", tiles);

  const durations = useMemo(() => audioDurations(media), [media]);
  const movie = timelineOf(slides).duration;
  const lengths = useMemo(
    () => new Map(narration.map((c) => [c.id, narrationClipLength(c, durations[c.mediaId])])),
    [narration, durations],
  );
  // The lane is at least as wide as the movie, and wide enough for every clip.
  const span = Math.max(movie, ...narration.map((c) => c.at + (lengths.get(c.id) ?? 0)), 0);

  // Escape while recording stops it, like every other modal interaction.
  useEffect(() => {
    if (!recorder.recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") void recorder.stop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recorder]);

  const clipOf = (clipId: string | null) =>
    clipId === null ? undefined : narration.find((c) => c.id === clipId);
  const audioOf = (clip: NarrationClip | undefined) =>
    clip
      ? media.find((m): m is AudioItem => m.id === clip.mediaId && m.kind === "audio")
      : undefined;

  const remove = (clipId: string) => setConfirmRemove(clipId);
  const confirmedRemove = () => {
    if (confirmRemove === null) return;
    const index = narration.findIndex((c) => c.id === confirmRemove);
    const neighbour = narration[index + 1] ?? narration[index - 1];
    removeClip(confirmRemove);
    setConfirmRemove(null);
    if (neighbour) {
      selectClip(neighbour.id);
      setTimeout(() => tiles.current.get(neighbour.id)?.focus(), 0);
    }
  };

  const record = () => {
    if (recorder.recording) {
      void recorder.stop();
      return;
    }
    // One gesture: the AudioContext (unlocked by usePreviewAudio in the capture
    // phase), playback and the microphone (design.md D3).
    const state = storeApi.getState();
    if (!state.playback.playing && slides.length > 0) state.play();
    void recorder.start();
  };

  const full = narration.length >= NARRATION_TRACK_MAX;
  const menuClip = clipOf(menu?.clipId ?? null);
  const dialogClip = clipOf(dialog?.clipId ?? null);
  const dialogNumber = dialogClip ? narration.indexOf(dialogClip) + 1 : 0;
  const dialogAudio = audioOf(dialogClip);
  const removeClipItem = clipOf(confirmRemove);

  return (
    <section className={styles.track} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h3 id={headingId} className={styles.label}>
          {t("narrationTrack.label")}
        </h3>
        <Button
          variant="toolbar"
          className={styles.record}
          aria-pressed={recorder.recording}
          disabled={full && !recorder.recording}
          onClick={record}
        >
          {t(recorder.recording ? "narrationTrack.stopRecording" : "narrationTrack.record")}
        </Button>
      </div>
      <div className={styles.lane} data-testid="narration-strip">
        {narration.length === 0 && !recorder.recording ? (
          <p className={styles.hint}>{t("narrationTrack.emptyHint")}</p>
        ) : (
          <ol
            className={styles.list}
            aria-label={t("narrationTrack.list")}
            style={{ width: `${span * NARRATION_PX_PER_SECOND}px` }}
          >
            {narration.map((clip, i) => (
              <NarrationClipBlock
                key={clip.id}
                clip={clip}
                number={i + 1}
                item={audioOf(clip)}
                length={lengths.get(clip.id) ?? 0}
                selected={selection === clip.id}
                tileRef={(el) => {
                  if (el) tiles.current.set(clip.id, el);
                  else tiles.current.delete(clip.id);
                }}
                onSelect={() => selectClip(clip.id)}
                onRemove={() => remove(clip.id)}
                onMove={(at) => moveClip(clip.id, at)}
                onMenu={(x, y) => setMenu({ clipId: clip.id, x, y })}
              />
            ))}
          </ol>
        )}
      </div>
      <p role="status" className={styles.status} data-error={recorder.error ? true : undefined}>
        {recorder.recording
          ? t("narrationTrack.recordingHint")
          : recorder.error
            ? t(`narrationTrack.error.${recorder.error}`)
            : full
              ? t("narrationTrack.fullHint", { max: NARRATION_TRACK_MAX })
              : null}
      </p>
      {menu && menuClip ? (
        <ContextMenu
          label={t("narrationTrack.clipMenu", { number: narration.indexOf(menuClip) + 1 })}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={narrationClipMenuItems(menuClip, t, {
            remove,
            volume: (clipId) => setDialog({ kind: "volume", clipId }),
            trim: audioOf(menuClip) ? (clipId) => setDialog({ kind: "trim", clipId }) : undefined,
            setFade: (clipId, patch) => updateClip(clipId, patch),
            moveToPlayhead: (clipId) => moveClip(clipId, storeApi.getState().playback.time),
          })}
        />
      ) : null}
      {dialog?.kind === "volume" && dialogClip ? (
        <VolumeDialog
          open
          number={dialogNumber}
          title={t("narrationTrack.volumeTitle", { number: dialogNumber })}
          volume={dialogClip.volume}
          onConfirm={(volume) => updateClip(dialogClip.id, { volume })}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "trim" && dialogClip && dialogAudio ? (
        <TrimDialog
          open
          number={dialogNumber}
          title={t("narrationTrack.trimTitle", { number: dialogNumber })}
          clip={dialogClip}
          fileDuration={dialogAudio.duration}
          peaksUrl={dialogAudio.peaksUrl}
          audioUrl={dialogAudio.audioUrl}
          onConfirm={(trimStart, trimEnd) => updateClip(dialogClip.id, { trimStart, trimEnd })}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={removeClipItem !== undefined}
        title={t("narrationTrack.removeTitle")}
        message={t("narrationTrack.removeMessage", {
          number: removeClipItem ? narration.indexOf(removeClipItem) + 1 : 0,
        })}
        onConfirm={confirmedRemove}
        onCancel={() => setConfirmRemove(null)}
      />
    </section>
  );
}
