import { act, fireEvent, screen, within } from "@testing-library/react";
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

describe("'Video Transitions' collection", () => {
  it("shows all catalog entries as tiles with a preview icon", async () => {
    const { collection } = await setup();
    const tiles = within(within(collection).getByRole("list", { name: "Übergänge" })).getAllByRole(
      "button",
    );
    expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual(["Überblenden", "Kreis"]);
    for (const tile of tiles) expect(tile.querySelector("svg")).not.toBeNull();
  });

  it("selecting a tile sets the preview transition", async () => {
    const user = userEvent.setup();
    const { collection, store } = await setup();
    const kreis = within(collection).getByRole("button", { name: "Kreis" });
    await user.click(kreis);
    expect(store.getState().previewTransitionId).toBe("circle");
    expect(kreis).toHaveAttribute("aria-pressed", "true");
  });

  describe("Spec transitions 'Übergänge in der Sammlung' (design.md D7)", () => {
    const monitor = () => screen.getByRole("region", { name: "Vorschau" });
    const sampleLabel = () => within(monitor()).queryByText(/^Beispiel:/);

    it("Scenario 'Sammlung öffnen': no tile is selected and the monitor keeps showing the project", async () => {
      const user = userEvent.setup();
      const view = renderApp(
        mockApi({
          getProject: vi.fn(async () => ({
            schemaVersion: 1 as const,
            slides: [
              { id: "s1", mediaId: "a", duration: 5, transitionIn: null },
              { id: "s2", mediaId: "b", duration: 5, transitionIn: null },
            ],
          })),
        }),
      );
      await act(() => view.ready);
      await user.click(screen.getByRole("button", { name: "Videoübergänge anzeigen" }));
      const collection = screen.getByRole("region", { name: "Sammlung: Videoübergänge" });
      const tiles = within(
        within(collection).getByRole("list", { name: "Übergänge" }),
      ).getAllByRole("button");
      expect(tiles).toHaveLength(2);
      for (const tile of tiles) expect(tile).toHaveAttribute("aria-pressed", "false");
      expect(view.store.getState().previewTransitionId).toBeNull();
      expect(view.store.getState().demo).toBeNull();
      expect(sampleLabel()).toBeNull();

      // A demo left over from an earlier visit is not shown again on reopening.
      await user.click(within(collection).getByRole("button", { name: "Kreis" }));
      act(() => view.store.getState().setCollection("media"));
      act(() => view.store.getState().setCollection("transitions"));
      const reopened = screen.getByRole("region", { name: "Sammlung: Videoübergänge" });
      expect(within(reopened).queryAllByRole("button", { pressed: true })).toEqual([]);
      expect(sampleLabel()).toBeNull();
    });

    it("Scenario 'Übergang ansehen': a click plays the demo once, labelled 'Beispiel: <Name>'", async () => {
      const user = userEvent.setup();
      const { collection, store } = await setup();
      await user.click(within(collection).getByRole("button", { name: "Kreis" }));
      expect(store.getState().demo).toEqual({ playing: true, time: 0 });
      expect(within(monitor()).getByText("Beispiel: Kreis")).toBeVisible();

      // Runs exactly once: 0.5 s hold + 1.5 s circle + 0.5 s hold, then stops.
      act(() => {
        for (let i = 0; i < 200 && store.getState().demo?.playing; i++) store.getState().tick(0.05);
      });
      expect(store.getState().demo).toEqual({ playing: false, time: 2.5 });
      act(() => store.getState().tick(1));
      expect(store.getState().demo).toEqual({ playing: false, time: 2.5 });
      expect(store.getState().playback.playing).toBe(false);

      act(() => store.getState().setLocale("en"));
      expect(
        within(screen.getByRole("region", { name: "Preview" })).getByText("Sample: Circle"),
      ).toBeVisible();
    });

    it("Scenario 'Zurück zum Projekt': play returns to the project without the sample label", async () => {
      const user = userEvent.setup();
      const { collection, store } = await setup();
      await user.click(within(collection).getByRole("button", { name: "Kreis" }));
      act(() => {
        for (let i = 0; i < 200 && store.getState().demo?.playing; i++) store.getState().tick(0.05);
      });
      expect(sampleLabel()).not.toBeNull();
      await user.click(within(monitor()).getByRole("button", { name: "Wiedergabe" }));
      expect(sampleLabel()).toBeNull();
      expect(store.getState().demo).toBeNull();
      expect(store.getState().playback.playing).toBe(true);
      expect(within(collection).queryAllByRole("button", { pressed: true })).toEqual([]);
    });

    it("seeking and selecting in the filmstrip also return to the project", async () => {
      const user = userEvent.setup();
      const { collection, store } = await setup();
      const kreis = within(collection).getByRole("button", { name: "Kreis" });

      await user.click(kreis);
      expect(sampleLabel()).not.toBeNull();
      fireEvent.change(within(monitor()).getByRole("slider", { name: "Suchleiste" }), {
        target: { value: "2" },
      });
      expect(sampleLabel()).toBeNull();
      expect(store.getState().demo).toBeNull();

      await user.click(kreis);
      expect(sampleLabel()).not.toBeNull();
      await user.click(screen.getByRole("button", { name: /^Bild 2:/ }));
      expect(sampleLabel()).toBeNull();
      expect(store.getState().demo).toBeNull();
      expect(store.getState().playback.time).toBe(5);
    });
  });

  it("double-click sets the transition before the selected image (not before the first)", async () => {
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

  it("Spec localization: shows the catalog names in English and switches without reloading", async () => {
    const user = userEvent.setup();
    const { collection, store } = await setup();
    expect(within(collection).getByRole("button", { name: "Kreis" })).toHaveTextContent("Kreis");

    act(() => store.getState().setLocale("en"));
    const english = screen.getByRole("region", { name: "Collection: Video Transitions" });
    const list = within(english).getByRole("list", { name: "Transitions" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((t) => t.getAttribute("aria-label")),
    ).toEqual(["Fade", "Circle"]);
    expect(within(list).getByRole("button", { name: "Circle" })).toHaveTextContent("Circle");

    // The name also follows the language in the storyboard and its dialog.
    act(() => store.getState().setTransition("s2", "circle"));
    const slot = screen.getByRole("button", { name: /^Transition before picture 2:/ });
    expect(slot).toHaveAccessibleName("Transition before picture 2: Circle, 1.50 s");
    await user.dblClick(slot);
    expect(screen.getByRole("dialog", { name: "Transition before picture 2" })).toHaveTextContent(
      "Transition: Circle",
    );
  });
});
