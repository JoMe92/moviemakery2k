import { useDraggable } from "@dnd-kit/core";
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { translateError } from "../i18n/errors";
import { formatClipDuration } from "../i18n/format";
import type { MessageKey } from "../i18n/types";
import { useT } from "../i18n/useT";
import {
  ApiError,
  type AudioItem,
  type ImageItem,
  type MediaItem,
  type VideoItem,
} from "../lib/apiClient";
import { useAppStore } from "../store/useAppStore";
import { audioDraggableId, type DragItem, mediaDraggableId } from "../storyboard/dropLogic";
import { Button } from "../ui/Button";
import { ContextMenu } from "../ui/ContextMenu";
import { Dialog } from "../ui/Dialog";
import { AudioIcon } from "../ui/icons";
import { Tile } from "../ui/Tile";
import { chain, useLongPress } from "../ui/useLongPress";
import { MediaPropertiesDialog } from "./MediaPropertiesDialog";
import styles from "./MediaCollection.module.css";

/** Per-kind collection text: empty hint, tile list label, context menu and delete dialog. */
const COLLECTION_TEXT: Record<
  MediaItem["kind"],
  {
    emptyHint: MessageKey;
    list: MessageKey;
    menu: MessageKey;
    deleteTitle: MessageKey;
    deleteQuestion: MessageKey;
  }
> = {
  image: {
    emptyHint: "media.emptyHint",
    list: "media.list",
    menu: "media.menu",
    deleteTitle: "media.deleteTitle",
    deleteQuestion: "media.deleteQuestion",
  },
  audio: {
    emptyHint: "media.musicEmptyHint",
    list: "media.musicList",
    menu: "media.audioMenu",
    deleteTitle: "media.deleteAudioTitle",
    deleteQuestion: "media.deleteAudioQuestion",
  },
  video: {
    emptyHint: "media.videoEmptyHint",
    list: "media.videoList",
    menu: "media.videoMenu",
    deleteTitle: "media.deleteVideoTitle",
    deleteQuestion: "media.deleteVideoQuestion",
  },
};

interface TileHandlers {
  selected: boolean;
  tileRef: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /** Picking in the collection sheet: no dragging, long press opens the menu. */
  picking: boolean;
  onLongPress: () => void;
}

/**
 * dnd-kit attributes for a tile without role and aria-pressed. When picking,
 * the tile is no draggable at all: dnd-kit would mark the disabled draggable
 * aria-disabled and describe it as draggable.
 */
function tileAttributes(
  attributes: ReturnType<typeof useDraggable>["attributes"],
  picking: boolean,
): Record<string, unknown> {
  const { "aria-pressed": _pressed, role: _role, ...rest } = attributes;
  if (!picking) return rest;
  const {
    "aria-disabled": _disabled,
    "aria-roledescription": _description,
    "aria-describedby": _describedBy,
    ...plain
  } = rest;
  return plain;
}

type PointerHandler = ((event: PointerEvent<HTMLElement>) => void) | undefined;

/** Long press (picking mode) on top of the dnd-kit listeners. */
function usePickingPointer(
  picking: boolean,
  onLongPress: () => void,
  listeners: Record<string, unknown> | undefined,
) {
  const longPress = useLongPress(onLongPress, { enabled: picking });
  return {
    onPointerDown: chain(listeners?.onPointerDown as PointerHandler, longPress.onPointerDown),
    onPointerMove: longPress.onPointerMove,
    onPointerUp: longPress.onPointerUp,
    onPointerCancel: longPress.onPointerCancel,
  };
}

interface MediaTileProps extends TileHandlers {
  item: ImageItem;
}

/** Collection tile, draggable into the storyboard via dnd-kit (pointer and keyboard). */
function MediaTile({
  item,
  selected,
  tileRef,
  onKeyDown,
  picking,
  onLongPress,
  ...handlers
}: MediaTileProps) {
  const { t } = useT();
  const data: DragItem = { type: "media", mediaId: item.id };
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: mediaDraggableId(item.id),
    data,
    disabled: picking,
    attributes: { roleDescription: t("media.draggable") },
  });
  const pointer = usePickingPointer(picking, onLongPress, listeners);
  // aria-pressed stays the tile selection (not the dnd-kit drag state).
  const dragAttributes = tileAttributes(attributes, picking);
  return (
    <Tile
      ref={(el: HTMLButtonElement | null) => {
        setNodeRef(el);
        tileRef(el);
      }}
      {...dragAttributes}
      {...listeners}
      {...pointer}
      className={picking ? styles.pickable : undefined}
      caption={item.filename}
      aria-label={item.filename}
      title={item.filename}
      thumbnail={
        <img
          src={item.thumbnailUrl}
          alt={item.filename}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      }
      selected={selected}
      {...handlers}
      onKeyDown={(event) => {
        onKeyDown(event);
        if (!event.defaultPrevented) listeners?.onKeyDown?.(event);
      }}
    />
  );
}

