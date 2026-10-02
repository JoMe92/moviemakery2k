import {
  type Active,
  type Announcements,
  type ClientRect,
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type DragStartEvent,
  type DroppableContainer,
  KeyboardCode,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  type Over,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { createContext, type ReactNode, useContext, useState } from "react";
import { translator } from "../i18n/t";
import { useT } from "../i18n/useT";
import type { AppState } from "../store/appStore";
import { useAppStore, useAppStoreApi } from "../store/useAppStore";
import { TransitionIcon } from "../transitions/TransitionIcon";
import { catalogName } from "../transitions/transitionName";
import {
  type DragItem,
  type DropTarget,
  insertionIndex,
  resolveDrop,
  STRIP_DROPPABLE_ID,
} from "./dropLogic";
import { StoryboardPointerSensor } from "./pointerSensor";
import styles from "./StoryboardStrip.module.css";

/** Einfügemarke für Bilder aus der Sammlung (0…n) oder null. */
const InsertIndexContext = createContext<number | null>(null);
export const useInsertIndex = () => useContext(InsertIndexContext);

const dragItem = (active: Active | null): DragItem | null =>
  (active?.data.current as DragItem | undefined) ?? null;

const isSlideContainer = (c: DroppableContainer) =>
  (c.data.current as DragItem | undefined)?.type === "slide";

const isSlotContainer = (c: DroppableContainer) =>
  (c.data.current as DropTarget | undefined)?.type === "transitionSlot";

function center(rect: ClientRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function contains(rect: ClientRect, p: { x: number; y: number }) {
  return p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
}

function pointRect(p: { x: number; y: number }): ClientRect {
  return { left: p.x, right: p.x, top: p.y, bottom: p.y, width: 0, height: 0 };
}

/**
 * Ziel nur innerhalb des Bildstreifens: die Kachel, deren Mitte dem Zeiger
 * (Tastatur: der gezogenen Kachel) am nächsten ist; ohne Kacheln der Streifen selbst.
 * Übergänge zielen nur auf Übergangsplätze (der nächstgelegene Platz).
 */
const collisionDetection: CollisionDetection = (args) => {
  const stripRect = args.droppableRects.get(STRIP_DROPPABLE_ID);
  const strip = args.droppableContainers.find((c) => c.id === STRIP_DROPPABLE_ID);
  if (!stripRect || !strip) return [];
  const point = args.pointerCoordinates ?? center(args.collisionRect);
  if (!contains(stripRect, point)) return [];
  if (dragItem(args.active)?.type === "transition") {
    const slots = args.droppableContainers.filter(isSlotContainer);
    if (slots.length === 0) return [];
    return closestCenter({ ...args, collisionRect: pointRect(point), droppableContainers: slots });
  }
  const slides = args.droppableContainers.filter(isSlideContainer);
  if (slides.length === 0) return [{ id: strip.id, data: { droppableContainer: strip, value: 0 } }];
  return closestCenter({ ...args, collisionRect: pointRect(point), droppableContainers: slides });
};

const ARROWS: string[] = [
  KeyboardCode.Left,
  KeyboardCode.Right,
  KeyboardCode.Up,
  KeyboardCode.Down,
];

/** Tastatur für Übergänge: Pfeil nach unten → erster Platz, links/rechts → Nachbarplatz. */
const transitionCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!ARROWS.includes(event.code)) return undefined;
  event.preventDefault();
  const rect = context.collisionRect;
  const stripRect = context.droppableRects.get(STRIP_DROPPABLE_ID);
  if (!rect || !stripRect) return undefined;
  const slots = context.droppableContainers
    .getEnabled()
    .filter(isSlotContainer)
    .map((c) => context.droppableRects.get(c.id))
    .filter((r): r is ClientRect => r !== undefined)
    .sort((a, b) => a.left - b.left)
    .map((r) => ({ x: center(r).x - rect.width / 2, y: center(r).y - rect.height / 2 }));
  if (slots.length === 0) return undefined;
  if (!contains(stripRect, center(rect))) {
    return event.code === KeyboardCode.Down ? slots[0] : undefined;
  }
  let current = 0;
  slots.forEach((slot, i) => {
    if (Math.abs(slot.x - rect.left) < Math.abs((slots[current]?.x ?? 0) - rect.left)) current = i;
  });
  if (event.code === KeyboardCode.Right) return slots[Math.min(current + 1, slots.length - 1)];
  if (event.code === KeyboardCode.Left) return slots[Math.max(current - 1, 0)];
  return undefined;
};

/**
 * Tastatur: Kacheln im Streifen wie gewohnt sortierbar; ein Bild aus der
 * Sammlung springt mit Pfeil nach unten ans Ende des Streifens und wandert dort
 * mit Pfeil links/rechts von Einfügeposition zu Einfügeposition.
 */
