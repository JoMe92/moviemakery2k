import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/apiClient";
import { OptionsDialog } from "../shell/OptionsDialog";
import { createAppStore } from "../store/appStore";
import { mockApi } from "../store/testApi";
import { AppStoreContext } from "../store/useAppStore";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";
import { HAPTICS, VIBRATION_STORAGE_KEY, vibrate } from "./haptics";

const slides: Slide[] = [
  { id: "s1", mediaId: "a", duration: 3, transitionIn: null },
  { id: "s2", mediaId: "b", duration: 3, transitionIn: null },
];

function withVibrate() {
  const fn = vi.fn(() => true);
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: fn });
  return fn;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "vibrate");
});

async function setup() {
  mockLayout("compact");
  const view = renderApp(
    mockApi({ getProject: vi.fn(async () => ({ schemaVersion: 2 as const, slides, music: [] })) }),
  );
  await act(() => view.ready);
  return { ...view, user: userEvent.setup() };
}

/** Long press as on a phone: the touch sensor activates the drag after 400 ms. */
async function longPress(el: HTMLElement) {
  fireEvent.touchStart(el, { touches: [{ clientX: 5, clientY: 5 }] });
  await act(() => new Promise((r) => setTimeout(r, 450)));
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 5, clientY: 5 }], touches: [] });
}

const tile = () => screen.getByRole("button", { name: /^Bild 1:/ });

describe("haptics (add-mobile-layout design.md D13)", () => {
  it("uses 10 ms, 15 ms and 2 × 10 ms", () => {
    const fn = withVibrate();
    vibrate("activate");
    vibrate("drop");
    vibrate("reject");
    expect(fn.mock.calls).toEqual([[10], [15], [[10, 40, 10]]]);
    expect(HAPTICS.activate).toBe(10);
  });

  it("vibrates when a long press triggers", async () => {
    const fn = withVibrate();
    await setup();
    await longPress(tile());
    expect(fn).toHaveBeenCalledWith(10);
  });

  it("turns vibration off in Options, also after a reload", async () => {
    const fn = withVibrate();
    const { user, unmount } = await setup();
    const { unmount: closeOptions } = renderOptions();
    const box = screen.getByRole("checkbox", { name: "Vibration" });
    expect(box).toBeChecked();
    await user.click(box);
    await user.click(screen.getByRole("button", { name: "OK" }));
    closeOptions();
    expect(localStorage.getItem(VIBRATION_STORAGE_KEY)).toBe("off");
    await longPress(tile());
    expect(fn).not.toHaveBeenCalled();
    unmount();
    await setup();
    renderOptions();
    expect(screen.getByRole("checkbox", { name: "Vibration" })).not.toBeChecked();
  });

  it("has no switch and does nothing without the Vibration API", async () => {
    await setup();
    await expect(longPress(tile())).resolves.toBeUndefined();
    renderOptions();
    expect(screen.queryByRole("checkbox", { name: "Vibration" })).toBeNull();
  });
});

function renderOptions() {
  return renderInApp(<OptionsDialog open onClose={() => {}} />);
}


function renderInApp(ui: React.ReactElement) {
  const store = createAppStore(mockApi());
  return render(<AppStoreContext.Provider value={store}>{ui}</AppStoreContext.Provider>);
}
