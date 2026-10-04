import { useEffect, useId, useState } from "react";
import { EffectCollection } from "../effects/EffectCollection";
import { useT } from "../i18n/useT";
import type { CollectionId } from "../store/appStore";
import { useAppStore, useAppStoreApi } from "../store/useAppStore";
import { TransitionCollection } from "../transitions/TransitionCollection";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import styles from "./CollectionSheet.module.css";
import { MediaCollection } from "./MediaCollection";
import { UploadPanel } from "./UploadPanel";

const TABS: readonly CollectionId[] = ["media", "music", "video", "transitions", "effects"];

/** Media kind of a collection tab (transitions and effects have none). */
const KIND = { media: "image", music: "audio", video: "video" } as const;

/**
 * Collection sheet of the compact layout (add-mobile-layout design.md D7):
 * tabs "My Pictures", "My Music", "My Videos", "Video Transitions" and
 * "Video Effects",
 * "Import" on top. Tapping pictures, videos or music picks them; the fixed
 * button adds the picks in the order they were picked (pictures and videos
 * after the selected element or at the end, music at the end) and closes the
 * sheet.
 */
export function CollectionSheet() {
  const { t } = useT();
  const open = useAppStore((s) => s.collectionSheetOpen);
  const setOpen = useAppStore((s) => s.setCollectionSheetOpen);
  const collection = useAppStore((s) => s.collection);
  const setCollection = useAppStore((s) => s.setCollection);
  const requestImport = useAppStore((s) => s.requestImport);
  const media = useAppStore((s) => s.media);
  const addSlide = useAppStore((s) => s.addSlide);
  const addMusicClip = useAppStore((s) => s.addMusicClip);
  const store = useAppStoreApi();
  const [picked, setPicked] = useState<string[]>([]);
  const baseId = useId();

  // Picks belong to one tab and one opening; deleted items drop out.
  useEffect(() => {
    if (!open) setPicked([]);
  }, [open]);
  useEffect(() => {
    setPicked((prev) => prev.filter((id) => media.some((m) => m.id === id)));
  }, [media]);

  const close = () => setOpen(false);
  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const add = () => {
    const state = store.getState();
    if (collection === "media" || collection === "video") {
      const index = state.selection
        ? state.slides.findIndex((s) => s.id === state.selection?.slideId)
        : -1;
      const start = index >= 0 ? index + 1 : state.slides.length;
      for (const [k, id] of picked.entries()) addSlide(id, start + k);
    } else {
      for (const id of picked) addMusicClip(id);
    }
    close();
  };

  const panelId = `${baseId}-panel`;
  const count = picked.length;

  return (
    <Sheet
      open={open}
      title={t("collectionSheet.title")}
      height="full"
      onClose={close}
      footer={
        collection === "transitions" ? undefined : (
          <Button disabled={count === 0} onClick={add} className={styles.add}>
            {t(
              collection === "music" ? "collectionSheet.addMusic" : "collectionSheet.addPictures",
              {
                count,
              },
            )}
          </Button>
        )
      }
    >
      <div className={styles.head}>
        <div role="tablist" aria-label={t("collectionSheet.tabs")} className={styles.tabs}>
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${baseId}-${id}`}
              aria-selected={collection === id}
              aria-controls={panelId}
              className={styles.tab}
              onClick={() => {
                if (id === collection) return;
                setPicked([]);
                setCollection(id);
              }}
            >
              {t(`collections.${id}`)}
            </button>
          ))}
        </div>
        {collection === "transitions" || collection === "effects" ? null : (
          <Button
            onClick={() =>
              requestImport(
                collection === "music" ? "audio" : collection === "video" ? "video" : "pictures",
              )
            }
          >
            {t("collectionSheet.import")}
          </Button>
        )}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${baseId}-${collection}`}
        className={styles.panel}
      >
        {collection === "transitions" ? (
          <TransitionCollection />
        ) : collection === "effects" ? (
          <EffectCollection />
        ) : (
          <MediaCollection
            key={collection}
            kind={KIND[collection]}
            picking={{ picked, onToggle: toggle }}
          />
        )}
      </div>
      <UploadPanel />
    </Sheet>
  );
}
