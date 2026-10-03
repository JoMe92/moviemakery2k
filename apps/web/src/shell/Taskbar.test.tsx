import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";

const withSlides = () =>
  mockApi({
    getProject: vi.fn(async () => ({
      schemaVersion: 2 as const,
      slides: [{ id: "s1", mediaId: "a", duration: 3, transitionIn: null }],
      music: [],
    })),
  });

async function setup(api = mockApi(), locale: "de" | "en" = "de") {
  mockLayout("compact");
  const user = userEvent.setup();
  const view = renderApp(api);
  await view.ready;
  if (locale === "en") act(() => view.store.getState().setLocale("en"));
  const taskbar = screen.getByRole("navigation", {
    name: locale === "de" ? "Filmschritte" : "Movie steps",
  });
  return { ...view, user, taskbar };
}

describe("taskbar (add-mobile-layout design.md D4)", () => {
  it("shows the three steps in German and English", async () => {
    const { taskbar, store } = await setup();
    const names = () =>
      within(taskbar)
        .getAllByRole("button")
        .map((b) => b.textContent);
    expect(names()).toEqual(["1. Aufnehmen", "2. Bearbeiten", "3. Fertig stellen"]);
    act(() => store.getState().setLocale("en"));
    expect(names()).toEqual(["1. Capture", "2. Edit", "3. Finish"]);
  });

  it("imports pictures via '1. Aufnehmen' → 'Bilder importieren'", async () => {
    const { user, taskbar } = await setup();
    const input = screen.getByTestId("media-import-input") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await user.click(within(taskbar).getByRole("button", { name: "1. Aufnehmen" }));
    const sheet = screen.getByRole("dialog", { name: "1. Aufnehmen" });
    expect(
      within(sheet)
        .getAllByRole("button")
        .map((b) => b.textContent)
        .filter((x) => x),
    ).toEqual(["Video importieren", "Bilder importieren", "Audio oder Musik importieren"]);
    expect(within(sheet).getByRole("button", { name: "Video importieren" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(within(sheet).getByRole("button", { name: "Bilder importieren" }));
    expect(click).toHaveBeenCalledOnce();
    expect(input.accept).toBe("image/jpeg,image/png,image/webp");
    // The step sheet gives way to the collection sheet showing "My Pictures".
    expect(screen.queryByRole("dialog", { name: "1. Aufnehmen" })).toBeNull();
    const collection = screen.getByRole("dialog", { name: "Sammlungen" });
    expect(within(collection).getByRole("tab", { name: "Meine Bilder" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("imports pictures in English too", async () => {
    const { user, taskbar } = await setup(mockApi(), "en");
    const input = screen.getByTestId("media-import-input") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await user.click(within(taskbar).getByRole("button", { name: "1. Capture" }));
    const sheet = screen.getByRole("dialog", { name: "1. Capture Video" });
    await user.click(within(sheet).getByRole("button", { name: "Import pictures" }));
    expect(click).toHaveBeenCalledOnce();
  });

  it("shows 'Auf dem Computer speichern' disabled with an empty storyboard", async () => {
    const { user, taskbar, store } = await setup();
    await user.click(within(taskbar).getByRole("button", { name: "3. Fertig stellen" }));
    const sheet = screen.getByRole("dialog", { name: "3. Film fertig stellen" });
    const save = within(sheet).getByRole("button", { name: "Auf dem Computer speichern" });
    expect(save).toBeVisible();
    expect(save).toHaveAttribute("aria-disabled", "true");
    await user.click(save);
    expect(store.getState().exportWizardOpen).toBe(false);
  });

  it("shows 'Save to my computer' disabled in English", async () => {
    const { user, taskbar } = await setup(mockApi(), "en");
    await user.click(within(taskbar).getByRole("button", { name: "3. Finish" }));
    const sheet = screen.getByRole("dialog", { name: "3. Finish Movie" });
    expect(within(sheet).getByRole("button", { name: "Save to my computer" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("opens the save wizard when the storyboard has pictures", async () => {
    const { user, taskbar, store } = await setup(withSlides());
    await user.click(within(taskbar).getByRole("button", { name: "3. Fertig stellen" }));
    const save = screen.getByRole("button", { name: "Auf dem Computer speichern" });
    expect(save).not.toHaveAttribute("aria-disabled");
    await user.click(save);
    expect(store.getState().exportWizardOpen).toBe(true);
  });

  it("highlights the active step", async () => {
    const { user, taskbar } = await setup();
    const step = (name: string) => within(taskbar).getByRole("button", { name });
    expect(step("1. Aufnehmen")).toHaveAttribute("aria-current", "step");
    await user.click(step("2. Bearbeiten"));
    expect(step("2. Bearbeiten")).toHaveAttribute("aria-current", "step");
    expect(step("1. Aufnehmen")).not.toHaveAttribute("aria-current");
    await user.keyboard("{Escape}");
    expect(step("2. Bearbeiten")).toHaveAttribute("aria-current", "step");
    expect(step("2. Bearbeiten")).toHaveFocus();
  });
});