const coordinateGetter: KeyboardCoordinateGetter = (event, args) => {
  const { context } = args;
  const type = dragItem(context.active)?.type;
  if (type === "transition") return transitionCoordinates(event, args);
  if (type !== "media") return sortableKeyboardCoordinates(event, args);
  if (!ARROWS.includes(event.code)) return undefined;
  event.preventDefault();
  const rect = context.collisionRect;
  const stripRect = context.droppableRects.get(STRIP_DROPPABLE_ID);
  if (!rect || !stripRect) return undefined;

  const slideRects = context.droppableContainers
    .getEnabled()
    .filter(isSlideContainer)
    .map((c) => context.droppableRects.get(c.id))
    .filter((r): r is ClientRect => r !== undefined)
    .sort((a, b) => a.left - b.left);
  // Position der gezogenen Kachel je Einfügestelle: knapp links der Kachelmitte
  // (= davor), für das Ende knapp rechts der letzten Kachelmitte (= dahinter).
  const slots = slideRects.map((r) => ({
    x: r.left + r.width / 2 - 1 - rect.width / 2,
    y: r.top + r.height / 2 - rect.height / 2,
  }));
  const last = slideRects[slideRects.length - 1];
  if (last) {
    slots.push({
      x: last.left + last.width / 2 + 1 - rect.width / 2,
      y: last.top + last.height / 2 - rect.height / 2,
    });
  } else {
    slots.push({
      x: stripRect.left + 8,
      y: stripRect.top + stripRect.height / 2 - rect.height / 2,
    });
  }

  if (!contains(stripRect, center(rect))) {
    return event.code === KeyboardCode.Down ? slots[slots.length - 1] : undefined;
  }
  let current = 0;
  slots.forEach((slot, i) => {
    if (Math.abs(slot.x - rect.left) < Math.abs((slots[current]?.x ?? 0) - rect.left)) current = i;
  });
  if (event.code === KeyboardCode.Right) return slots[Math.min(current + 1, slots.length - 1)];
  if (event.code === KeyboardCode.Left) return slots[Math.max(current - 1, 0)];
  return undefined;
};

/** Ziel aus dnd-kit-Ereignis: Kachel samt Seite (Zeiger links/rechts der Mitte) oder Streifen. */
function dropTarget(event: DragMoveEvent | DragEndEvent): DropTarget | null {
  const over: Over | null = event.over;
  if (!over) return null;
  const slot = over.data.current as DropTarget | undefined;
  if (slot?.type === "transitionSlot") return { type: "transitionSlot", slideId: slot.slideId };
  const data = over.data.current as DragItem | undefined;
  if (data?.type !== "slide") return over.id === STRIP_DROPPABLE_ID ? { type: "strip" } : null;
  const activator = event.activatorEvent;
  const translated = event.active.rect.current.translated;
  const x =
    activator && "clientX" in activator
      ? (activator as PointerEvent).clientX + event.delta.x
      : translated
        ? center(translated).x
        : center(over.rect).x;
  return { type: "slide", slideId: data.slideId, after: x > center(over.rect).x };
}

function describe(state: AppState, item: DragItem | null): string {
  const t = translator(state.locale);
  if (!item) return t("dnd.element");
  if (item.type === "transition") {
    return t("dnd.transition", {
      name: catalogName(state.catalog, item.transitionId, state.locale),
    });
  }
  if (item.type === "media") {
    return t("dnd.picture", {
      name: state.media.find((m) => m.id === item.mediaId)?.filename ?? "",
    });
  }
  const index = state.slides.findIndex((s) => s.id === item.slideId);
  return t("storyboard.slideMenu", { number: index + 1 });
}

/** Drag & Drop für Sammlung und Storyboard (design.md D2: dnd-kit, Zeiger und Tastatur). */
export function StoryboardDnd({ children }: { children: ReactNode }) {
  const store = useAppStoreApi();
  const { t } = useT();
  const slides = useAppStore((s) => s.slides);
  const media = useAppStore((s) => s.media);
  const [active, setActive] = useState<DragItem | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);

  const sensors = useSensors(
    // Small threshold keeps click and double-click working; the own sensor lets
    // the first click right after a drop through (mmy-fa5).
    useSensor(StoryboardPointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  const insertIndex = active?.type === "media" ? insertionIndex(target, slides) : null;

  // Announcements read the locale at call time from the store.
  const tNow = () => translator(store.getState().locale);
  const announcements: Announcements = {
    onDragStart: ({ active: a }) =>
      tNow()("dnd.pickedUp", { item: describe(store.getState(), dragItem(a)) }),
    onDragOver: ({ over }) => {
      const slot = over?.data.current as DropTarget | undefined;
      if (slot?.type === "transitionSlot") {
        const n = store.getState().slides.findIndex((s) => s.id === slot.slideId);
        return tNow()("dnd.overSlot", { number: n + 1 });
      }
      return over ? tNow()("dnd.overStoryboard") : tNow()("dnd.outside");
    },
    onDragEnd: ({ active: a, over }) =>
      over
        ? tNow()("dnd.dropped", { item: describe(store.getState(), dragItem(a)) })
        : tNow()("dnd.noTarget"),
    onDragCancel: () => tNow()("dnd.cancelled"),
  };

  const onDragStart = (event: DragStartEvent) => {
    setActive(dragItem(event.active));
    setTarget(null);
  };
  const onDragMove = (event: DragMoveEvent) => {
    const next = dropTarget(event);
    setTarget((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  };
  const onDragEnd = (event: DragEndEvent) => {
    const state = store.getState();
    const action = resolveDrop(dragItem(event.active), dropTarget(event), state.slides);
    setActive(null);
    setTarget(null);
    if (action.kind === "insert") state.addSlide(action.mediaId, action.index);
    else if (action.kind === "move") state.moveSlide(action.from, action.to);
    else if (action.kind === "setTransition")
      state.setTransition(action.slideId, action.transitionId);
  };
  const onDragCancel = () => {
    setActive(null);
    setTarget(null);
  };

  const overlayMedia =
    active?.type === "media"
      ? media.find((m) => m.id === active.mediaId)
      : active?.type === "slide"
        ? media.find((m) => m.id === slides.find((s) => s.id === active.slideId)?.mediaId)
        : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: t("dnd.instructions"),
        },
      }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <InsertIndexContext.Provider value={insertIndex}>{children}</InsertIndexContext.Provider>
      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className={styles.overlay} data-testid="drag-overlay">
            {overlayMedia ? <img src={overlayMedia.thumbnailUrl} alt="" /> : null}
            {active.type === "transition" ? (
              <TransitionIcon transitionId={active.transitionId} size={94} />
            ) : null}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
