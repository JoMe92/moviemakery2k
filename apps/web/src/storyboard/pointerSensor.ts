import {
  PointerSensor,
  type PointerSensorOptions,
  type PointerSensorProps,
  TouchSensor,
} from "@dnd-kit/core";
import { getOwnerDocument } from "@dnd-kit/utilities";
import type { PointerEvent as ReactPointerEvent } from "react";
import { HOLD_MS, LONG_PRESS_TOLERANCE } from "../ui/useLongPress";

interface GuardListeners {
  removeAll?: () => void;
}

/**
 * Wraps the sensor callbacks so that dnd-kit's click guard ends at the next
 * pointer press after the drag.
 *
 * Once a drag activates, dnd-kit adds a capture-phase `click` listener on the
 * document that stops propagation, so the click ending the drag gesture does
 * not select anything. After the drop it removes that listener only 50 ms
 * later (`setTimeout` in `AbstractPointerSensor.detach`). A fresh click within
 * that window, e.g. selecting a storyboard tile right after a drop, never
 * reached React and was lost (mmy-fa5).
 *
 * The click belonging to the drag gesture always fires before any new
 * `pointerdown`, so the guard is dropped at the next `pointerdown` after the
 * drag ended; the original 50 ms timeout still applies otherwise.
 */
function withEndFlag(props: PointerSensorProps): {
  props: PointerSensorProps;
  ended: () => boolean;
} {
  let ended = false;
  return {
    props: {
      ...props,
      onEnd: () => {
        ended = true;
        props.onEnd();
      },
      onCancel: () => {
        ended = true;
        props.onCancel();
      },
    },
    ended: () => ended,
  };
}

function releaseGuardOnNextPress(sensor: object, event: Event, ended: () => boolean): void {
  const doc = getOwnerDocument(event.target);
  // Internal of @dnd-kit/core 6.3 (private in its typings): the document
  // listeners holding the click guard. This is why apps/web/package.json pins
  // @dnd-kit/core to ~6.3.1; on an upgrade re-check `documentListeners` in
  // AbstractPointerSensor and the e2e test for selecting a tile right after a drop.
  const guard = (sensor as { documentListeners?: GuardListeners }).documentListeners;
  const onPointerDown = () => {
    if (!ended()) return;
    doc.removeEventListener("pointerdown", onPointerDown, true);
    guard?.removeAll?.();
  };
  doc.addEventListener("pointerdown", onPointerDown, true);
}

/**
 * PointerSensor for mouse and pen (activation after a few pixels, so click and
 * double-click keep working). Touch pointers are left to StoryboardTouchSensor
 * so that a short touch with movement scrolls instead of dragging
 * (add-mobile-layout design.md D8).
 */
export class StoryboardPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: (event: ReactPointerEvent, options: PointerSensorOptions): boolean => {
        if (event.nativeEvent.pointerType === "touch") return false;
        const base = PointerSensor.activators[0];
        return base ? base.handler(event, options) : false;
      },
    },
  ];

  constructor(props: PointerSensorProps) {
    const wrapped = withEndFlag(props);
    super(wrapped.props);
    releaseGuardOnNextPress(this, props.event, wrapped.ended);
  }
}

/**
 * Touch: drag only after a hold (design.md D8), and after exactly the hold that
 * opens an element's action sheet - HOLD_MS, not design.md's 400 ms default
 * (which it marks "im PR änderbar").
 *
 * The two have to be the same number (mmy-c4r). A deliberate tap on a phone
 * lasts 400 to 700 ms, so the action sheet needs HOLD_MS to leave a tap alone;
 * had the sensor stayed at 400 ms, one press would announce a reorder drag by
 * vibrating at 400 ms and then arm a menu at 1000 ms - two gestures, two
 * moments, from one finger that never moved. Now one press arms both at once:
 * moving from there reorders, lifting opens the sheet.
 */
export const TOUCH_ACTIVATION = { delay: HOLD_MS, tolerance: LONG_PRESS_TOLERANCE } as const;

/** TouchSensor with the same click-guard release as StoryboardPointerSensor. */
export class StoryboardTouchSensor extends TouchSensor {
  constructor(props: PointerSensorProps) {
    const wrapped = withEndFlag(props);
    super(wrapped.props);
    releaseGuardOnNextPress(this, props.event, wrapped.ended);
  }
}
