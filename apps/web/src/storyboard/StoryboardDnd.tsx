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
import { getEventCoordinates } from "@dnd-kit/utilities";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { translator } from "../i18n/t";
import { useT } from "../i18n/useT";
import type { AppState } from "../store/appStore";
import { useAppStore, useAppStoreApi } from "../store/useAppStore";
import { TransitionIcon } from "../transitions/TransitionIcon";
import { catalogName } from "../transitions/transitionName";
import { vibrate } from "../ui/haptics";
import { AudioIcon } from "../ui/icons";
import {
  type DragItem,
  type DropRejection,
  type DropTarget,
  insertionIndex,
  MUSIC_DROPPABLE_ID,
  musicInsertionIndex,
  resolveDrop,
  STRIP_DROPPABLE_ID,
} from "./dropLogic";
import { StoryboardPointerSensor, StoryboardTouchSensor, TOUCH_ACTIVATION } from "./pointerSensor";
import styles from "./StoryboardStrip.module.css";

/** Insertion marker for pictures from the collection (0…n) or null. */
const InsertIndexContext = createContext<number | null>(null);
export const useInsertIndex = () => useContext(InsertIndexContext);

/** Insertion marker for audio on the music track (0…n) or null. */
const MusicInsertIndexContext = createContext<number | null>(null);
export const useMusicInsertIndex = () => useContext(MusicInsertIndexContext);

/** Edge auto-scroll while dragging (add-mobile-layout design.md D8): horizontal strips. */
export const AUTO_SCROLL = { enabled: true } as const;

/** How long the hint about a refused drop stays visible. */
export const DROP_NOTICE_MS = 6000;

interface DropNoticeValue {
  /** Last refused drop (audio on the storyboard, picture on the music track) or null. */
  notice: DropRejection | null;
  /** Show a hint without a drag (e.g. double-click); null hides it. */
  setNotice: (notice: DropRejection | null) => void;
}
const DropNoticeContext = createContext<DropNoticeValue>({
  notice: null,
  setNotice: () => undefined,
});
export const useDropNotice = () => useContext(DropNoticeContext);

const dragItem = (active: Active | null): DragItem | null =>
  (active?.data.current as DragItem | undefined) ?? null;

const isSlideContainer = (c: DroppableContainer) =>
  (c.data.current as DragItem | undefined)?.type === "slide";

const isSlotContainer = (c: DroppableContainer) =>
  (c.data.current as DropTarget | undefined)?.type === "transitionSlot";

const isMusicContainer = (c: DroppableContainer) =>
  (c.data.current as DragItem | undefined)?.type === "music";

const isMusicArea = (c: DroppableContainer) => c.id === MUSIC_DROPPABLE_ID || isMusicContainer(c);

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
 * Targets only inside the storyboard: the tile whose centre is closest to the
 * pointer (keyboard: to the dragged tile); without tiles, the strip itself.
 * Transitions only target transition slots (the nearest slot).
 */
