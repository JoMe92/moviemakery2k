import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Slide, TitleSlide } from "../lib/apiClient";
import { mockApi } from "../store/testApi";
import { renderApp } from "../test/renderApp";
import { CREDITS_DURATION_DEFAULT, TITLE_DURATION_DEFAULT } from "./titleStyle";
import { TITLE_LINE_MAX_LENGTH } from "./titleText";

const image = (id: string, mediaId: string): Slide => ({
  kind: "image",
  id,
  mediaId,
  duration: 5,
  effectId: null,
  title: null,
  transitionIn: null,
});

const video = (id: string, mediaId: string): Slide => ({
  kind: "video",
  id,
  mediaId,
  trimIn: 0,
  trimOut: 4,
  effectId: null,
  title: null,
  transitionIn: null,
});

const titleElement = (id: string): Slide => ({
  kind: "title",
  id,
  lines: ["Schon ein Titel"],
  creditEntries: null,
  styleId: "basic-title",
  color: "#ffffff",
  duration: TITLE_DURATION_DEFAULT,
  transitionIn: null,
});

async function setup(slides: Slide[] = [image("s1", "a"), image("s2", "b")]) {
  const api = mockApi({
    getProject: vi.fn(async () => ({
      schemaVersion: 6 as const,
      narration: [],
      clipAudioBalance: 50,
      music: [],
      slides,
    })),
  });
  const view = renderApp(api);
  await act(() => view.ready);
  return { ...view, api };
}

const wizard = () => screen.getByRole("dialog", { name: "Titel oder Nachspann erstellen" });
const step = () => within(wizard()).getByRole("heading", { level: 3 }).textContent;
const option = (name: string | RegExp) => within(wizard()).getByRole("radio", { name });
const button = (name: string) => within(wizard()).getByRole("button", { name });

async function openWizard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Titel oder Nachspann erstellen" }));
  return wizard();
}

/** Walks the remaining steps with the given text, style and colour. */
async function finish(
  user: ReturnType<typeof userEvent.setup>,
  { lines, style, color }: { lines: string[]; style: string; color: string },
) {
  await user.click(button("Weiter")); // placement → text
  for (const [i, line] of lines.entries()) {
    const field = within(wizard()).getByLabelText(`Zeile ${i + 1}:`);
    await user.clear(field);
    await user.type(field, line);
  }
  await user.click(button("Weiter")); // text → style
  await user.click(option(style));
  await user.click(button("Weiter")); // style → colour
  await user.click(option(color));
  await user.click(button("Fertig"));
}

