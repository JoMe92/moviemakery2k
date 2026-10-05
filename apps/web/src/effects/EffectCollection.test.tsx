import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockApi, slideEffectIdOf } from "../store/testApi";
import { renderApp } from "../test/renderApp";

const slide = (id: string, mediaId: string, effectId: string | null = null) => ({
  kind: "image" as const,
  id,
  mediaId,
  duration: 5,
  effectId,
  title: null,
  transitionIn: null,
});

async function setup(slides = [slide("s1", "a"), slide("s2", "b")]) {
  const api = mockApi({
    getProject: vi.fn(async () => ({ schemaVersion: 5 as const, music: [], slides })),
  });
  const view = renderApp(api);
  await act(() => view.ready);
  act(() => view.store.getState().setCollection("effects"));
  const collection = screen.getByRole("region", { name: "Sammlung: Videoeffekte" });
  return { ...view, collection };
}

describe("'Video Effects' collection (TASK-WEB-065, design.md D4)", () => {
  const monitor = () => screen.getByRole("region", { name: "Vorschau" });
  const sampleLabel = () => within(monitor()).queryByText(/^Beispiel:/);

  it("shows every catalog entry as a tile", async () => {
    const { collection } = await setup();
    const tiles = within(within(collection).getByRole("list", { name: "Effekte" })).getAllByRole(
      "button",
    );
    expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual(["Sepia", "Negativ"]);
    for (const tile of tiles) expect(tile.querySelector("svg")).not.toBeNull();
  });

  it("the task pane entry 'Videoeffekte anzeigen' opens the collection", async () => {
    const user = userEvent.setup();
    const view = renderApp(mockApi());
    await act(() => view.ready);
    const entry = screen.getByRole("button", { name: "Videoeffekte anzeigen" });
    expect(entry).not.toBeDisabled();
    await user.click(entry);
    expect(view.store.getState().collection).toBe("effects");
    expect(screen.getByRole("region", { name: "Sammlung: Videoeffekte" })).toBeVisible();
  });

  it("opening the collection selects no tile and keeps the project in the monitor", async () => {
    const { collection, store } = await setup();
    const tiles = within(within(collection).getByRole("list", { name: "Effekte" })).getAllByRole(
      "button",
    );
    for (const tile of tiles) expect(tile).toHaveAttribute("aria-pressed", "false");
    expect(store.getState().previewEffectId).toBeNull();
    expect(sampleLabel()).toBeNull();
  });

  it("a double-click demonstrates the effect on the sample image, labelled 'Beispiel: <Name>'", async () => {
    const user = userEvent.setup();
    const { collection, store } = await setup();
    const sepia = within(collection).getByRole("button", { name: "Sepia" });
    await user.dblClick(sepia);

    expect(store.getState().previewEffectId).toBe("sepia");
    expect(sepia).toHaveAttribute("aria-pressed", "true");
    expect(within(monitor()).getByText("Beispiel: Sepia")).toBeVisible();
    // A still image: no demo clock runs for it.
    expect(store.getState().demo).toBeNull();
    expect(store.getState().playback.playing).toBe(false);

    act(() => store.getState().setLocale("en"));
    expect(
      within(screen.getByRole("region", { name: "Preview" })).getByText("Sample: Sepia"),
    ).toBeVisible();
  });

  it("selecting in the filmstrip returns to the project", async () => {
    const user = userEvent.setup();
    const { collection, store } = await setup();
    await user.dblClick(within(collection).getByRole("button", { name: "Negativ" }));
    expect(sampleLabel()).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /^Bild 2:/ }));
    expect(sampleLabel()).toBeNull();
    expect(store.getState().previewEffectId).toBeNull();
  });

  it("shows the catalog names in English after switching the language", async () => {
    const { collection, store } = await setup();
    expect(within(collection).getByRole("button", { name: "Negativ" })).toHaveTextContent(
      "Negativ",
    );
    act(() => store.getState().setLocale("en"));
    const english = screen.getByRole("region", { name: "Collection: Video Effects" });
    const list = within(english).getByRole("list", { name: "Effects" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((t) => t.getAttribute("aria-label")),
    ).toEqual(["Sepia", "Negative"]);
  });

  it("without a catalog the collection says so", async () => {
    const api = mockApi({ effectCatalog: vi.fn(async () => []) });
    const view = renderApp(api);
    await act(() => view.ready);
    act(() => view.store.getState().setCollection("effects"));
    expect(screen.getByText("Der Effektkatalog ist nicht verfügbar.")).toBeVisible();
  });
});

describe("Effect slot on a storyboard tile (TASK-WEB-065, design.md D4)", () => {
  const slotOf = (number: number) =>
    screen.getByRole("button", { name: new RegExp(`^Effekt-Platz für Bild ${number}:`) });

  it("is empty without an effect and names the effect once one is set", async () => {
    const { store } = await setup();
    expect(slotOf(1)).toHaveAccessibleName("Effekt-Platz für Bild 1: kein Effekt");
    expect(slotOf(1)).toHaveAttribute("data-filled", "false");

    act(() => store.getState().setEffect("s1", "sepia"));
    expect(slotOf(1)).toHaveAccessibleName("Effekt-Platz für Bild 1: Sepia");
    expect(slotOf(1)).toHaveAttribute("data-filled", "true");
    // The icon on the tile stays visible while an effect is set.
    expect(slotOf(1).querySelector("svg")).not.toBeNull();
  });

  it("setEffect ignores an ID outside the catalog and keeps the project valid", async () => {
    const { store } = await setup();
    act(() => store.getState().setEffect("s1", "gibt-es-nicht"));
    expect(slideEffectIdOf(store.getState().slides[0])).toBeNull();
  });

  it("'Keinen Effekt' in the context menu removes the effect", async () => {
    const user = userEvent.setup();
    const { store } = await setup([slide("s1", "a", "sepia"), slide("s2", "b")]);
    await user.pointer({ keys: "[MouseRight]", target: slotOf(1) });
    const menu = screen.getByRole("menu", { name: "Effekt-Platz für Bild 1" });
    await user.click(within(menu).getByRole("menuitem", { name: "Keinen Effekt" }));

    expect(slideEffectIdOf(store.getState().slides[0])).toBeNull();
    expect(slotOf(1)).toHaveAccessibleName("Effekt-Platz für Bild 1: kein Effekt");
  });

  it("'Keinen Effekt' is disabled on an element without an effect", async () => {
    const user = userEvent.setup();
    await setup();
    await user.pointer({ keys: "[MouseRight]", target: slotOf(2) });
    const menu = screen.getByRole("menu", { name: "Effekt-Platz für Bild 2" });
    expect(within(menu).getByRole("menuitem", { name: "Keinen Effekt" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("Delete on the focused slot removes the effect", async () => {
    const user = userEvent.setup();
    const { store } = await setup([slide("s1", "a", "negative"), slide("s2", "b")]);
    slotOf(1).focus();
    await user.keyboard("{Delete}");
    expect(slideEffectIdOf(store.getState().slides[0])).toBeNull();
  });

  it("the slide context menu offers 'Keinen Effekt' too (touch layout has no slot)", async () => {
    const user = userEvent.setup();
    const { store } = await setup([slide("s1", "a", "sepia"), slide("s2", "b")]);
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("button", { name: /^Bild 1:/ }),
    });
    const menu = screen.getByRole("menu", { name: "Bild 1 des Storyboards" });
    await user.click(within(menu).getByRole("menuitem", { name: "Keinen Effekt" }));
    expect(slideEffectIdOf(store.getState().slides[0])).toBeNull();
  });
});
