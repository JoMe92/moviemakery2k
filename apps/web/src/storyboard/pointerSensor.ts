import { PointerSensor, type PointerSensorProps } from "@dnd-kit/core";
import { getOwnerDocument } from "@dnd-kit/utilities";

interface GuardListeners {
  removeAll?: () => void;
}

/**
 * PointerSensor whose click guard ends at the next pointer press.
 *
 * Once a drag activates, dnd-kit adds a capture-phase `click` listener on the
 * document that stops propagation, so the click ending the drag gesture does
 * not select anything. After the drop it removes that listener only 50 ms
 * later (`setTimeout` in `AbstractPointerSensor.detach`). A fresh click within
 * that window, e.g. selecting a storyboard tile right after a drop, never
 * reached React and was lost.
 *
 * The click belonging to the drag gesture always fires before any new
 * `pointerdown`, so this sensor drops the guard at the next `pointerdown` after
 * the drag ended; the original 50 ms timeout still applies otherwise.
 */
export class StoryboardPointerSensor extends PointerSensor {
  constructor(props: PointerSensorProps) {
    let ended = false;
    super({
      ...props,
      onEnd: () => {
        ended = true;
        props.onEnd();
      },
      onCancel: () => {
        ended = true;
        props.onCancel();
      },
    });
    const doc = getOwnerDocument(props.event.target);
    // Internal of @dnd-kit/core 6.3 (private in its typings): the document
    // listeners holding the click guard. This is why apps/web/package.json pins
    // @dnd-kit/core to ~6.3.1; on an upgrade re-check `documentListeners` in
    // AbstractPointerSensor and the e2e test for selecting a tile right after a drop.
    const guard = (this as unknown as { documentListeners?: GuardListeners }).documentListeners;
    const onPointerDown = () => {
      if (!ended) return;
      doc.removeEventListener("pointerdown", onPointerDown, true);
      guard?.removeAll?.();
    };
    doc.addEventListener("pointerdown", onPointerDown, true);
  }
}