describe("title wizard (TASK-WEB-066, design.md D6, spec titles-and-credits)", () => {
  it("the task pane entry opens the wizard at the 'Platzierung' step", async () => {
    const user = userEvent.setup();
    await setup();
    const entry = screen.getByRole("button", { name: "Titel oder Nachspann erstellen" });
    expect(entry).not.toBeDisabled();
    await user.click(entry);
    expect(wizard()).toBeVisible();
    expect(step()).toBe("Platzierung");
  });

  it("offers only 'Am Filmanfang' and 'Am Filmende' without a selection", async () => {
    const user = userEvent.setup();
    await setup();
    await openWizard(user);
    expect(option("Am Filmanfang")).toBeEnabled();
    expect(option("Am Filmende")).toBeEnabled();
    expect(option(/^Vor dem gewählten Element/)).toBeDisabled();
    expect(option(/^Auf dem gewählten Element/)).toBeDisabled();
  });

  it("enables 'Vor' and 'Auf' once a picture is selected", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    act(() => store.getState().select({ kind: "slide", slideId: "s1" }));
    await openWizard(user);
    expect(option(/^Vor dem gewählten Element/)).toBeEnabled();
    expect(option(/^Auf dem gewählten Element/)).toBeEnabled();
  });

  it("enables 'Vor' and 'Auf' for a selected video clip", async () => {
    const user = userEvent.setup();
    const { store } = await setup([video("v1", "clip")]);
    act(() => store.getState().select({ kind: "slide", slideId: "v1" }));
    await openWizard(user);
    expect(option(/^Vor dem gewählten Element/)).toBeEnabled();
    expect(option(/^Auf dem gewählten Element/)).toBeEnabled();
  });

  it("keeps 'Auf dem gewählten Element' unavailable for a selected title element", async () => {
    const user = userEvent.setup();
    const { store } = await setup([titleElement("t1"), image("s1", "a")]);
    act(() => store.getState().select({ kind: "slide", slideId: "t1" }));
    await openWizard(user);
    expect(option(/^Vor dem gewählten Element/)).toBeEnabled();
    expect(option(/^Auf dem gewählten Element/)).toBeDisabled();
  });

  it("offers both text lines, whichever style is chosen next", async () => {
    const user = userEvent.setup();
    await setup();
    await openWizard(user);
    await user.click(button("Weiter"));
    expect(within(wizard()).getByLabelText("Zeile 1:")).toBeVisible();
    expect(within(wizard()).getByLabelText("Zeile 2:")).toBeVisible();
  });

  it("keeps only the first line for a one-line style", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    await openWizard(user);
    await user.click(button("Weiter"));
    await user.type(within(wizard()).getByLabelText("Zeile 1:"), "Oben");
    await user.type(within(wizard()).getByLabelText("Zeile 2:"), "Unten");
    await user.click(button("Weiter"));
    await user.click(option("Einfacher Titel"));
    await user.click(button("Weiter"));
    await user.click(button("Fertig"));
    // No selection, so the default placement is "Am Filmanfang".
    const title = store.getState().slides[0] as TitleSlide;
    expect(title.lines).toEqual(["Oben"]);
  });

  it("keeps both lines for a two-line style", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    await openWizard(user);
    await user.click(button("Weiter"));
    await user.type(within(wizard()).getByLabelText("Zeile 1:"), "Oben");
    await user.type(within(wizard()).getByLabelText("Zeile 2:"), "Unten");
    await user.click(button("Weiter"));
    await user.click(option("Ein- und Ausblenden"));
    await user.click(button("Weiter"));
    await user.click(button("Fertig"));
    const title = store.getState().slides[0] as TitleSlide;
    expect(title.lines).toEqual(["Oben", "Unten"]);
  });

  it("walks all four steps with Weiter and back with Zurück", async () => {
    const user = userEvent.setup();
    await setup();
    await openWizard(user);
    expect(button("Zurück")).toBeDisabled();
    const line = within(wizard()).queryByLabelText("Zeile 1:");
    expect(line).toBeNull();

    await user.click(button("Weiter"));
    expect(step()).toBe("Text");
    await user.type(within(wizard()).getByLabelText("Zeile 1:"), "Mein Film");
    await user.click(button("Weiter"));
    expect(step()).toBe("Stil");
    await user.click(button("Weiter"));
    expect(step()).toBe("Farbe");

    await user.click(button("Zurück"));
    expect(step()).toBe("Stil");
    await user.click(button("Zurück"));
    expect(step()).toBe("Text");
  });

  it("refuses to leave the 'Text' step without any text", async () => {
    const user = userEvent.setup();
    await setup();
    await openWizard(user);
    await user.click(button("Weiter"));
    expect(step()).toBe("Text");
    expect(button("Weiter")).toBeDisabled();
    await user.type(within(wizard()).getByLabelText("Zeile 1:"), "Mein Film");
    expect(button("Weiter")).toBeEnabled();
  });

  // --- Live preview (design.md D6) -----------------------------------------

  it("previews the draft in the monitor on the 'Stil' step and clears it on Zurück", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    await openWizard(user);
    await user.click(button("Weiter"));
    await user.type(within(wizard()).getByLabelText("Zeile 1:"), "Mein Film");
    expect(store.getState().titlePreview).toBeNull();

    await user.click(button("Weiter"));
    expect(step()).toBe("Stil");
    expect(store.getState().titlePreview).toEqual({
      lines: ["Mein Film"],
      styleId: "basic-title",
      color: "#ffffff",
    });
    // The preview runs on the demo clock so the phases animate.
    expect(store.getState().demo?.playing).toBe(true);

    await user.click(button("Zurück"));
    expect(store.getState().titlePreview).toBeNull();
  });

  it("follows the chosen style and colour in the preview", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    await openWizard(user);
    await user.click(button("Weiter"));
    await user.type(within(wizard()).getByLabelText("Zeile 1:"), "Mein Film");
    await user.click(button("Weiter"));
    await user.click(option("Einfliegen"));
    expect(store.getState().titlePreview?.styleId).toBe("fly-in");
    await user.click(button("Weiter"));
    await user.click(option("Gelb"));
    expect(store.getState().titlePreview?.color).toBe("#ffff00");
  });

  it("ends the preview when the wizard is cancelled", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    await openWizard(user);
    await user.click(button("Weiter"));
    await user.type(within(wizard()).getByLabelText("Zeile 1:"), "Mein Film");
    await user.click(button("Weiter"));
    expect(store.getState().titlePreview).not.toBeNull();
    await user.click(button("Abbrechen"));
    expect(store.getState().titleWizardOpen).toBe(false);
    expect(store.getState().titlePreview).toBeNull();
  });

  // --- The title text limit (TASK-WEB-078, spec titles-and-credits) ---------

  it("stops a text line at the limit and inserts the element the backend accepts", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    await openWizard(user);
    await user.click(button("Weiter"));
    const line = within(wizard()).getByLabelText("Zeile 1:");
    await user.click(line);
    // A pasted over-long text is cut to the limit, not refused as a whole.
    await user.paste("A".repeat(TITLE_LINE_MAX_LENGTH + 300));
    expect(line).toHaveValue("A".repeat(TITLE_LINE_MAX_LENGTH));
    // At the limit the field takes no further character.
    await user.type(line, "weiter");
    expect(line).toHaveValue("A".repeat(TITLE_LINE_MAX_LENGTH));

    await user.click(button("Weiter"));
    await user.click(option("Einfacher Titel"));
    await user.click(button("Weiter"));
    await user.click(button("Fertig"));
    const title = store.getState().slides[0] as TitleSlide;
    expect(title.lines).toEqual(["A".repeat(TITLE_LINE_MAX_LENGTH)]);
  });

  it("stops the second text line at the limit as well", async () => {
    const user = userEvent.setup();
    await setup();
    await openWizard(user);
    await user.click(button("Weiter"));
    const second = within(wizard()).getByLabelText("Zeile 2:");
    await user.click(second);
    await user.paste("B".repeat(TITLE_LINE_MAX_LENGTH + 1));
    expect(second).toHaveValue("B".repeat(TITLE_LINE_MAX_LENGTH));
    // The first line keeps its own limit; neither field eats the other's.
    expect(within(wizard()).getByLabelText("Zeile 1:")).toHaveValue("");
  });

  it("stops a credits entry at the limit and leaves the other entries alone", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    await openWizard(user);
    await user.click(option("Am Filmende"));
    await user.click(button("Weiter"));
    await user.type(within(wizard()).getByLabelText("Zeile 1:"), "Platzhalter");
    await user.click(button("Weiter"));
    await user.click(option("Nach oben rollen, gestapelt"));
    await user.click(button("Zurück"));
    const entries = within(wizard()).getByLabelText("Einträge:");
    await user.clear(entries);
    // The middle entry is already full, the ones around it are not.
    const full = "b".repeat(TITLE_LINE_MAX_LENGTH);
    const text = `Regie: Ich\n${full}\nKamera: Auch ich`;
    await user.paste(text);
    expect(entries).toHaveValue(text);

    // Typing inside the full entry changes nothing - not even its neighbours.
    const caret = "Regie: Ich\n".length + TITLE_LINE_MAX_LENGTH;
    await user.type(entries, "x", {
      skipClick: true,
      initialSelectionStart: caret,
      initialSelectionEnd: caret,
    });
    expect(entries).toHaveValue(text);

    await user.click(button("Weiter"));
    await user.click(button("Weiter"));
    await user.click(button("Fertig"));
    const title = store.getState().slides.at(-1) as TitleSlide;
    expect(title.creditEntries).toEqual(["Regie: Ich", full, "Kamera: Auch ich"]);
  });

  it("cuts a pasted over-long credits entry to the limit", async () => {
    const user = userEvent.setup();
    await setup();
    await openWizard(user);
    await user.click(option("Am Filmende"));
    await user.click(button("Weiter"));
    await user.type(within(wizard()).getByLabelText("Zeile 1:"), "Platzhalter");
    await user.click(button("Weiter"));
    await user.click(option("Nach oben rollen, gestapelt"));
    await user.click(button("Zurück"));
    const entries = within(wizard()).getByLabelText("Einträge:");
    await user.clear(entries);
    await user.paste(`Regie: Ich\n${"c".repeat(TITLE_LINE_MAX_LENGTH + 50)}`);
    expect(entries).toHaveValue(`Regie: Ich\n${"c".repeat(TITLE_LINE_MAX_LENGTH)}`);
  });

  // --- Inserting and setting (spec titles-and-credits) ----------------------

  it("'Am Filmanfang' inserts a title element before the first one and selects it", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    await openWizard(user);
    await user.click(option("Am Filmanfang"));
    await finish(user, { lines: ["Mein Film"], style: "Einfacher Titel", color: "Weiß" });

    const slides = store.getState().slides;
    expect(slides.map((s) => s.kind)).toEqual(["title", "image", "image"]);
    const title = slides[0] as TitleSlide;
    expect(title).toMatchObject({
      lines: ["Mein Film"],
      creditEntries: null,
      styleId: "basic-title",
      color: "#ffffff",
      duration: TITLE_DURATION_DEFAULT,
      transitionIn: null,
    });
    expect(store.getState().selection).toEqual({ kind: "slide", slideId: title.id });
    expect(store.getState().titleWizardOpen).toBe(false);
    expect(store.getState().titlePreview).toBeNull();
  });

  it("'Am Filmende' appends the title element", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    await openWizard(user);
    await user.click(option("Am Filmende"));
    await finish(user, { lines: ["Ende"], style: "Einfacher Titel", color: "Weiß" });
    expect(store.getState().slides.map((s) => s.kind)).toEqual(["image", "image", "title"]);
  });

  it("'Vor dem gewählten Element' inserts at the selected element's position", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    act(() => store.getState().select({ kind: "slide", slideId: "s2" }));
    await openWizard(user);
    await user.click(option(/^Vor dem gewählten Element/));
    await finish(user, { lines: ["Kapitel 2"], style: "Einfacher Titel", color: "Weiß" });

    const slides = store.getState().slides;
    expect(slides.map((s) => s.kind)).toEqual(["image", "title", "image"]);
    expect(slides.map((s) => s.id)[2]).toBe("s2");
  });

  it("'Auf dem gewählten Element' sets the overlay field without touching the list", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    act(() => store.getState().select({ kind: "slide", slideId: "s1" }));
    await openWizard(user);
    await user.click(option(/^Auf dem gewählten Element/));
    await finish(user, { lines: ["Untertitel"], style: "Untertitel", color: "Gelb" });

    const slides = store.getState().slides;
    expect(slides.map((s) => s.kind)).toEqual(["image", "image"]);
    const host = slides[0];
    expect(host?.kind).toBe("image");
    expect(host?.kind === "image" ? host.title : null).toEqual({
      lines: ["Untertitel"],
      styleId: "subtitle",
      color: "#ffff00",
    });
    // The host keeps its own duration (an overlay has none of its own).
    expect(host?.kind === "image" ? host.duration : null).toBe(5);
  });

  it("stores a credits style's text as creditEntries, one entry per line", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    await openWizard(user);
    await user.click(option("Am Filmende"));
    await user.click(button("Weiter"));
    await user.type(within(wizard()).getByLabelText("Zeile 1:"), "Platzhalter");
    await user.click(button("Weiter"));
    await user.click(option("Nach oben rollen, gestapelt"));
    // Going back now offers the credits list, carrying the line over.
    await user.click(button("Zurück"));
    const entries = within(wizard()).getByLabelText("Einträge:");
    expect(entries).toHaveValue("Platzhalter");
    await user.clear(entries);
    await user.type(entries, "Regie: Ich{enter}Kamera: Auch ich");
    await user.click(button("Weiter"));
    await user.click(button("Weiter"));
    await user.click(button("Fertig"));

    const title = store.getState().slides.at(-1) as TitleSlide;
    expect(title.kind).toBe("title");
    expect(title.lines).toBeNull();
    expect(title.creditEntries).toEqual(["Regie: Ich", "Kamera: Auch ich"]);
    expect(title.duration).toBe(CREDITS_DURATION_DEFAULT);
  });

  it("saves the new title element to the backend as schema version 5", async () => {
    const user = userEvent.setup();
    const { store, api } = await setup();
    await openWizard(user);
    await user.click(option("Am Filmanfang"));
    await finish(user, { lines: ["Mein Film"], style: "Einfacher Titel", color: "Weiß" });
    await act(() => store.getState().flushSave());

    const saved = api.saved.at(-1);
    expect(saved?.schemaVersion).toBe(6);
    expect(saved?.slides[0]?.kind).toBe("title");
  });
});

