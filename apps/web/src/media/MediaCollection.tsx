import { useDraggable } from "@dnd-kit/core";
import { type KeyboardEvent, type MouseEvent, useRef, useState } from "react";
import { translateError } from "../i18n/errors";
import { useT } from "../i18n/useT";
import { ApiError, type MediaItem } from "../lib/apiClient";
import { useAppStore } from "../store/useAppStore";
import { type DragItem, mediaDraggableId } from "../storyboard/dropLogic";
import { Button } from "../ui/Button";
import { ContextMenu } from "../ui/ContextMenu";
import { Dialog } from "../ui/Dialog";
import { Tile } from "../ui/Tile";
import styles from "./MediaCollection.module.css";

interface MediaTileProps {
  item: MediaItem;
  selected: boolean;
  tileRef: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
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
        item.kind === "image" ? (
          <img src={item.thumbnailUrl} alt={item.filename} loading="lazy" draggable={false} />
        ) : null
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

/**
 * "My Pictures" collection: tiles in import order. Double-click appends the
 * picture to the storyboard; Delete or the context menu deletes after confirmation.
 */
export function MediaCollection() {
  const { t, locale } = useT();
  const media = useAppStore((s) => s.media);
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
        <p className={styles.hint}>{t("media.emptyHint")}</p>
      ) : (
        <ul className={styles.grid} aria-label={t("media.list")}>
          {media.map((item) => (
            <li key={item.id}>
              <MediaTile
                item={item}
                tileRef={(el) => {
                  if (el) tiles.current.set(item.id, el);
                  else tiles.current.delete(item.id);
                }}
                selected={selectedId === item.id}
                onClick={() => setSelectedId(item.id)}
                onDoubleClick={() => addSlide(item.id)}
                onContextMenu={onContextMenu(item)}
                onKeyDown={onKeyDown(item)}
              />
            </li>
          ))}
        </ul>
      )}
      {menu ? (
        <ContextMenu
          label={t("media.menu", { name: menu.item.filename })}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: t("media.addToStoryboard"), onSelect: () => addSlide(menu.item.id) },
            { label: t("media.delete"), onSelect: () => setPendingDelete(menu.item) },
          ]}
        />
      ) : null}
      <Dialog
        open={pendingDelete !== null}
        title={t("media.deleteTitle")}
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
            {t("media.deleteQuestion", { name: pendingDelete.filename })}
          </p>
        ) : null}
      </Dialog>
      <Dialog
        open={error !== null}
        title={t("media.deleteTitle")}
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
