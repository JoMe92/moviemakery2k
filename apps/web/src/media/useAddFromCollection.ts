import { useMemo } from "react";
import { useT } from "../i18n/useT";
import { useAppStoreApi } from "../store/useAppStore";
import { vibrate } from "../ui/haptics";

/**
 * Adding from the collection, confirmed (app-shell design.md D6). All three
 * ways - the collection sheet's button, a double-click on a tile and its
 * context menu - go through here, so the confirmation cannot drift apart:
 *
 * - a short notice with the count and the kind, in the UI language and with
 *   its plural forms;
 * - the element added last scrolled into view, because a text that claims
 *   something the user cannot check is exactly the case this fixes;
 * - a short vibration with the existing "dropped" pattern, where the device
 *   can and the switch is on - an addition, never the whole feedback.
 *
 * The selection stays as it was, so the insertion point for the next add is
 * where the user left it. The count is what was really added, not what was
 * asked for: the music track refuses clips beyond its limit, and a notice
 * must not claim more than happened.
 */
export interface AddFromCollection {
  /**
   * Adds pictures or videos to the filmstrip. `index` is the position of the
   * first one; without it they go to the end.
   */
  addToStoryboard(mediaIds: readonly string[], index?: number): void;
  /** Adds music clips to the end of the music track. */
  addToMusicTrack(mediaIds: readonly string[]): void;
}

export function useAddFromCollection(): AddFromCollection {
  const store = useAppStoreApi();
  const { t } = useT();

  return useMemo(
    () => ({
      addToStoryboard(mediaIds, index) {
        const before = new Set(store.getState().slides.map((s) => s.id));
        mediaIds.forEach((id, k) => {
          store.getState().addSlide(id, index === undefined ? undefined : index + k);
        });
        const added = store.getState().slides.filter((s) => !before.has(s.id));
        const last = added.at(-1);
        if (!last) return;
        // One kind per collection tab; a mixed add reports pictures.
        const key = added.every((s) => s.kind === "video")
          ? "status.addedVideos"
          : "status.addedPictures";
        store.getState().notify(t(key, { count: added.length }));
        store.getState().reveal({ kind: "slide", slideId: last.id });
        vibrate("drop");
      },

      addToMusicTrack(mediaIds) {
        const before = new Set(store.getState().music.map((c) => c.id));
        for (const id of mediaIds) store.getState().addMusicClip(id);
        const added = store.getState().music.filter((c) => !before.has(c.id));
        const last = added.at(-1);
        if (!last) return;
        store.getState().notify(t("status.addedMusic", { count: added.length }));
        store.getState().reveal({ kind: "musicClip", clipId: last.id });
        vibrate("drop");
      },
    }),
    [store, t],
  );
}
