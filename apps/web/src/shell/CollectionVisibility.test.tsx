import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";

/*
 * The hideable collection pane of the wide and medium layouts (app-shell
 * design.md D3, D5). The toolbar toggle itself is covered by
 * Toolbar.test.tsx; here the store drives the state so the layout effect is
 * tested on its own.
 */

async function setup(mode: "wide" | "medium") {
  mockLayout(mode);
  const view = renderApp();
  await act(() => view.ready);
  return view;
}

const collection = () => screen.queryByRole("region", { name: "Sammlung: Meine Bilder" });
const monitor = () => screen.getByRole("region", { name: "Vorschau" });
const workspace = () => monitor().closest(".workspace");

describe("hiding the collection pane", () => {
  it("drops the pane in the wide layout and leaves the task pane, storyboard and status bar", async () => {
    const { store } = await setup("wide");
    expect(collection()).toBeInTheDocument();
    expect(workspace()).toHaveAttribute("data-collection", "shown");

    act(() => store.getState().toggleCollectionVisible());

    expect(collection()).toBeNull();
    // The monitor keeps its place in the workspace and takes over the free space.
    expect(workspace()).toHaveAttribute("data-collection", "hidden");
    expect(monitor().closest(".workspace")).not.toBeNull();
    expect(screen.getByRole("complementary", { name: "Filmaufgaben" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Storyboard" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("drops the pane in the medium layout and leaves the taskbar and storyboard", async () => {
    const { store } = await setup("medium");
    expect(collection()).toBeInTheDocument();

    act(() => store.getState().toggleCollectionVisible());

    expect(collection()).toBeNull();
    expect(workspace()).toHaveAttribute("data-collection", "hidden");
    expect(screen.getByRole("navigation", { name: "Filmschritte" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Storyboard" })).toBeInTheDocument();
  });

  it("brings the pane back on any choice of a collection, with that collection shown", async () => {
    const { store } = await setup("wide");
    act(() => store.getState().toggleCollectionVisible());
    expect(collection()).toBeNull();

    act(() => store.getState().setCollection("transitions"));

    expect(screen.getByRole("region", { name: "Sammlung: Videoübergänge" })).toBeInTheDocument();
    expect(workspace()).toHaveAttribute("data-collection", "shown");
  });

  it("keeps the hidden file dialog of the import reachable while the pane is away", async () => {
    const { store } = await setup("wide");
    act(() => store.getState().toggleCollectionVisible());
    // It lives in the shell, not in the pane - otherwise the import would be
    // gone together with the pane.
    expect(screen.getByTestId("media-import-input")).toBeInTheDocument();
  });

  it("shows the pane again after a reload", async () => {
    const { store, unmount } = await setup("wide");
    act(() => store.getState().toggleCollectionVisible());
    expect(collection()).toBeNull();
    unmount();

    const fresh = await setup("wide");
    expect(collection()).toBeInTheDocument();
    expect(fresh.store.getState().collectionVisible).toBe(true);
  });
});
