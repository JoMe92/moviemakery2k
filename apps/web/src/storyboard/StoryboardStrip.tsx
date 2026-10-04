import { useDroppable } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/useT";
import { timelineOf } from "../player/controls";
import { isTouchLayout, useLayoutMode } from "../shell/layoutMode";
import { scrollIntoView, useRevealRequest } from "../shell/reveal";
import { SLIDE_DURATION, TRANSITION_DURATION } from "../store/projectOps";
import { useAppStore } from "../store/useAppStore";
import { slideIndexAt } from "../timeline/timeline";
import { TransitionSheet } from "../transitions/TransitionSheet";
import { catalogName } from "../transitions/transitionName";
import { Button } from "../ui/Button";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { DurationDialog } from "../ui/DurationDialog";
import { usePinch } from "../ui/usePinch";
import { STRIP_DROPPABLE_ID } from "./dropLogic";
import { SlideTile } from "./SlideTile";
import { useInsertIndex } from "./StoryboardDnd";
import styles from "./StoryboardStrip.module.css";
import { stepTileSize, useTileSize } from "./tileSize";
import { VideoTrimDialog } from "./VideoTrimDialog";

type Target = { kind: "slide" | "transition" | "effect"; slideId: string };
type MenuState = Target & { x: number; y: number };

/**
 * Storyboard strip: sortable tiles with transition slots in between; accepts
 * pictures from the collection at the insertion marker.
 * Properties dialogs for picture duration and transition.
 */