/**
 * "My Music" tile: own audio icon, file name and duration. Draggable onto the
 * music track via dnd-kit (pointer and keyboard); the filmstrip refuses it.
 */
function AudioTile({
  item,
  selected,
  tileRef,
  onKeyDown,
  picking,
  onLongPress,
  ...handlers
}: TileHandlers & { item: AudioItem }) {
  const { t, locale } = useT();
  const duration = formatClipDuration(locale, item.duration);
  const data: DragItem = { type: "audio", mediaId: item.id };
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: audioDraggableId(item.id),
    data,
    disabled: picking,
    attributes: { roleDescription: t("media.audioDraggable") },
  });
  const pointer = usePickingPointer(picking, onLongPress, listeners);
  // aria-pressed stays the tile selection (not the dnd-kit drag state).
  const dragAttributes = tileAttributes(attributes, picking);
  return (
    <Tile
      ref={(el: HTMLButtonElement | null) => {
        setNodeRef(el);
        tileRef(el);
      }}
      {...dragAttributes}
      {...listeners}
      {...pointer}
      className={picking ? styles.pickable : undefined}
      selected={selected}
      caption={item.filename}
      aria-label={t("media.audioTile", { name: item.filename, duration })}
      title={item.filename}
      thumbnail={
        <span className={styles.audio}>
          <AudioIcon size={36} className={styles.audioIcon} />
          <span className={styles.duration}>{duration}</span>
        </span>
      }
      {...handlers}
      onKeyDown={(event) => {
        onKeyDown(event);
        if (!event.defaultPrevented) listeners?.onKeyDown?.(event);
      }}
    />
  );
}

/**
 * "My Videos" tile: poster image with the duration overlaid, file name below.
 * Not draggable (add-video-import non-goal: a video cannot be added to the
 * storyboard, played or exported in this change).
 */
function VideoTile({
  item,
  selected,
  tileRef,
  picking: _picking,
  onLongPress: _onLongPress,
  ...handlers
}: TileHandlers & { item: VideoItem }) {
  const { t, locale } = useT();
  const duration = formatClipDuration(locale, item.duration);
  return (
    <Tile
      ref={tileRef}
      selected={selected}
      caption={item.filename}
      aria-label={t("media.videoTile", { name: item.filename, duration })}
      title={item.filename}
      thumbnail={
        <span className={styles.video}>
          <img
            src={item.posterUrl}
            alt={item.filename}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          <span className={styles.videoDuration}>{duration}</span>
        </span>
      }
      {...handlers}
    />
  );
}

/** Rejected delete: the picture's name and, if the backend said why, the translated reason. */
interface DeleteError {
  name: string;
  reason: string | null;
}

interface MenuState {
  item: MediaItem;
  x: number;
  y: number;
}

export interface MediaCollectionProps {
  /** `image` shows "My Pictures", `audio` shows "My Music", `video` shows "My Videos". */
  kind?: MediaItem["kind"];
  /**
   * Collection sheet (add-mobile-layout design.md D7): a tap toggles the item
   * in `picked` (check mark, aria-pressed); a long press offers "Properties"
   * and "Delete"; nothing is dragged.
   */
  picking?: { picked: readonly string[]; onToggle: (id: string) => void };
}

/**
 * "My Pictures", "My Music" or "My Videos" collection: tiles of one media
 * kind in import order. Double-click appends a picture to the storyboard and
 * audio to the music track (never the other way round, and never for video -
 * add-video-import non-goal); Delete or the context menu deletes after
 * confirmation.
 */
