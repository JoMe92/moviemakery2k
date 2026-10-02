import { useDroppable } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { useId, useMemo, useRef, useState } from "react";
import { formatClipDuration } from "../i18n/format";
import type { Translate } from "../i18n/t";
import { useT } from "../i18n/useT";
import type { AudioItem, MusicClip } from "../lib/apiClient";
import { timelineOf } from "../player/controls";
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
import styles from "./MusicTrack.module.css";

interface MenuState {
  clipId: string;
  x: number;
  y: number;
}

export interface MusicClipMenuActions {
  remove: (clipId: string) => void;
}

/**
 * Context menu entries of a music clip. Extension point for WEB-029
 * (spec music-track "Musikstücke bearbeiten"): "Volume…", "Fade In",
 * "Fade Out" (toggles) and "Trim…" are appended here.
 */
export function musicClipMenuItems(
  clip: MusicClip,
  t: Translate,
  actions: MusicClipMenuActions,
): ContextMenuItem[] {
  return [{ label: t("musicTrack.remove"), onSelect: () => actions.remove(clip.id) }];
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
  const insertIndex = useMusicInsertIndex();
  const { notice } = useDropNotice();
  const { setNodeRef, isOver } = useDroppable({
    id: MUSIC_DROPPABLE_ID,
    data: { type: "musicStrip" },
  });
  const [menu, setMenu] = useState<MenuState | null>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement>());

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
          <p className={styles.hint}>{t("musicTrack.emptyHint")}</p>
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
          items={musicClipMenuItems(menuClip, t, { remove })}
        />
      ) : null}
    </section>
  );
}