const collisionDetection: CollisionDetection = (args) => {
  const point = args.pointerCoordinates ?? center(args.collisionRect);
  const type = dragItem(args.active)?.type;
  // Music track (add-music-track D7): audio and music clips find the nearest
  // clip (or the empty track); a picture only hits the track itself so the
  // drop is refused with a hint.
  const musicRect = args.droppableRects.get(MUSIC_DROPPABLE_ID);
  const musicStrip = args.droppableContainers.find((c) => c.id === MUSIC_DROPPABLE_ID);
  if (musicRect && musicStrip && contains(musicRect, point)) {
    const whole = [{ id: musicStrip.id, data: { droppableContainer: musicStrip, value: 0 } }];
    if (type === "media") return whole;
    if (type !== "audio" && type !== "music") return [];
    const clips = args.droppableContainers.filter(isMusicContainer);
    if (clips.length === 0) return whole;
    return closestCenter({ ...args, collisionRect: pointRect(point), droppableContainers: clips });
  }
  if (type === "music") return [];
  const stripRect = args.droppableRects.get(STRIP_DROPPABLE_ID);
  const strip = args.droppableContainers.find((c) => c.id === STRIP_DROPPABLE_ID);
  if (!stripRect || !strip) return [];
  if (!contains(stripRect, point)) return [];
  // Audio only hits the strip itself: refused with a hint, no insertion marker.
  if (type === "audio") return [{ id: strip.id, data: { droppableContainer: strip, value: 0 } }];
  if (type === "transition") {
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

/** Keyboard for transitions: arrow down → first slot, left/right → neighbouring slot. */
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

type Containers = Parameters<KeyboardCoordinateGetter>[1]["context"]["droppableContainers"];

/** The droppable containers reduced to `keep` (same interface as dnd-kit's map). */
function onlyContainers(all: Containers, keep: (c: DroppableContainer) => boolean): Containers {
  const kept = new Map(Array.from(all.entries()).filter(([, c]) => keep(c)));
  return Object.assign(kept, {
    toArray: () => Array.from(kept.values()),
    getEnabled: () => Array.from(kept.values()).filter((c) => !c.disabled),
    getNodeFor: (id: DroppableContainer["id"]) => kept.get(id)?.node.current ?? undefined,
  }) as unknown as Containers;
}

/**
 * Keyboard reordering inside one row: storyboard tiles never jump to the
 * music track and music clips only move among music clips.
 */
const sortableInRow =
  (keep: (c: DroppableContainer) => boolean): KeyboardCoordinateGetter =>
  (event, args) =>
    sortableKeyboardCoordinates(event, {
      ...args,
      context: {
        ...args.context,
        droppableContainers: onlyContainers(args.context.droppableContainers, keep),
      },
    });
const slideCoordinates = sortableInRow((c) => !isMusicArea(c));
const musicCoordinates = sortableInRow(isMusicContainer);

/**
 * Keyboard: tiles in the strip are sortable as usual; a picture from the
 * collection jumps to the end of the strip with arrow down and moves there
 * from insertion position to insertion position with arrow left/right.
 * Audio does the same on the music track; music clips are sortable there.
 */
const coordinateGetter: KeyboardCoordinateGetter = (event, args) => {
  const type = dragItem(args.context.active)?.type;
  if (type === "transition") return transitionCoordinates(event, args);
  if (type === "media") return insertCoordinates(event, args, STRIP_DROPPABLE_ID, isSlideContainer);
  if (type === "audio") return insertCoordinates(event, args, MUSIC_DROPPABLE_ID, isMusicContainer);
  if (type === "music") return musicCoordinates(event, args);
  return slideCoordinates(event, args);
};

/** Insertion positions of a row (storyboard or music track) for an item from the collection. */
function insertCoordinates(
  event: KeyboardEvent,
  { context }: Parameters<KeyboardCoordinateGetter>[1],
  rowId: string,
  isItem: (c: DroppableContainer) => boolean,
) {
  if (!ARROWS.includes(event.code)) return undefined;
  event.preventDefault();
  const rect = context.collisionRect;
  const stripRect = context.droppableRects.get(rowId);
  if (!rect || !stripRect) return undefined;

  const slideRects = context.droppableContainers
    .getEnabled()
    .filter(isItem)
    .map((c) => context.droppableRects.get(c.id))
    .filter((r): r is ClientRect => r !== undefined)
    .sort((a, b) => a.left - b.left);
  // Position of the dragged tile per insertion point: just left of the tile
  // centre (= before it); for the end, just right of the last tile centre (= after it).
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
}

/** Target from a dnd-kit event: tile with side (pointer left/right of the centre) or strip. */
function dropTarget(event: DragMoveEvent | DragEndEvent): DropTarget | null {
  const over: Over | null = event.over;
  if (!over) return null;
  const slot = over.data.current as DropTarget | undefined;
  if (slot?.type === "transitionSlot") return { type: "transitionSlot", slideId: slot.slideId };
  const data = over.data.current as DragItem | undefined;
  if (data?.type !== "slide" && data?.type !== "music") {
    if (over.id === STRIP_DROPPABLE_ID) return { type: "strip" };
    return over.id === MUSIC_DROPPABLE_ID ? { type: "musicStrip" } : null;
  }
  const activator = event.activatorEvent;
  const translated = event.active.rect.current.translated;
  // Pointer and touch start points alike (a TouchEvent has no clientX).
  const start = activator ? getEventCoordinates(activator) : null;
  const x = start
    ? start.x + event.delta.x
    : translated
      ? center(translated).x
      : center(over.rect).x;
  const after = x > center(over.rect).x;
  return data.type === "music"
    ? { type: "musicClip", clipId: data.clipId, after }
    : { type: "slide", slideId: data.slideId, after };
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
  if (item.type === "audio") {
    return t("dnd.audio", {
      name: state.media.find((m) => m.id === item.mediaId)?.filename ?? "",
    });
  }
  if (item.type === "music") {
    return t("dnd.musicClip", { number: state.music.findIndex((c) => c.id === item.clipId) + 1 });
  }
  const index = state.slides.findIndex((s) => s.id === item.slideId);
  return t("storyboard.slideMenu", { number: index + 1 });
}

/** Drag and drop for collection and storyboard (design.md D2: dnd-kit, pointer and keyboard). */
export function StoryboardDnd({ children }: { children: ReactNode }) {
  const store = useAppStoreApi();
  const { t } = useT();
  const slides = useAppStore((s) => s.slides);
  const music = useAppStore((s) => s.music);
  const media = useAppStore((s) => s.media);
  const [active, setActive] = useState<DragItem | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [notice, setNoticeState] = useState<DropRejection | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setNotice = useCallback((next: DropRejection | null) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = next ? setTimeout(() => setNoticeState(null), DROP_NOTICE_MS) : null;
    setNoticeState(next);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );
  const noticeValue = useMemo(() => ({ notice, setNotice }), [notice, setNotice]);

  const sensors = useSensors(
    // Small threshold keeps click and double-click working; the own sensor lets
    // the first click right after a drop through (mmy-fa5).
    useSensor(StoryboardPointerSensor, { activationConstraint: { distance: 5 } }),
    // Touch: long press first, so a swipe scrolls the strip (add-mobile-layout D8).
    useSensor(StoryboardTouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  const insertIndex = active?.type === "media" ? insertionIndex(target, slides) : null;
  const musicInsertIndex = active?.type === "audio" ? musicInsertionIndex(target, music) : null;

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
      if (!over) return tNow()("dnd.outside");
      const onMusic =
        over.id === MUSIC_DROPPABLE_ID ||
        (over.data.current as DragItem | undefined)?.type === "music";
      return tNow()(onMusic ? "dnd.overMusic" : "dnd.overStoryboard");
    },
    onDragEnd: ({ active: a, over }) =>
      over
        ? tNow()("dnd.dropped", { item: describe(store.getState(), dragItem(a)) })
        : tNow()("dnd.noTarget"),
    onDragCancel: () => tNow()("dnd.cancelled"),
  };

  const onDragStart = (event: DragStartEvent) => {
    // A touch drag starts after the long press: vibrate (design.md D13).
    if (typeof TouchEvent !== "undefined" && event.activatorEvent instanceof TouchEvent) {
      vibrate("activate");
    }
    setNotice(null);
    setActive(dragItem(event.active));
    setTarget(null);
  };
  const onDragMove = (event: DragMoveEvent) => {
    const next = dropTarget(event);
    setTarget((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  };
  const onDragEnd = (event: DragEndEvent) => {
    const state = store.getState();
    const action = resolveDrop(
      dragItem(event.active),
      dropTarget(event),
      state.slides,
      state.music,
    );
    setActive(null);
    setTarget(null);
    if (action.kind === "reject") vibrate("reject");
    else if (action.kind !== "none") vibrate("drop");
    if (action.kind === "reject") setNotice(action.reason);
    else if (action.kind === "insertMusic") state.addMusicClip(action.mediaId, action.index);
    else if (action.kind === "moveMusic") state.moveMusicClip(action.from, action.to);
    else if (action.kind === "insert") state.addSlide(action.mediaId, action.index);
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
  const overlayAudio = active?.type === "audio" || active?.type === "music";

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      // Scroll the storyboard strip and music track at their edges while dragging.
      autoScroll={AUTO_SCROLL}
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
      <DropNoticeContext.Provider value={noticeValue}>
        <InsertIndexContext.Provider value={insertIndex}>
          <MusicInsertIndexContext.Provider value={musicInsertIndex}>
            {children}
          </MusicInsertIndexContext.Provider>
        </InsertIndexContext.Provider>
      </DropNoticeContext.Provider>
      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className={styles.overlay} data-testid="drag-overlay">
            {overlayMedia?.kind === "image" ? <img src={overlayMedia.thumbnailUrl} alt="" /> : null}
            {overlayAudio ? (
              <span className={styles.overlayAudio}>
                <AudioIcon size={36} />
              </span>
            ) : null}
            {active.type === "transition" ? (
              <TransitionIcon transitionId={active.transitionId} size={94} />
            ) : null}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
