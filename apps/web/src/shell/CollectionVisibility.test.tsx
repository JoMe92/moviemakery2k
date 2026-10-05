import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";

/*
 * The toolbar toggle "Collections" and the hideable collection pane of the
 * wide and medium layouts (app-shell design.md D1, D2, D3, D5).
 */

async function setup(mode: "wide" | "medium" | "compact") {
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

const toggle = () => screen.getByRole("button", { name: "Sammlungen" });

describe("the toolbar toggle “Collections”", () => {
  it("sits in the toolbar left of the picker and starts pressed", async () => {
    await setup("wide");
    const toolbar = screen.getByRole("toolbar", { name: "Symbolleiste" });
    const button = within(toolbar).getByRole("button", { name: "Sammlungen" });
    const picker = within(toolbar).getByRole("combobox", { name: "Sammlungen:" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    // Document order: the toggle comes first.
    expect(button.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides and shows the pane by mouse, keeping its name and tracking aria-pressed", async () => {
    const user = userEvent.setup();
    const { store } = await setup("wide");

    await user.click(toggle());
    expect(store.getState().collectionVisible).toBe(false);
    expect(collection()).toBeNull();
    // Same accessible name in both states (design.md D1).
    expect(toggle()).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle());
    expect(collection()).toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-pressed", "true");
  });

  it("is reachable and operable by keyboard", async () => {
    const user = userEvent.setup();
    const { store } = await setup("wide");
    act(() => toggle().focus());
    expect(toggle()).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(store.getState().collectionVisible).toBe(false);
    await user.keyboard(" ");
    expect(store.getState().collectionVisible).toBe(true);
    // The keyboard never loses the button, even while the pane is away.
    expect(toggle()).toHaveFocus();
  });

  it("works in the medium layout as well", async () => {
    const user = userEvent.setup();
    await setup("medium");
    await user.click(toggle());
    expect(collection()).toBeNull();
    expect(toggle()).toHaveAttribute("aria-pressed", "false");
  });

  it("is named “Collections” in English", async () => {
    const user = userEvent.setup();
    const { store } = await setup("wide");
    act(() => store.getState().setLocale("en"));

    const button = screen.getByRole("button", { name: "Collections" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await user.click(button);
    expect(screen.getByRole("button", { name: "Collections" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByRole("region", { name: "Collection: My Pictures" })).toBeNull();
  });

  it("is absent in the compact layout, which has no toolbar", async () => {
    await setup("compact");
    expect(screen.queryByRole("toolbar", { name: "Symbolleiste" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sammlungen" })).toBeNull();
  });
});
