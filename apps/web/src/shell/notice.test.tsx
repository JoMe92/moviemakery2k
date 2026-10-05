import { act, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";
import { NOTICE_DURATION } from "./notice";

/*
 * The short notice as one channel with two presentations (app-shell design.md
 * D4): the notice strip of the compact and medium layouts and a temporary
 * field in the wide layout's status bar. What sets it is TASK-WEB-077; here
 * the store's action is called straight away.
 */

afterEach(() => {
  vi.useRealTimers();
});

async function setup(mode: "wide" | "medium" | "compact") {
  mockLayout(mode);
  // Fake timers from the start, so the notice that loading itself produces
  // ("Saved", backend ready) runs on them and can be waited out here.
  vi.useFakeTimers();
  const view = renderApp();
  await act(() => view.ready);
  act(() => vi.advanceTimersByTime(NOTICE_DURATION));
  return view;
}

/** The notice strip of the compact and medium layouts (never the status bar). */
function strip(): HTMLElement {
  const found = screen
    .getAllByRole("status")
    .find((el) => el.tagName === "DIV" && el.getAttribute("aria-live") === "polite");
  if (!found) throw new Error("notice strip missing");
  return found;
}

const statusBar = () => screen.getByRole("contentinfo");

describe("the short notice", () => {
  it("appears in the wide layout as a temporary status-bar field", async () => {
    const { store } = await setup("wide");
    const before = within(statusBar()).getAllByRole("status").length;

    act(() => store.getState().notify("3 Bilder hinzugefügt"));

    const field = within(statusBar()).getByText("3 Bilder hinzugefügt");
    // Announced politely for assistive technology, like the notice strip;
    // `output` carries the role "status" without saying so.
    expect(within(statusBar()).getAllByRole("status")).toContain(field);
    expect(field).toHaveAttribute("aria-live", "polite");
    // The fields that were there keep their place; the notice is an extra one.
    expect(within(statusBar()).getAllByRole("status")).toHaveLength(before + 1);
    expect(within(statusBar()).getByText(/Backend bereit/)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(NOTICE_DURATION));
    expect(within(statusBar()).queryByText("3 Bilder hinzugefügt")).toBeNull();
    expect(within(statusBar()).getAllByRole("status")).toHaveLength(before);
  });

  it.each(["medium", "compact"] as const)("appears in the %s layout as a notice", async (mode) => {
    const { store } = await setup(mode);
    expect(strip()).toBeEmptyDOMElement();

    act(() => store.getState().notify("1 Musikstück hinzugefügt"));
    expect(strip()).toHaveTextContent("1 Musikstück hinzugefügt");

    act(() => vi.advanceTimersByTime(NOTICE_DURATION - 1));
    expect(strip()).toHaveTextContent("1 Musikstück hinzugefügt");
    act(() => vi.advanceTimersByTime(1));
    expect(strip()).toBeEmptyDOMElement();
  });

  it("outranks “Saved”, and that message does not surface later either", async () => {
    const { store } = await setup("medium");
    act(() => store.getState().notify("2 Bilder hinzugefügt"));

    // The add triggers the autosave; "Saved" must not overwrite the notice.
    act(() => store.setState({ saveState: "saving" }));
    act(() => store.setState({ saveState: "saved" }));
    expect(strip()).toHaveTextContent("2 Bilder hinzugefügt");

    act(() => vi.advanceTimersByTime(NOTICE_DURATION));
    expect(strip()).toBeEmptyDOMElement();
  });

  it("pushes a standing state message aside, and it does not come back", async () => {
    const { store } = await setup("medium");
    act(() => store.setState({ saveState: "saving" }));
    act(() => store.setState({ saveState: "saved" }));
    expect(strip()).toHaveTextContent("Gespeichert");

    act(() => vi.advanceTimersByTime(500));
    act(() => store.getState().notify("1 Bild hinzugefügt"));
    expect(strip()).toHaveTextContent("1 Bild hinzugefügt");

    // The state message's own time would have run out here.
    act(() => vi.advanceTimersByTime(NOTICE_DURATION - 500));
    expect(strip()).toHaveTextContent("1 Bild hinzugefügt");
    act(() => vi.advanceTimersByTime(500));
    expect(strip()).toBeEmptyDOMElement();
  });

  it("is replaced by a newer notice at once, the same text included", async () => {
    const { store } = await setup("medium");
    act(() => store.getState().notify("1 Bild hinzugefügt"));
    act(() => vi.advanceTimersByTime(2000));
    act(() => store.getState().notify("2 Bilder hinzugefügt"));
    expect(strip()).toHaveTextContent("2 Bilder hinzugefügt");

    // The newer notice brings its own full time with it.
    act(() => vi.advanceTimersByTime(NOTICE_DURATION - 1));
    expect(strip()).toHaveTextContent("2 Bilder hinzugefügt");
    act(() => vi.advanceTimersByTime(1));
    expect(strip()).toBeEmptyDOMElement();

    // The same text twice is a new notice, not a no-op.
    act(() => store.getState().notify("2 Bilder hinzugefügt"));
    expect(strip()).toHaveTextContent("2 Bilder hinzugefügt");
    act(() => vi.advanceTimersByTime(NOTICE_DURATION));
    act(() => store.getState().notify("2 Bilder hinzugefügt"));
    expect(strip()).toHaveTextContent("2 Bilder hinzugefügt");
  });

  it("counts up in the store so the same text is a new notice", async () => {
    const { store } = await setup("wide");
    act(() => store.getState().notify("1 Bild hinzugefügt"));
    expect(store.getState().notice).toEqual({ text: "1 Bild hinzugefügt", seq: 1 });
    act(() => store.getState().notify("1 Bild hinzugefügt"));
    expect(store.getState().notice).toEqual({ text: "1 Bild hinzugefügt", seq: 2 });
  });
});
