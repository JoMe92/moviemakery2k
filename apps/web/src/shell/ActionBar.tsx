import type { ReactNode } from "react";
import { useT } from "../i18n/useT";
import { useAppStore } from "../store/useAppStore";
import styles from "./ActionBar.module.css";
import { isTouchLayout, useLayoutMode } from "./layoutMode";

interface Action {
  id: string;
  glyph: string;
  label: string;
  run: () => void;
  disabled?: boolean;
  pressed?: boolean;
}

/**
 * Actions of the selected element with touch operation (add-mobile-layout
 * design.md D6), shown above the taskbar only while something is selected.
 * Every action calls the same store function or opens the same dialog as the
 * desktop menus; the dialogs live in the storyboard strip and music track.
 */
export function ActionBar() {
  const { t } = useT();
  const touch = isTouchLayout(useLayoutMode());
  const slides = useAppStore((s) => s.slides);
  const music = useAppStore((s) => s.music);
  const media = useAppStore((s) => s.media);
  const selection = useAppStore((s) => s.selection);
  const musicSelection = useAppStore((s) => s.musicSelection);
  const select = useAppStore((s) => s.select);
  const selectMusicClip = useAppStore((s) => s.selectMusicClip);
  const moveSlide = useAppStore((s) => s.moveSlide);
  const removeSlide = useAppStore((s) => s.removeSlide);
  const moveMusicClip = useAppStore((s) => s.moveMusicClip);
  const removeMusicClip = useAppStore((s) => s.removeMusicClip);
  const updateMusicClip = useAppStore((s) => s.updateMusicClip);
  const requestEdit = useAppStore((s) => s.requestEdit);

  if (!touch) return null;

  let label: string;
  let actions: Action[];
  const slideIndex = selection ? slides.findIndex((s) => s.id === selection.slideId) : -1;
  const clipIndex = musicSelection === null ? -1 : music.findIndex((c) => c.id === musicSelection);

  if (slideIndex >= 0) {
    const slideId = slides[slideIndex]?.id ?? "";
    const number = slideIndex + 1;
    label = t("storyboard.slideMenu", { number });
    actions = [
      {
        id: "duration",
        glyph: "⏱",
        label: t("actions.duration"),
        run: () => requestEdit({ kind: "slideDuration", slideId }),
      },
      {
        id: "left",
        glyph: "◀",
        label: t("actions.moveLeft"),
        disabled: slideIndex === 0,
        run: () => moveSlide(slideIndex, slideIndex - 1),
      },
      {
        id: "right",
        glyph: "▶",
        label: t("actions.moveRight"),
        disabled: slideIndex === slides.length - 1,
        run: () => moveSlide(slideIndex, slideIndex + 1),
      },
      {
        id: "transition",
        glyph: "◩",
        label: t("actions.transitionBefore"),
        disabled: slideIndex === 0,
        run: () => requestEdit({ kind: "transition", slideId }),
      },
      {
        id: "remove",
        glyph: "✕",
        label: t("actions.remove"),
        run: () => {
          // Like Delete on the desktop: the neighbour becomes the selection.
          const neighbour = slides[slideIndex + 1] ?? slides[slideIndex - 1];
          removeSlide(slideId);
          if (neighbour) select({ kind: "slide", slideId: neighbour.id });
        },
      },
      {
        id: "more",
        glyph: "⋯",
        label: t("actions.more"),
        run: () => requestEdit({ kind: "slideMenu", slideId }),
      },
    ];
  } else if (clipIndex >= 0) {
    const clip = music[clipIndex];
    if (!clip) return null;
    const hasAudio = media.some((m) => m.id === clip.mediaId && m.kind === "audio");
    label = t("musicTrack.clipMenu", { number: clipIndex + 1 });
    actions = [
      {
        id: "volume",
        glyph: "🔊",
        label: t("actions.volume"),
        run: () => requestEdit({ kind: "volume", clipId: clip.id }),
      },
      {
        id: "trim",
        glyph: "✂",
        label: t("actions.trim"),
        disabled: !hasAudio,
        run: () => requestEdit({ kind: "trim", clipId: clip.id }),
      },
      {
        id: "fadeIn",
        glyph: "◢",
        label: t("actions.fadeIn"),
        pressed: clip.fadeIn,
        run: () => updateMusicClip(clip.id, { fadeIn: !clip.fadeIn }),
      },
      {
        id: "fadeOut",
        glyph: "◣",
        label: t("actions.fadeOut"),
        pressed: clip.fadeOut,
        run: () => updateMusicClip(clip.id, { fadeOut: !clip.fadeOut }),
      },
      {
        id: "left",
        glyph: "◀",
        label: t("actions.moveLeft"),
        disabled: clipIndex === 0,
        run: () => moveMusicClip(clipIndex, clipIndex - 1),
      },
      {
        id: "right",
        glyph: "▶",
        label: t("actions.moveRight"),
        disabled: clipIndex === music.length - 1,
        run: () => moveMusicClip(clipIndex, clipIndex + 1),
      },
      {
        id: "remove",
        glyph: "✕",
        label: t("actions.remove"),
        run: () => {
          const neighbour = music[clipIndex + 1] ?? music[clipIndex - 1];
          removeMusicClip(clip.id);
          if (neighbour) selectMusicClip(neighbour.id);
        },
      },
      {
        id: "more",
        glyph: "⋯",
        label: t("actions.more"),
        run: () => requestEdit({ kind: "musicMenu", clipId: clip.id }),
      },
    ];
  } else {
    return null;
  }

  return (
    <div role="toolbar" aria-label={`${t("actions.bar")}: ${label}`} className={styles.bar}>
      {actions.map(
        (a): ReactNode => (
          <button
            key={a.id}
            type="button"
            className={styles.action}
            disabled={a.disabled}
            aria-pressed={a.pressed}
            onClick={a.run}
          >
            <span className={styles.glyph} aria-hidden="true">
              {a.glyph}
            </span>
            <span className={styles.label}>{a.label}</span>
          </button>
        ),
      )}
    </div>
  );
}
