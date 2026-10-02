import { type KeyboardEvent, type MouseEvent, useRef, useState } from "react";
import type { MediaItem } from "../lib/apiClient";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../ui/Button";
import { ContextMenu } from "../ui/ContextMenu";
import { Dialog } from "../ui/Dialog";
import { Tile } from "../ui/Tile";
import styles from "./MediaCollection.module.css";

export const MEDIA_EMPTY_HINT =
  "Diese Sammlung ist leer. Wählen Sie „Bilder importieren“ oder ziehen Sie Bilder hierher.";

export function deleteQuestion(filename: string): string {
  return `Möchten Sie „${filename}“ wirklich löschen? Es wird auch aus dem Storyboard entfernt.`;
}

interface MenuState {
  item: MediaItem;
  x: number;
  y: number;
}

/**
 * Sammlung „Meine Bilder“: Kacheln in Importreihenfolge. Doppelklick hängt
 * das Bild ans Storyboard an; Entf oder Kontextmenü löscht nach Rückfrage.
 */
export function MediaCollection() {
  const media = useAppStore((s) => s.media);
  const addSlide = useAppStore((s) => s.addSlide);
  const deleteMedia = useAppStore((s) => s.deleteMedia);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      // Nach dem Schließen des Dialogs die Nachbarkachel fokussieren.
      if (neighbour) setTimeout(() => tiles.current.get(neighbour.id)?.focus(), 0);
    } catch {
      setPendingDelete(null);
      setError(`„${item.filename}“ konnte nicht gelöscht werden.`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {media.length === 0 ? (
        <p className={styles.hint}>{MEDIA_EMPTY_HINT}</p>
      ) : (
        <ul className={styles.grid} aria-label="Bilder">
          {media.map((item) => (
            <li key={item.id}>
              <Tile
                ref={(el: HTMLButtonElement | null) => {
                  if (el) tiles.current.set(item.id, el);
                  else tiles.current.delete(item.id);
                }}
                caption={item.filename}
                aria-label={item.filename}
                title={item.filename}
                thumbnail={
                  <img
                    src={item.thumbnailUrl}
                    alt={item.filename}
                    loading="lazy"
                    draggable={false}
                  />
                }
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
          label={`Bild „${menu.item.filename}“`}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: "Zum Storyboard hinzufügen", onSelect: () => addSlide(menu.item.id) },
            { label: "Löschen", onSelect: () => setPendingDelete(menu.item) },
          ]}
        />
      ) : null}
      <Dialog
        open={pendingDelete !== null}
        title="Bild löschen"
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        footer={
          <>
            <Button onClick={() => void confirmDelete()} disabled={deleting}>
              Ja
            </Button>
            <Button onClick={() => setPendingDelete(null)} disabled={deleting}>
              Nein
            </Button>
          </>
        }
      >
        {pendingDelete ? (
          <p className={styles.question}>{deleteQuestion(pendingDelete.filename)}</p>
        ) : null}
      </Dialog>
    </>
  );
}