describe("title store operations", () => {
  it("applyTitle refuses a placement the current selection does not allow", async () => {
    const { store } = await setup();
    const draft = { lines: ["X"], styleId: "basic-title", color: "#ffffff" };
    expect(store.getState().applyTitle("on", draft)).toBe(false);
    expect(store.getState().applyTitle("before", draft)).toBe(false);
    expect(store.getState().slides.map((s) => s.kind)).toEqual(["image", "image"]);
  });

  it("applyTitle refuses a style outside the catalog", async () => {
    const { store } = await setup();
    expect(
      store.getState().applyTitle("start", {
        lines: ["X"],
        styleId: "gibt-es-nicht",
        color: "#ffffff",
      }),
    ).toBe(false);
    expect(store.getState().slides).toHaveLength(2);
  });

  it("setTitleOverlay sets and removes an overlay, and refuses a title element", async () => {
    const { store } = await setup([image("s1", "a"), titleElement("t1")]);
    const overlay = { lines: ["Untertitel"], styleId: "subtitle", color: "#ffffff" };
    expect(store.getState().setTitleOverlay("s1", overlay)).toBe(true);
    const first = store.getState().slides[0];
    expect(first?.kind === "image" ? first.title : null).toEqual(overlay);

    expect(store.getState().setTitleOverlay("s1", null)).toBe(true);
    const cleared = store.getState().slides[0];
    expect(cleared?.kind === "image" ? cleared.title : "unset").toBeNull();

    expect(store.getState().setTitleOverlay("t1", overlay)).toBe(false);
    expect(store.getState().setTitleOverlay("s1", { ...overlay, styleId: "nope" })).toBe(false);
  });

  it("setTitlePreview ignores a draft whose style is not in the catalog", async () => {
    const { store } = await setup();
    act(() => store.getState().setTitlePreview({ lines: ["X"], styleId: "nope", color: "#fff" }));
    expect(store.getState().titlePreview).toBeNull();
  });
});
