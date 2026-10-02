import { useDroppable } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { useRef, useState } from "react";
import { STORYBOARD_EMPTY_HINT } from "../shell/StoryboardPane";
import { SLIDE_DURATION, TRANSITION_DURATION } from "../store/projectOps";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../ui/Button";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { DurationDialog } from "../ui/DurationDialog";
import { STRIP_DROPPABLE_ID } from "./dropLogic";
import { SlideTile } from "./SlideTile";
import { useInsertIndex } from "./StoryboardDnd";
import styles from "./StoryboardStrip.module.css";

type Target = { kind: "slide" | "transition"; slideId: string };
type MenuState = Target & { x: number; y: number };

/**
 * Bildstreifen im Storyboard: sortierbare Kacheln mit Übergangsplätzen
 * dazwischen; nimmt Bilder aus der Sammlung an der Einfügemarke auf.
 * Eigenschaftendialoge für Bilddauer und Übergang.
 */
export function StoryboardStrip() {
  const slides = useAppStore((s) => s.slides);
  const media = useAppStore((s) => s.media);
  const catalog = useAppStore((s) => s.catalog);
  const selection = useAppStore((s) => s.selection);
  const select = useAppStore((s) => s.select);
  const removeSlide = useAppStore((s) => s.removeSlide);
  const setSlideDuration = useAppStore((s) => s.setSlideDuration);
  const setTransitionDuration = useAppStore((s) => s.setTransitionDuration);
  const removeTransition = useAppStore((s) => s.removeTransition);
  const insertIndex = useInsertIndex();
  const { setNodeRef, isOver } = useDroppable({
    id: STRIP_DROPPABLE_ID,
    data: { type: "strip" },
  });
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<Target | null>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement>());

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
  const transitionName = (id: string) => catalog.find((t) => t.id === id)?.name ?? id;

  const menuItems = (m: MenuState): ContextMenuItem[] => {
    if (m.kind === "slide") {
      return [
        { label: "Entfernen", onSelect: () => remove(m.slideId) },
        {
          label: "Eigenschaften…",
          onSelect: () => setDialog({ kind: "slide", slideId: m.slideId }),
        },
      ];
    }
    const hasTransition = Boolean(slides.find((s) => s.id === m.slideId)?.transitionIn);
    return [
      {
        label: "Eigenschaften…",
        disabled: !hasTransition,
        onSelect: () => setDialog({ kind: "transition", slideId: m.slideId }),
      },
      {
        label: "Übergang entfernen",
        disabled: !hasTransition,
        onSelect: () => removeTransition(m.slideId),
      },
    ];
  };

  const empty = slides.length === 0;

  return (
    <div
      ref={setNodeRef}
      className={styles.strip}
      data-testid="storyboard-strip"
      data-over={(empty && isOver && insertIndex !== null) || undefined}
    >
      {empty ? (
        <p className={styles.hint}>{STORYBOARD_EMPTY_HINT}</p>
      ) : (
        <SortableContext items={slides.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
          <ol className={styles.list} aria-label="Bildstreifen">
            {slides.map((slide, i) => (
              <SlideTile
                key={slide.id}
                slide={slide}
                number={i + 1}
                media={media.find((m) => m.id === slide.mediaId)}
                selected={selection?.slideId === slide.id}
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
              />
            ))}
          </ol>
        </SortableContext>
      )}
      {menu ? (
        <ContextMenu
          label={
            menu.kind === "slide"
              ? `Bild ${numberOf(menu.slideId)} des Storyboards`
              : `Übergang vor Bild ${numberOf(menu.slideId)}`
          }
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={menuItems(menu)}
        />
      ) : null}
      <DurationDialog
        open={dialog?.kind === "slide" && dialogSlide !== undefined}
        title={`Eigenschaften von Bild ${dialog ? numberOf(dialog.slideId) : ""}`}
        label="Bilddauer (Sekunden):"
        value={dialogSlide?.duration ?? SLIDE_DURATION.default}
        range={SLIDE_DURATION}
        onConfirm={(value) => (dialog ? setSlideDuration(dialog.slideId, value) : false)}
        onClose={() => setDialog(null)}
      />
      <DurationDialog
        open={dialogTransition !== null}
        title={`Übergang vor Bild ${dialog ? numberOf(dialog.slideId) : ""}`}
        label="Übergangsdauer (Sekunden):"
        value={dialogTransition?.duration ?? 1.25}
        range={TRANSITION_DURATION}
        onConfirm={(value) => (dialog ? setTransitionDuration(dialog.slideId, value) : false)}
        onClose={() => setDialog(null)}
        extraAction={
          <Button
            onClick={() => {
              if (dialog) removeTransition(dialog.slideId);
              setDialog(null);
            }}
          >
            Übergang entfernen
          </Button>
        }
      >
        {dialogTransition ? (
          <p className={styles.dialogInfo}>
            Übergang: <strong>{transitionName(dialogTransition.transitionId)}</strong>
          </p>
        ) : null}
      </DurationDialog>
    </div>
  );
}
