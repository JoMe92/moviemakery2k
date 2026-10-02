import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem, MusicClip } from "../lib/apiClient";
import { audioItem, mediaItem, mockApi } from "../store/testApi";
import { renderApp } from "../test/renderApp";
import { clearPeaksCache } from "./peaks";

/*
 * Spec music-track "Musikstücke bearbeiten": context menu, "Volume…" and
 * "Trim…" dialogs with their range checks, fade toggles, Edit → Delete.
 */

const clip = (id: string, mediaId: string, patch: Partial<MusicClip> = {}): MusicClip => ({
  id,
  mediaId,
  trimStart: 0,
  trimEnd: null,
  volume: 1,
  fadeIn: false,
  fadeOut: false,
  ...patch,
});

const MEDIA: MediaItem[] = [mediaItem("a"), audioItem("song", 192.4, "song.mp3")];

async function ready(music: MusicClip[], media: MediaItem[] = MEDIA) {
  const api = mockApi({
    listMedia: vi.fn(async () => media),
    getProject: vi.fn(async () => ({ schemaVersion: 2 as const, slides: [], music })),
  });
  const view = renderApp(api);
  await act(() => view.ready);
  return { ...view, api };
}

const DE = {
  block: (n: number) => screen.getByRole("button", { name: new RegExp(`^Musikstück ${n}:`) }),
  menu: (n: number) => screen.getByRole("menu", { name: `Musikstück ${n} der Musikleiste` }),
};
const EN = {
  block: (n: number) => screen.getByRole("button", { name: new RegExp(`^Music clip ${n}:`) }),
  menu: (n: number) => screen.getByRole("menu", { name: `Music clip ${n} of the music track` }),
};

/** Plain and checkable items of a menu, in order. */
const itemsOf = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]'));

function openMenu(lang: typeof DE, n = 1) {
  fireEvent.contextMenu(lang.block(n), { clientX: 50, clientY: 50 });
  return lang.menu(n);
}

async function saved(
  store: Awaited<ReturnType<typeof ready>>["store"],
  api: { saved: { music: MusicClip[] }[] },
) {
  await act(() => store.getState().flushSave());
  return api.saved.at(-1)?.music;
}

