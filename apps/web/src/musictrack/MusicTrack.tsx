import { useDroppable } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatClipDuration } from "../i18n/format";
import type { Translate } from "../i18n/t";
import { useT } from "../i18n/useT";
import type { AudioItem, MusicClip } from "../lib/apiClient";
import { timelineOf } from "../player/controls";
import { useLayoutMode } from "../shell/layoutMode";
import { audioDurations } from "../store/musicOps";
import { useAppStore } from "../store/useAppStore";
import {
  type DropRejection,
  MUSIC_DROPPABLE_ID,
  musicClipSortableId,
} from "../storyboard/dropLogic";
import { useDropNotice, useMusicInsertIndex } from "../storyboard/StoryboardDnd";
import { musicDuration } from "../timeline/music";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { MusicClipBlock } from "./MusicClipBlock";
import { TrimDialog, VolumeDialog } from "./MusicClipDialogs";
import styles from "./MusicTrack.module.css";

interface MenuState {
  clipId: string;
  x: number;
  y: number;
}

type DialogState = { kind: "volume" | "trim"; clipId: string };

export interface MusicClipMenuActions {
  remove: (clipId: string) => void;
  volume: (clipId: string) => void;
  /** Absent if the audio file is missing (no duration to trim against). */
  trim?: (clipId: string) => void;
  setFade: (clipId: string, patch: { fadeIn: boolean } | { fadeOut: boolean }) => void;
}

/**
 * Context menu entries of a music clip (spec music-track "Musikstücke
 * bearbeiten"): "Remove", "Volume…", "Fade In" and "Fade Out" (toggles with a
 * check mark) and "Trim…".
 */
export function musicClipMenuItems(
  clip: MusicClip,
  t: Translate,
  actions: MusicClipMenuActions,
): ContextMenuItem[] {
  const { trim } = actions;
  return [
    { label: t("musicTrack.remove"), onSelect: () => actions.remove(clip.id) },
    { label: t("musicTrack.volume"), onSelect: () => actions.volume(clip.id) },
    {
      label: t("musicTrack.fadeIn"),
      checked: clip.fadeIn,
      onSelect: () => actions.setFade(clip.id, { fadeIn: !clip.fadeIn }),
    },
    {
      label: t("musicTrack.fadeOut"),
      checked: clip.fadeOut,
      onSelect: () => actions.setFade(clip.id, { fadeOut: !clip.fadeOut }),
    },
    {
      label: t("musicTrack.trim"),
      disabled: trim === undefined,
      onSelect: () => trim?.(clip.id),
    },
  ];
}

const NOTICE_KEY = {
  audioOnStoryboard: "musicTrack.rejectAudio",
  pictureOnMusic: "musicTrack.rejectPicture",
} as const satisfies Record<DropRejection, string>;

/**
 * "Audio/Music" track below the storyboard strip (add-music-track D7): one
 * block per music clip in playing order, width proportional to its length.
 * Accepts audio from the collection (drag and drop, keyboard), reorders and
 * removes clips; refuses pictures with a hint and says when the music is cut
 * at the end of the movie.
 */