export function StoryboardStrip() {
  const { t, locale } = useT();
  const slides = useAppStore((s) => s.slides);
  const media = useAppStore((s) => s.media);
  const catalog = useAppStore((s) => s.catalog);
  const selection = useAppStore((s) => s.selection);
  const select = useAppStore((s) => s.select);
  const removeSlide = useAppStore((s) => s.removeSlide);
  const setSlideDuration = useAppStore((s) => s.setSlideDuration);
  const setVideoTrim = useAppStore((s) => s.setVideoTrim);
  const setTransitionDuration = useAppStore((s) => s.setTransitionDuration);
  const removeTransition = useAppStore((s) => s.removeTransition);
  const setEffect = useAppStore((s) => s.setEffect);
  const insertIndex = useInsertIndex();
  // Phones and tablets add pictures via the taskbar instead of dragging.
  const layout = useLayoutMode();
  const stepHint = layout.mode !== "wide";
  const touch = isTouchLayout(layout);
  const tileSize = useTileSize();
  // Two-finger zoom of the tile size (design.md D12).
  const pinch = usePinch(
    () => stepTileSize(1),
    () => stepTileSize(-1),
    touch,
  );
  // Transition sheet of one slot (touch operation, add-mobile-layout D9).
  const [transitionSheet, setTransitionSheet] = useState<string | null>(null);
  // During playback: the picture currently visible (changes only when the picture changes).
  const playingIndex = useAppStore((s) =>
    s.playback.playing ? slideIndexAt(timelineOf(s.slides), s.playback.time) : null,
  );
  const { setNodeRef, isOver } = useDroppable({
    id: STRIP_DROPPABLE_ID,
    data: { type: "strip" },
  });
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<Target | null>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement>());

  // Action bar and "⋯" (touch operation) open the same dialogs and menus.
  const editRequest = useAppStore((s) => s.editRequest);
  const seenEdit = useRef(editRequest?.seq ?? 0);
  useEffect(() => {
    if (!editRequest || editRequest.seq === seenEdit.current) return;
    seenEdit.current = editRequest.seq;
    if (!("slideId" in editRequest)) return;
    const { slideId } = editRequest;
    if (editRequest.kind === "slideDuration") setDialog({ kind: "slide", slideId });
    else if (editRequest.kind === "transition") {
      if (touch) setTransitionSheet(slideId);
      else setDialog({ kind: "transition", slideId });
    } else {
      const rect = tiles.current.get(slideId)?.getBoundingClientRect();
      setMenu({
        kind: "slide",
        slideId,
        x: rect ? rect.left + rect.width / 2 : 0,
        y: rect ? rect.top + rect.height / 2 : 0,
      });
    }
  }, [editRequest, touch]);

  const remove = (slideId: string) => {
    const index = slides.findIndex((s) => s.id === slideId);
    const neighbour = slides[index + 1] ?? slides[index - 1];
    removeSlide(slideId);
    if (neighbour) {
      select({ kind: "slide", slideId: neighbour.id });
      setTimeout(() => tiles.current.get(neighbour.id)?.focus(), 0);
    }
  };

  const numberOf = (slideId: string) => slides.findIndex((s) => s.id === slideId) + 1;
  const dialogSlide = dialog ? slides.find((s) => s.id === dialog.slideId) : undefined;
  const dialogTransition =
    dialog?.kind === "transition" ? (dialogSlide?.transitionIn ?? null) : null;
  const dialogVideoItem =
    dialogSlide?.kind === "video" ? media.find((m) => m.id === dialogSlide.mediaId) : undefined;
  const transitionName = (id: string) => catalogName(catalog, id, locale);

  const hasEffect = (slideId: string) => Boolean(slides.find((s) => s.id === slideId)?.effectId);

  const menuItems = (m: MenuState): ContextMenuItem[] => {
    if (m.kind === "effect") {
      // Effect slot: the one entry the spec asks for (add-effects-catalog D4).
      return [
        {
          label: t("storyboard.removeEffect"),
          disabled: !hasEffect(m.slideId),
          onSelect: () => setEffect(m.slideId, null),
        },
      ];
    }
    if (m.kind === "slide") {
      return [
        { label: t("storyboard.remove"), onSelect: () => remove(m.slideId) },
        {
          label: t("storyboard.removeEffect"),
          disabled: !hasEffect(m.slideId),
          onSelect: () => setEffect(m.slideId, null),
        },
        {
          label: t("storyboard.properties"),
          onSelect: () => setDialog({ kind: "slide", slideId: m.slideId }),
        },
      ];
    }
    const hasTransition = Boolean(slides.find((s) => s.id === m.slideId)?.transitionIn);
    return [
      {
        label: t("storyboard.properties"),
        disabled: !hasTransition,
        onSelect: () => setDialog({ kind: "transition", slideId: m.slideId }),
      },
      {
        label: t("storyboard.removeTransition"),
        disabled: !hasTransition,
        onSelect: () => removeTransition(m.slideId),
      },
    ];
  };

  // Adding from the collection asks for the new picture to be shown; the
  // strip owns the tiles and the scroll container (app-shell design.md D6).
  useRevealRequest("slide", tiles);

  const playingId = playingIndex === null ? null : (slides[playingIndex]?.id ?? null);
  useEffect(() => {
    if (playingId) scrollIntoView(tiles.current.get(playingId));
  }, [playingId]);

  const empty = slides.length === 0;

  return (
    <div
      ref={setNodeRef}
      className={styles.strip}
      data-testid="storyboard-strip"
      data-tile-size={tileSize}
      {...pinch}
      data-over={(empty && isOver && insertIndex !== null) || undefined}
    >
      {empty ? (
        <p className={styles.hint}>
          {t(stepHint ? "shell.storyboardHintTouch" : "shell.storyboardHint")}
        </p>
      ) : (
        <SortableContext items={slides.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
          <ol className={styles.list} aria-label={t("storyboard.list")}>
            {slides.map((slide, i) => (
              <SlideTile
                key={slide.id}
                slide={slide}
                number={i + 1}
                media={media.find((m) => m.id === slide.mediaId)}
                selected={selection?.slideId === slide.id}
                playing={playingId === slide.id}
                marker={
                  insertIndex === i
                    ? "before"
                    : insertIndex === slides.length && i === slides.length - 1
                      ? "after"
                      : null
                }
                tileRef={(el) => {
                  if (el) tiles.current.set(slide.id, el);
                  else tiles.current.delete(slide.id);
                }}
                onSelect={() => select({ kind: "slide", slideId: slide.id })}
                onRemove={() => remove(slide.id)}
                onMenu={(x, y) => setMenu({ kind: "slide", slideId: slide.id, x, y })}
                onProperties={() => setDialog({ kind: "slide", slideId: slide.id })}
                onTransitionProperties={() => setDialog({ kind: "transition", slideId: slide.id })}
                onTransitionRemove={() => removeTransition(slide.id)}
                onTransitionMenu={(x, y) =>
                  setMenu({ kind: "transition", slideId: slide.id, x, y })
                }
                onTransitionActivate={touch ? () => setTransitionSheet(slide.id) : undefined}
                onEffectRemove={() => setEffect(slide.id, null)}
                onEffectMenu={(x, y) => setMenu({ kind: "effect", slideId: slide.id, x, y })}
              />
            ))}
          </ol>
        </SortableContext>
      )}
      {menu ? (
        <ContextMenu
          label={
            menu.kind === "slide"
              ? t("storyboard.slideMenu", { number: numberOf(menu.slideId) })
              : menu.kind === "effect"
                ? t("storyboard.effectSlot", { number: numberOf(menu.slideId) })
                : t("storyboard.transitionBefore", { number: numberOf(menu.slideId) })
          }
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={menuItems(menu)}
        />
      ) : null}
      <TransitionSheet slideId={transitionSheet} onClose={() => setTransitionSheet(null)} />
      <DurationDialog
        open={dialog?.kind === "slide" && dialogSlide?.kind === "image"}
        title={t("storyboard.slideProperties", { number: dialog ? numberOf(dialog.slideId) : "" })}
        label={t("storyboard.slideDuration")}
        value={dialogSlide?.kind === "image" ? dialogSlide.duration : SLIDE_DURATION.default}
        range={SLIDE_DURATION}
        touchStep={0.5}
        onConfirm={(value) => (dialog ? setSlideDuration(dialog.slideId, value) : false)}
        onClose={() => setDialog(null)}
      />
      {dialogSlide?.kind === "video" && dialogVideoItem?.kind === "video" ? (
        <VideoTrimDialog
          open={dialog?.kind === "slide"}
          number={dialog ? numberOf(dialog.slideId) : 0}
          clip={dialogSlide}
          video={dialogVideoItem}
          onConfirm={(trimIn, trimOut) =>
            dialog ? setVideoTrim(dialog.slideId, trimIn, trimOut) : false
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
      <DurationDialog
        open={dialogTransition !== null}
        title={t("storyboard.transitionBefore", {
          number: dialog ? numberOf(dialog.slideId) : "",
        })}
        label={t("storyboard.transitionDuration")}
        value={dialogTransition?.duration ?? 1.25}
        range={TRANSITION_DURATION}
        touchStep={0.25}
        onConfirm={(value) => (dialog ? setTransitionDuration(dialog.slideId, value) : false)}
        onClose={() => setDialog(null)}
        extraAction={
          <Button
            onClick={() => {
              if (dialog) removeTransition(dialog.slideId);
              setDialog(null);
            }}
          >
            {t("storyboard.removeTransition")}
          </Button>
        }
      >
        {dialogTransition ? (
          <p className={styles.dialogInfo}>
            {t("storyboard.transition")}{" "}
            <strong>{transitionName(dialogTransition.transitionId)}</strong>
          </p>
        ) : null}
      </DurationDialog>
    </div>
  );
}