export function MediaCollection({ kind = "image", picking }: MediaCollectionProps) {
  const { t, locale } = useT();
  const allMedia = useAppStore((s) => s.media);
  const media = useMemo(() => allMedia.filter((m) => m.kind === kind), [allMedia, kind]);
  const text = COLLECTION_TEXT[kind];
  const addSlide = useAppStore((s) => s.addSlide);
  const addMusicClip = useAppStore((s) => s.addMusicClip);
  const deleteMedia = useAppStore((s) => s.deleteMedia);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<DeleteError | null>(null);
  const [properties, setProperties] = useState<MediaItem | null>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement>());

  const openMenu = (item: MediaItem, x: number, y: number) => {
    if (!picking) setSelectedId(item.id);
    setMenu({ item, x, y });
  };

  const onContextMenu = (item: MediaItem) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.focus();
    openMenu(item, event.clientX, event.clientY);
  };

  const onKeyDown = (item: MediaItem) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Delete") {
      event.preventDefault();
      setSelectedId(item.id);
      setPendingDelete(item);
    } else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openMenu(item, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  };

  const confirmDelete = async () => {
    const item = pendingDelete;
    if (!item) return;
    const index = media.findIndex((m) => m.id === item.id);
    const neighbour = media[index + 1] ?? media[index - 1];
    setDeleting(true);
    setError(null);
    try {
      await deleteMedia(item.id);
      setSelectedId(neighbour?.id ?? null);
      setPendingDelete(null);
      // After the dialog closes, focus the neighbouring tile.
      if (neighbour) setTimeout(() => tiles.current.get(neighbour.id)?.focus(), 0);
    } catch (err) {
      // The store only drops the picture after the backend confirmed the
      // delete, so a rejection (e.g. 409 media.inUseByExport) leaves the
      // collection and the storyboard untouched.
      setPendingDelete(null);
      const reason = err instanceof ApiError && err.info ? translateError(err.info, locale) : null;
      setError({ name: item.filename, reason });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {media.length === 0 ? (
        <p className={styles.hint}>{t(text.emptyHint)}</p>
      ) : (
        <ul className={styles.grid} aria-label={t(text.list)}>
          {media.map((item) => {
            const handlers: TileHandlers = {
              tileRef: (el) => {
                if (el) tiles.current.set(item.id, el);
                else tiles.current.delete(item.id);
              },
              selected: picking ? picking.picked.includes(item.id) : selectedId === item.id,
              onClick: () => (picking ? picking.onToggle(item.id) : setSelectedId(item.id)),
              onDoubleClick: () => {
                if (picking) return;
                if (item.kind === "image") addSlide(item.id);
                else if (item.kind === "audio") addMusicClip(item.id);
              },
              picking: picking !== undefined,
              onLongPress: () => {
                const rect = tiles.current.get(item.id)?.getBoundingClientRect();
                setMenu({
                  item,
                  x: rect ? rect.left + rect.width / 2 : 0,
                  y: rect ? rect.top + rect.height / 2 : 0,
                });
              },
              onContextMenu: onContextMenu(item),
              onKeyDown: onKeyDown(item),
            };
            return (
              <li key={item.id}>
                {item.kind === "audio" ? (
                  <AudioTile item={item} {...handlers} />
                ) : item.kind === "video" ? (
                  <VideoTile item={item} {...handlers} />
                ) : (
                  <MediaTile item={item} {...handlers} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {menu ? (
        <ContextMenu
          label={t(COLLECTION_TEXT[menu.item.kind].menu, { name: menu.item.filename })}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...(picking
              ? [{ label: t("media.properties"), onSelect: () => setProperties(menu.item) }]
              : menu.item.kind === "image"
              ? [{ label: t("media.addToStoryboard"), onSelect: () => addSlide(menu.item.id) }]
              : menu.item.kind === "audio"
                ? [
                    {
                      label: t("media.addToMusicTrack"),
                      onSelect: () => addMusicClip(menu.item.id),
                    },
                  ]
                : []),
            { label: t("media.delete"), onSelect: () => setPendingDelete(menu.item) },
          ]}
        />
      ) : null}
      <Dialog
        open={pendingDelete !== null}
        title={t(
          pendingDelete ? COLLECTION_TEXT[pendingDelete.kind].deleteTitle : text.deleteTitle,
        )}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        footer={
          <>
            <Button onClick={() => void confirmDelete()} disabled={deleting}>
              {t("common.yes")}
            </Button>
            <Button onClick={() => setPendingDelete(null)} disabled={deleting}>
              {t("common.no")}
            </Button>
          </>
        }
      >
        {pendingDelete ? (
          <p className={styles.question}>
            {t(COLLECTION_TEXT[pendingDelete.kind].deleteQuestion, {
              name: pendingDelete.filename,
            })}
          </p>
        ) : null}
      </Dialog>
      <MediaPropertiesDialog item={properties} onClose={() => setProperties(null)} />
      <Dialog
        open={error !== null}
        title={t(text.deleteTitle)}
        onClose={() => setError(null)}
        footer={<Button onClick={() => setError(null)}>{t("common.ok")}</Button>}
      >
        {error ? (
          <div role="alert">
            <p className={styles.question}>{t("media.deleteFailed", { name: error.name })}</p>
            {error.reason ? <p className={styles.reason}>{error.reason}</p> : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