beforeEach(() => {
  clearPeaksCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ rate: 50, peaks: [0.2, 0.9] }))),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Music clip context menu", () => {
  it("offers Remove, Volume…, Fade In, Fade Out (toggles) and Trim… in German", async () => {
    await ready([clip("c1", "song", { fadeOut: true })]);
    const menu = openMenu(DE);
    const items = itemsOf(menu);
    expect(items.map((m) => m.textContent)).toEqual([
      "Entfernen",
      "Lautstärke…",
      "Einblenden",
      "Ausblenden",
      "Kürzen…",
    ]);
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Einblenden" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Ausblenden" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("English menu texts", async () => {
    localStorage.setItem("mmy.locale", "en");
    await ready([clip("c1", "song")]);
    const menu = openMenu(EN);
    expect(itemsOf(menu).map((m) => m.textContent)).toEqual([
      "Remove",
      "Volume…",
      "Fade In",
      "Fade Out",
      "Trim…",
    ]);
  });

  it("Spec: Einblenden – Fade In / Fade Out toggle, show the check mark and are saved", async () => {
    const user = userEvent.setup();
    const { store, api } = await ready([clip("c1", "song")]);
    await user.click(within(openMenu(DE)).getByRole("menuitemcheckbox", { name: "Einblenden" }));
    expect(store.getState().music[0]).toMatchObject({ fadeIn: true, fadeOut: false });
    expect(await saved(store, api)).toEqual([clip("c1", "song", { fadeIn: true })]);

    let menu = openMenu(DE);
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Einblenden" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(within(menu).getByRole("menuitemcheckbox", { name: "Ausblenden" }));
    expect(store.getState().music[0]).toMatchObject({ fadeIn: true, fadeOut: true });

    menu = openMenu(DE);
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Ausblenden" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(within(menu).getByRole("menuitemcheckbox", { name: "Einblenden" }));
    expect(store.getState().music[0]).toMatchObject({ fadeIn: false, fadeOut: true });
    expect(await saved(store, api)).toEqual([clip("c1", "song", { fadeOut: true })]);
  });

  it("Trim… is disabled when the audio file is missing", async () => {
    await ready([clip("c1", "gone")]);
    const trim = within(openMenu(DE)).getByRole("menuitem", { name: "Kürzen…" });
    expect(trim).toHaveAttribute("aria-disabled", "true");
  });

  it("Edit → Delete removes the selected music clip", async () => {
    const user = userEvent.setup();
    const { store, api } = await ready([clip("c1", "song"), clip("c2", "song")]);
    await user.click(DE.block(2));
    expect(store.getState().musicSelection).toBe("c2");
    await user.click(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    const del = screen.getByRole("menuitem", { name: /Löschen/ });
    expect(del).not.toHaveAttribute("aria-disabled");
    await user.click(del);
    expect(store.getState().music.map((c) => c.id)).toEqual(["c1"]);
    expect(store.getState().musicSelection).toBeNull();
    expect((await saved(store, api))?.map((c) => c.id)).toEqual(["c1"]);
  });

  it("Edit → Delete is disabled without a selection", async () => {
    const user = userEvent.setup();
    await ready([clip("c1", "song")]);
    await user.click(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    expect(screen.getByRole("menuitem", { name: /Löschen/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("Volume dialog", () => {
  async function openVolume(lang: typeof DE, name: string) {
    const user = userEvent.setup();
    await user.click(within(openMenu(lang)).getByRole("menuitem", { name }));
    return user;
  }

  it("Spec: Lautstärke senken – 50 % is applied and saved (German)", async () => {
    const { store, api } = await ready([clip("c1", "song")]);
    const user = await openVolume(DE, "Lautstärke…");
    const dialog = screen.getByRole("dialog", { name: "Lautstärke von Musikstück 1" });
    const field = within(dialog).getByRole("textbox", { name: "Lautstärke (%)" });
    const slider = within(dialog).getByRole("slider", { name: "Lautstärke" });
    expect(field).toHaveValue("100");
    expect(slider).toHaveValue("100");
    expect(within(dialog).getByText("Erlaubt sind 0 bis 200 %.")).toBeInTheDocument();

    await user.clear(field);
    await user.type(field, "50");
    expect(slider).toHaveValue("50");
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(store.getState().music[0]?.volume).toBe(0.5);
    expect(await saved(store, api)).toEqual([clip("c1", "song", { volume: 0.5 })]);
  });

  it("the slider sets the field; decimal comma is accepted", async () => {
    const { store } = await ready([clip("c1", "song")]);
    const user = await openVolume(DE, "Lautstärke…");
    const dialog = screen.getByRole("dialog", { name: "Lautstärke von Musikstück 1" });
    const field = within(dialog).getByRole("textbox", { name: "Lautstärke (%)" });
    fireEvent.change(within(dialog).getByRole("slider", { name: "Lautstärke" }), {
      target: { value: "150" },
    });
    expect(field).toHaveValue("150");
    await user.clear(field);
    await user.type(field, "75,5{Enter}");
    expect(store.getState().music[0]?.volume).toBeCloseTo(0.755, 9);
  });

  it.each(["250", "-5", "abc", ""])("refuses %j in German and names the range", async (input) => {
    const { store, api } = await ready([clip("c1", "song", { volume: 0.8 })]);
    const user = await openVolume(DE, "Lautstärke…");
    const dialog = screen.getByRole("dialog", { name: "Lautstärke von Musikstück 1" });
    const field = within(dialog).getByRole("textbox", { name: "Lautstärke (%)" });
    expect(field).toHaveValue("80");
    await user.clear(field);
    if (input) await user.type(field, input);
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Erlaubt sind 0 bis 200 %.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(store.getState().music[0]?.volume).toBe(0.8);
    await act(() => store.getState().flushSave());
    expect(api.putProject).not.toHaveBeenCalled();
  });

  it("English: valid and invalid input", async () => {
    localStorage.setItem("mmy.locale", "en");
    const { store } = await ready([clip("c1", "song")]);
    const user = await openVolume(EN, "Volume…");
    const dialog = screen.getByRole("dialog", { name: "Volume of music clip 1" });
    const field = within(dialog).getByRole("textbox", { name: "Volume (%)" });
    await user.clear(field);
    await user.type(field, "200.5");
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Allowed are 0 to 200 %.");
    expect(store.getState().music[0]?.volume).toBe(1);

    await user.clear(field);
    await user.type(field, "0");
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(store.getState().music[0]?.volume).toBe(0);
  });

  it("Cancel and the title-bar close button change nothing", async () => {
    const { store } = await ready([clip("c1", "song")]);
    let user = await openVolume(DE, "Lautstärke…");
    let dialog = screen.getByRole("dialog", { name: "Lautstärke von Musikstück 1" });
    await user.type(within(dialog).getByRole("textbox", { name: "Lautstärke (%)" }), "5");
    await user.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    user = await openVolume(DE, "Lautstärke…");
    dialog = screen.getByRole("dialog", { name: "Lautstärke von Musikstück 1" });
    expect(within(dialog).getByRole("textbox", { name: "Lautstärke (%)" })).toHaveValue("100");
    await user.click(within(dialog).getByRole("button", { name: "Dialog schließen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(store.getState().music[0]?.volume).toBe(1);
  });
});

describe("Trim dialog", () => {
  async function openTrim(lang: typeof DE, name: string) {
    const user = userEvent.setup();
    await user.click(within(openMenu(lang)).getByRole("menuitem", { name }));
    return user;
  }

  async function enter(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) {
    await user.clear(field);
    await user.type(field, text);
  }

  const DE_RANGE =
    "Erlaubt sind Anfang und Ende von 0:00,00 bis 3:12,40; der Anfang muss vor dem Ende liegen, die Länge mindestens 0,5 s betragen.";
  const EN_RANGE =
    "Allowed are start and end from 0:00.00 to 3:12.40; the start must lie before the end and the length must be at least 0.5 s.";

  it("shows start, end (file end for null) and the file duration; valid input is saved (German)", async () => {
    const { store, api } = await ready([clip("c1", "song")]);
    const user = await openTrim(DE, "Kürzen…");
    const dialog = screen.getByRole("dialog", { name: "Musikstück 1 kürzen" });
    expect(within(dialog).getByText("Dateidauer: 3:12,40")).toBeInTheDocument();
    const start = within(dialog).getByRole("textbox", { name: "Anfang" });
    const end = within(dialog).getByRole("textbox", { name: "Ende" });
    expect(start).toHaveValue("0:00,00");
    expect(end).toHaveValue("3:12,40");

    await enter(user, start, "0:10,5");
    await enter(user, end, "70");
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await saved(store, api)).toEqual([clip("c1", "song", { trimStart: 10.5, trimEnd: 70 })]);
    expect(DE.block(1)).toHaveAccessibleName("Musikstück 1: song.mp3, 1:00");
  });

  it("an end equal to the file duration is stored as null", async () => {
    const { store } = await ready([clip("c1", "song", { trimStart: 5, trimEnd: 60 })]);
    const user = await openTrim(DE, "Kürzen…");
    const dialog = screen.getByRole("dialog", { name: "Musikstück 1 kürzen" });
    const end = within(dialog).getByRole("textbox", { name: "Ende" });
    expect(end).toHaveValue("1:00,00");
    await enter(user, end, "3:12.4{Enter}");
    expect(store.getState().music[0]).toMatchObject({ trimStart: 5, trimEnd: null });
  });

  it.each([
    ["Spec: Ungültiges Ende – end beyond the file", "0:00", "3:13"],
    ["start after end", "1:00", "0:30"],
    ["start equal to end", "1:00", "1:00"],
    ["shorter than 0.5 s", "10", "10,4"],
    ["unreadable start", "abc", "1:00"],
    ["seconds ≥ 60", "0:00", "1:60"],
    ["negative start", "-1", "1:00"],
  ])("refuses %s in German and names the range", async (_name, startText, endText) => {
    const { store, api } = await ready([clip("c1", "song")]);
    const user = await openTrim(DE, "Kürzen…");
    const dialog = screen.getByRole("dialog", { name: "Musikstück 1 kürzen" });
    await enter(user, within(dialog).getByRole("textbox", { name: "Anfang" }), startText);
    await enter(user, within(dialog).getByRole("textbox", { name: "Ende" }), endText);
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(DE_RANGE);
    expect(store.getState().music[0]).toEqual(clip("c1", "song"));
    await act(() => store.getState().flushSave());
    expect(api.putProject).not.toHaveBeenCalled();
  });

  it("English: valid and invalid input", async () => {
    localStorage.setItem("mmy.locale", "en");
    const { store } = await ready([clip("c1", "song")]);
    const user = await openTrim(EN, "Trim…");
    const dialog = screen.getByRole("dialog", { name: "Trim music clip 1" });
    expect(within(dialog).getByText("File duration: 3:12.40")).toBeInTheDocument();
    const start = within(dialog).getByRole("textbox", { name: "Start" });
    const end = within(dialog).getByRole("textbox", { name: "End" });
    expect(start).toHaveValue("0:00.00");
    expect(end).toHaveValue("3:12.40");
    expect(within(dialog).getByText(EN_RANGE)).toBeInTheDocument();

    await enter(user, end, "3:12.41");
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(EN_RANGE);
    expect(store.getState().music[0]).toEqual(clip("c1", "song"));

    await enter(user, start, "1:00.25");
    await enter(user, end, "90,5");
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(store.getState().music[0]).toMatchObject({ trimStart: 60.25, trimEnd: 90.5 });
  });
});
