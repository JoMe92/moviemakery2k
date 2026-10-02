import { useDraggable } from "@dnd-kit/core";
import { type KeyboardEvent, type MouseEvent, useMemo, useRef, useState } from "react";
import { translateError } from "../i18n/errors";
import { formatClipDuration } from "../i18n/format";
import { useT } from "../i18n/useT";
import { ApiError, type AudioItem, type ImageItem, type MediaItem } from "../lib/apiClient";
import { useAppStore } from "../store/useAppStore";
import { type DragItem, mediaDraggableId } from "../storyboard/dropLogic";
import { Button } from "../ui/Button";
import { ContextMenu } from "../ui/ContextMenu";
import { Dialog } from "../ui/Dialog";
import { AudioIcon } from "../ui/icons";
import { Tile } from "../ui/Tile";
import styles from "./MediaCollection.module.css";

interface TileHandlers {
  selected: boolean;
  tileRef: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

interface MediaTileProps extends TileHandlers {
  item: ImageItem;
}

/** Collection tile, draggable into the storyboard via dnd-kit (pointer and keyboard). */
function MediaTile({ item, selected, tileRef, onKeyDown, ...handlers }: MediaTileProps) {
  const { t } = useT();
  const data: DragItem = { type: "media", mediaId: item.id };
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: mediaDraggableId(item.id),
    data,
    attributes: { roleDescription: t("media.draggable") },
  });
  // aria-pressed stays the tile selection (not the dnd-kit drag state).
  const { "aria-pressed": _pressed, role: _role, ...dragAttributes } = attributes;
  return (
    <Tile
      ref={(el: HTMLButtonElement | null) => {
        setNodeRef(el);
        tileRef(el);
      }}
      {...dragAttributes}
      {...listeners}
      caption={item.filename}
      aria-label={item.filename}
      title={item.filename}
      thumbnail={
        <img src={item.thumbnailUrl} alt={item.filename} loading="lazy" draggable={false} />
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
 * "My Music" tile: own audio icon, file name and duration. Not draggable into
 * the filmstrip (pictures only); the music track gets its own drop target.
 */
function AudioTile({ item, tileRef, ...handlers }: TileHandlers & { item: AudioItem }) {
  const { t, locale } = useT();
  const duration = formatClipDuration(locale, item.duration);
  return (
    <Tile
      ref={tileRef}
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
  /** `image` shows "My Pictures", `audio` shows "My Music". */
  kind?: MediaItem["kind"];
}

/**
 * "My Pictures" or "My Music" collection: tiles of one media kind in import
 * order. Double-click appends a picture to the storyboard (audio is never
 * added to the filmstrip); Delete or the context menu deletes after confirmation.
 */
export function MediaCollection({ kind = "image" }: MediaCollectionProps) {
  const { t, locale } = useT();
  const allMedia = useAppStore((s) => s.media);
  const media = useMemo(() => allMedia.filter((m) => m.kind === kind), [allMedia, kind]);
  const audio = kind === "audio";
  const addSlide = useAppStore((s) => s.addSlide);
  const deleteMedia = useAppStore((s) => s.deleteMedia);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<DeleteError | null>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement>());

  const openMenu = (item: MediaItem, x: number, y: number) => {
    setSelectedId(item.id);
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
        <p className={styles.hint}>{t(audio ? "media.musicEmptyHint" : "media.emptyHint")}</p>
      ) : (
        <ul className={styles.grid} aria-label={t(audio ? "media.musicList" : "media.list")}>
          {media.map((item) => {
            const handlers: TileHandlers = {
              tileRef: (el) => {
                if (el) tiles.current.set(item.id, el);
                else tiles.current.delete(item.id);
              },
              selected: selectedId === item.id,
              onClick: () => setSelectedId(item.id),
              onDoubleClick: () => {
                if (item.kind === "image") addSlide(item.id);
              },
              onContextMenu: onContextMenu(item),
              onKeyDown: onKeyDown(item),
            };
            return (
              <li key={item.id}>
                {item.kind === "audio" ? (
                  <AudioTile item={item} {...handlers} />
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
          label={t(menu.item.kind === "audio" ? "media.audioMenu" : "media.menu", {
            name: menu.item.filename,
          })}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...(menu.item.kind === "image"
              ? [{ label: t("media.addToStoryboard"), onSelect: () => addSlide(menu.item.id) }]
              : []),
            { label: t("media.delete"), onSelect: () => setPendingDelete(menu.item) },
          ]}
        />
      ) : null}
      <Dialog
        open={pendingDelete !== null}
        title={t(pendingDelete?.kind === "audio" ? "media.deleteAudioTitle" : "media.deleteTitle")}
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
            {t(
              pendingDelete.kind === "audio" ? "media.deleteAudioQuestion" : "media.deleteQuestion",
              { name: pendingDelete.filename },
            )}
          </p>
        ) : null}
      </Dialog>
      <Dialog
        open={error !== null}
        title={t(audio ? "media.deleteAudioTitle" : "media.deleteTitle")}
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