export function MusicTrack() {
  const { t, locale } = useT();
  const headingId = useId();
  const music = useAppStore((s) => s.music);
  const media = useAppStore((s) => s.media);
  const slides = useAppStore((s) => s.slides);
  const musicSelection = useAppStore((s) => s.musicSelection);
  const selectMusicClip = useAppStore((s) => s.selectMusicClip);
  const removeMusicClip = useAppStore((s) => s.removeMusicClip);
  const updateMusicClip = useAppStore((s) => s.updateMusicClip);
  const insertIndex = useMusicInsertIndex();
  // Phones add music via the collection sheet instead of dragging.
  const compact = useLayoutMode().mode === "compact";
  const { notice } = useDropNotice();
  const { setNodeRef, isOver } = useDroppable({
    id: MUSIC_DROPPABLE_ID,
    data: { type: "musicStrip" },
  });
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement>());

  // Action bar and "⋯" (touch operation) open the same dialogs and menus.
  const editRequest = useAppStore((s) => s.editRequest);
  const seenEdit = useRef(editRequest?.seq ?? 0);
  useEffect(() => {
    if (!editRequest || editRequest.seq === seenEdit.current) return;
    seenEdit.current = editRequest.seq;
    if (!("clipId" in editRequest)) return;
    const { clipId } = editRequest;
    if (editRequest.kind === "volume") setDialog({ kind: "volume", clipId });
    else if (editRequest.kind === "trim") setDialog({ kind: "trim", clipId });
    else {
      const rect = tiles.current.get(clipId)?.getBoundingClientRect();
      setMenu({
        clipId,
        x: rect ? rect.left + rect.width / 2 : 0,
        y: rect ? rect.top + rect.height / 2 : 0,
      });
    }
  }, [editRequest]);

  const durations = useMemo(() => audioDurations(media), [media]);
  const total = musicDuration(music, durations);
  const movie = timelineOf(slides).duration;
  // Spec music-track "Musik am Filmende": the music is cut at the end of the movie.
  const cut = slides.length > 0 && movie > 0 && total > movie;

  const remove = (clipId: string) => {
    const index = music.findIndex((c) => c.id === clipId);
    const neighbour = music[index + 1] ?? music[index - 1];
    removeMusicClip(clipId);
    if (neighbour) {
      selectMusicClip(neighbour.id);
      setTimeout(() => tiles.current.get(neighbour.id)?.focus(), 0);
    }
  };

  const empty = music.length === 0;
  const menuClip = menu ? music.find((c) => c.id === menu.clipId) : undefined;
  const audioOf = (clip: MusicClip | undefined) =>
    clip
      ? media.find((m): m is AudioItem => m.id === clip.mediaId && m.kind === "audio")
      : undefined;
  const dialogClip = dialog ? music.find((c) => c.id === dialog.clipId) : undefined;
  const dialogNumber = dialogClip ? music.indexOf(dialogClip) + 1 : 0;
  const dialogAudio = audioOf(dialogClip);

  return (
    <section className={styles.track} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.label}>
        {t("musicTrack.label")}
      </h3>
      <div
        ref={setNodeRef}
        className={styles.lane}
        data-testid="music-strip"
        data-over={(isOver && insertIndex !== null) || undefined}
      >
        {empty ? (
          <p className={styles.hint}>
            {t(compact ? "musicTrack.emptyHintTouch" : "musicTrack.emptyHint")}
          </p>
        ) : (
          <SortableContext
            items={music.map((c) => musicClipSortableId(c.id))}
            strategy={horizontalListSortingStrategy}
          >
            <ol className={styles.list} aria-label={t("musicTrack.list")}>
              {music.map((clip, i) => {
                const item = media.find(
                  (m): m is AudioItem => m.id === clip.mediaId && m.kind === "audio",
                );
                return (
                  <MusicClipBlock
                    key={clip.id}
                    clip={clip}
                    number={i + 1}
                    item={item}
                    length={musicDuration([clip], durations)}
                    selected={musicSelection === clip.id}
                    marker={
                      insertIndex === i
                        ? "before"
                        : insertIndex === music.length && i === music.length - 1
                          ? "after"
                          : null
                    }
                    tileRef={(el) => {
                      if (el) tiles.current.set(clip.id, el);
                      else tiles.current.delete(clip.id);
                    }}
                    onSelect={() => selectMusicClip(clip.id)}
                    onRemove={() => remove(clip.id)}
                    onMenu={(x, y) => setMenu({ clipId: clip.id, x, y })}
                  />
                );
              })}
            </ol>
          </SortableContext>
        )}
      </div>
      <div className={styles.status}>
        <p role="status" className={styles.notice}>
          {notice ? t(NOTICE_KEY[notice]) : null}
        </p>
        {cut ? (
          <p className={styles.cut} data-testid="music-cut-hint">
            {t("musicTrack.cutHint", {
              music: formatClipDuration(locale, total),
              movie: formatClipDuration(locale, movie),
            })}
          </p>
        ) : null}
      </div>
      {menu && menuClip ? (
        <ContextMenu
          label={t("musicTrack.clipMenu", { number: music.indexOf(menuClip) + 1 })}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={musicClipMenuItems(menuClip, t, {
            remove,
            volume: (clipId) => setDialog({ kind: "volume", clipId }),
            trim: audioOf(menuClip) ? (clipId) => setDialog({ kind: "trim", clipId }) : undefined,
            setFade: (clipId, patch) => updateMusicClip(clipId, patch),
          })}
        />
      ) : null}
      {dialog?.kind === "volume" && dialogClip ? (
        <VolumeDialog
          open
          number={dialogNumber}
          volume={dialogClip.volume}
          onConfirm={(volume) => updateMusicClip(dialogClip.id, { volume })}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "trim" && dialogClip && dialogAudio ? (
        <TrimDialog
          open
          number={dialogNumber}
          clip={dialogClip}
          fileDuration={dialogAudio.duration}
          peaksUrl={dialogAudio.peaksUrl}
          audioUrl={dialogAudio.audioUrl}
          onConfirm={(trimStart, trimEnd) => updateMusicClip(dialogClip.id, { trimStart, trimEnd })}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </section>
  );
}
