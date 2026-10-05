import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/apiClient";
import { mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";
import { resetTileSize, TILE_SIZE_STORAGE_KEY } from "./tileSize";

const slides: Slide[] = [
  {
    kind: "image",
    id: "s1",
    mediaId: "a",
    duration: 3,
    effectId: null,
    title: null,
    transitionIn: null,
  },
  {
    kind: "image",
    id: "s2",
    mediaId: "b",
    duration: 3,
    effectId: null,
    title: null,
    transitionIn: null,
  },
];

async function setup(layout: "compact" | "wide" = "compact") {
  if (layout === "compact") mockLayout("compact");
  const view = renderApp(
    mockApi({ getProject: vi.fn(async () => ({ schemaVersion: 5 as const, slides, music: [] })) }),
  );
  await act(() => view.ready);
  return { ...view, user: userEvent.setup() };
}

const strip = () => screen.getByTestId("storyboard-strip");
const pane = () => within(screen.getByRole("region", { name: "Storyboard" }));

describe("tile size (add-mobile-layout design.md D12)", () => {
  it("switches between the three levels with 'Kleiner' and 'Größer'", async () => {
    const { user } = await setup();
    expect(strip()).toHaveAttribute("data-tile-size", "medium");
    await user.click(pane().getByRole("button", { name: "Kleiner" }));
    expect(strip()).toHaveAttribute("data-tile-size", "small");
    expect(pane().getByRole("button", { name: "Kleiner" })).toBeDisabled();
    await user.click(pane().getByRole("button", { name: "Größer" }));
    await user.click(pane().getByRole("button", { name: "Größer" }));
    expect(strip()).toHaveAttribute("data-tile-size", "large");
    expect(pane().getByRole("button", { name: "Größer" })).toBeDisabled();
  });

  it("names the buttons in English", async () => {
    const { store } = await setup();
    act(() => store.getState().setLocale("en"));
    expect(pane().getByRole("button", { name: "Smaller" })).toBeInTheDocument();
    expect(pane().getByRole("button", { name: "Larger" })).toBeInTheDocument();
  });

  it("keeps the level after a reload", async () => {
    const { user, unmount } = await setup();
    await user.click(pane().getByRole("button", { name: "Größer" }));
    expect(localStorage.getItem(TILE_SIZE_STORAGE_KEY)).toBe("large");
    unmount();
    resetTileSize();
    await setup();
    expect(strip()).toHaveAttribute("data-tile-size", "large");
  });

  it("zooms with two fingers", async () => {
    await setup();
    const touch = (id: number, x: number) => ({
      pointerId: id,
      pointerType: "touch",
      clientX: x,
      clientY: 50,
    });
    fireEvent.pointerDown(strip(), touch(1, 100));
    fireEvent.pointerDown(strip(), touch(2, 200));
    fireEvent.pointerMove(strip(), touch(2, 240));
    expect(strip()).toHaveAttribute("data-tile-size", "large");
    fireEvent.pointerMove(strip(), touch(2, 160));
    fireEvent.pointerMove(strip(), touch(2, 130));
    expect(strip()).toHaveAttribute("data-tile-size", "small");
    fireEvent.pointerUp(strip(), touch(1, 100));
    fireEvent.pointerUp(strip(), touch(2, 130));
  });

  it("leaves the desktop storyboard header unchanged", async () => {
    await setup("wide");
    expect(pane().queryByRole("button", { name: "Kleiner" })).toBeNull();
    expect(strip()).toHaveAttribute("data-tile-size", "medium");
  });
});
