import { useDroppable } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { useRef, useState } from "react";
import { STORYBOARD_EMPTY_HINT } from "../shell/StoryboardPane";
import { useAppStore } from "../store/useAppStore";
import { ContextMenu } from "../ui/ContextMenu";
import { STRIP_DROPPABLE_ID } from "./dropLogic";
import { SlideTile } from "./SlideTile";
import { useInsertIndex } from "./StoryboardDnd";
import styles from "./StoryboardStrip.module.css";

interface MenuState {
  slideId: string;
  x: number;
  y: number;
}

/**
 * Bildstreifen im Storyboard: sortierbare Kacheln mit Übergangsplätzen
 * dazwischen; nimmt Bilder aus der Sammlung an der Einfügemarke auf.
 */
export function StoryboardStrip() {
  const slides = useAppStore((s) => s.slides);
  const media = useAppStore((s) => s.media);
  const selection = useAppStore((s) => s.selection);
  const select = useAppStore((s) => s.select);
  const removeSlide = useAppStore((s) => s.removeSlide);
  const insertIndex = useInsertIndex();
  const { setNodeRef, isOver } = useDroppable({
    id: STRIP_DROPPABLE_ID,
    data: { type: "strip" },
  });
  const [menu, setMenu] = useState<MenuState | null>(null);
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
                onMenu={(x, y) => setMenu({ slideId: slide.id, x, y })}
              />
            ))}
          </ol>
        </SortableContext>
      )}
      {menu ? (
        <ContextMenu
          label={`Bild ${slides.findIndex((s) => s.id === menu.slideId) + 1} des Storyboards`}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: "Entfernen", onSelect: () => remove(menu.slideId) },
            // TASK-WEB-008: Eigenschaftendialog (Dauer).
            { label: "Eigenschaften…", onSelect: () => {}, disabled: true },
          ]}
        />
      ) : null}
    </div>
  );
}
