import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/apiClient";
import { mockApi } from "../store/testApi";
import { renderApp } from "../test/renderApp";

const WIZARD_TITLE = "Film speichern";

const slide = (id: string, mediaId: string): Slide => ({
  kind: "image",
  id,
  mediaId,
  duration: 5,
  effectId: null,
  title: null,
  transitionIn: null,
});

async function setup(slides: Slide[]) {
  const api = mockApi({
    getProject: vi.fn(async () => ({ schemaVersion: 5 as const, slides, music: [] })),
  });
  const view = renderApp(api);
  await act(() => view.ready);
  return { ...view, user: userEvent.setup() };
}

const taskLink = () => screen.getByRole("button", { name: "Auf dem Computer speichern" });
const wizard = () => screen.queryByRole("dialog", { name: WIZARD_TITLE });

async function openFileMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("menuitem", { name: "Datei" }));
  return screen.getByRole("menu", { name: "Datei" });
}

describe("“Save Movie” entry points (spec app-shell)", () => {
  it("Spec: empty storyboard – both entry points disabled", async () => {
    const { user, store } = await setup([]);

    expect(taskLink()).toHaveAttribute("aria-disabled", "true");
    await user.click(taskLink());
    expect(wizard()).toBeNull();
    expect(store.getState().exportWizardOpen).toBe(false);

    const menu = await openFileMenu(user);
    const item = within(menu).getByRole("menuitem", { name: "Film speichern…" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    await user.click(item);
    expect(screen.getByRole("menu", { name: "Datei" })).toBeInTheDocument();
    expect(wizard()).toBeNull();
  });

  it("“Publish to the web” stays disabled even with pictures", async () => {
    const { user } = await setup([slide("s1", "a")]);
    const publish = screen.getByRole("button", { name: "Im Web veröffentlichen" });
    expect(publish).toHaveAttribute("aria-disabled", "true");
    await user.click(publish);
    expect(wizard()).toBeNull();
  });

  it("Spec: finish movie – the task opens the wizard at the “File name” step", async () => {
    const { user, store } = await setup([slide("s1", "a")]);

    expect(taskLink()).not.toHaveAttribute("aria-disabled");
    await user.click(taskLink());
    const dialog = wizard();
    expect(dialog).not.toBeNull();
    expect(within(dialog as HTMLElement).getByRole("heading", { name: "Dateiname" })).toBeVisible();
    expect(store.getState().exportWizardOpen).toBe(true);

    await user.keyboard("{Escape}");
    expect(wizard()).toBeNull();
    expect(store.getState().exportWizardOpen).toBe(false);
    expect(taskLink()).toHaveFocus();
  });

  it("Spec: save movie via the menu (mouse)", async () => {
    const { user } = await setup([slide("s1", "a")]);
    const menu = await openFileMenu(user);
    const item = within(menu).getByRole("menuitem", { name: "Film speichern…" });
    expect(item).not.toHaveAttribute("aria-disabled");
    await user.click(item);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(wizard()).not.toBeNull();
  });

  it("Spec: save movie via the menu (keyboard)", async () => {
    const { user } = await setup([slide("s1", "a")]);
    const datei = screen.getByRole("menuitem", { name: "Datei" });
    datei.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu", { name: "Datei" });
    await waitFor(() =>
      expect(within(menu).getByRole("menuitem", { name: "Neues Projekt" })).toHaveFocus(),
    );
    const target = within(menu).getByRole("menuitem", { name: "Film speichern…" });
    for (let i = 0; i < 10 && document.activeElement !== target; i += 1) {
      await user.keyboard("{ArrowDown}");
    }
    expect(target).toHaveFocus();
    await user.keyboard("{Enter}");
    const dialog = wizard();
    expect(dialog).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Dateiname:" })).toHaveFocus();
  });

  it("follows changes to the storyboard", async () => {
    const { user, store } = await setup([slide("s1", "a")]);
    expect(taskLink()).not.toHaveAttribute("aria-disabled");

    act(() => store.getState().removeSlide("s1"));
    expect(taskLink()).toHaveAttribute("aria-disabled", "true");
    let menu = await openFileMenu(user);
    expect(within(menu).getByRole("menuitem", { name: "Film speichern…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.keyboard("{Escape}");

    act(() => store.getState().addSlide("b"));
    expect(taskLink()).not.toHaveAttribute("aria-disabled");
    menu = await openFileMenu(user);
    expect(within(menu).getByRole("menuitem", { name: "Film speichern…" })).not.toHaveAttribute(
      "aria-disabled",
    );
  });
});
