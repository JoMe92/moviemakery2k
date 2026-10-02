import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockApi } from "../store/testApi";
import { renderApp } from "../test/renderApp";

async function setup() {
  const api = mockApi({
    getProject: vi.fn(async () => ({
      schemaVersion: 1 as const,
      slides: [
        { id: "s1", mediaId: "a", duration: 5, transitionIn: null },
        { id: "s2", mediaId: "b", duration: 5, transitionIn: null },
      ],
    })),
  });
  const view = renderApp(api);
  await act(() => view.ready);
  act(() => view.store.getState().setCollection("transitions"));
  const collection = screen.getByRole("region", { name: "Sammlung: Videoübergänge" });
  return { ...view, collection };
}

describe("Sammlung „Videoübergänge“", () => {
  it("zeigt alle Katalogeinträge als Kacheln mit Vorschausymbol", async () => {
    const { collection } = await setup();
    const tiles = within(within(collection).getByRole("list", { name: "Übergänge" })).getAllByRole(
      "button",
    );
    expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual(["Überblenden", "Kreis"]);
    for (const tile of tiles) expect(tile.querySelector("svg")).not.toBeNull();
  });

  it("Auswahl einer Kachel setzt den Vorschau-Übergang", async () => {
    const user = userEvent.setup();
    const { collection, store } = await setup();
    const kreis = within(collection).getByRole("button", { name: "Kreis" });
    await user.click(kreis);
    expect(store.getState().previewTransitionId).toBe("circle");
    expect(kreis).toHaveAttribute("aria-pressed", "true");
  });

  it("Doppelklick setzt den Übergang vor das ausgewählte Bild (nicht vor das erste)", async () => {
    const user = userEvent.setup();
    const { collection, store } = await setup();
    act(() => store.getState().select({ kind: "slide", slideId: "s1" }));
    await user.dblClick(within(collection).getByRole("button", { name: "Kreis" }));
    expect(store.getState().slides[0]?.transitionIn).toBeNull();

    act(() => store.getState().select({ kind: "slide", slideId: "s2" }));
    await user.dblClick(within(collection).getByRole("button", { name: "Überblenden" }));
    expect(store.getState().slides[1]?.transitionIn).toEqual({
      transitionId: "fade",
      duration: 1.25,
    });
  });
});
