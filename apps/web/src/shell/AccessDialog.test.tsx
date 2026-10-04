import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError, isAuthRequired } from "../lib/apiClient";
import { mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";

// add-mobile-delivery design.md D4: the LAN mode answers 401 auth.required.
const authRequired = () =>
  new ApiError("Access required", 401, {
    code: "auth.required",
    params: {},
    message: "Access required: open the link or QR code from the terminal again.",
  });

const lockedApi = () =>
  mockApi({
    health: vi.fn(async () => {
      throw authRequired();
    }),
  });

describe("isAuthRequired", () => {
  it("recognises only the auth.required code", () => {
    expect(isAuthRequired(authRequired())).toBe(true);
    expect(isAuthRequired(new ApiError("x", 500))).toBe(false);
    expect(isAuthRequired(new TypeError("offline"))).toBe(false);
  });
});

describe("access required (wide layout)", () => {
  it("shows the dialog and 'Kein Zugang' instead of 'Backend nicht erreichbar'", async () => {
    const user = userEvent.setup();
    const { ready, store } = renderApp(lockedApi());
    await ready;
    expect(store.getState().backend).toEqual({ kind: "unauthorized" });
    const dialog = await screen.findByRole("dialog", { name: "Zugang erforderlich" });
    expect(dialog).toHaveTextContent("QR-Code");
    const statusbar = screen.getByRole("contentinfo");
    expect(within(statusbar).getByText("Kein Zugang")).toBeInTheDocument();
    expect(within(statusbar).queryByText("Backend nicht erreichbar")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog", { name: "Zugang erforderlich" })).toBeNull();
    // The app keeps running and keeps reporting the state.
    expect(within(statusbar).getByText("Kein Zugang")).toBeInTheDocument();
  });

  it("is translated into English", async () => {
    localStorage.setItem("mmy.locale", "en");
    const { ready } = renderApp(lockedApi());
    await ready;
    const dialog = await screen.findByRole("dialog", { name: "Access required" });
    expect(dialog).toHaveTextContent("pixi run serve-lan");
    expect(within(screen.getByRole("contentinfo")).getByText("No access")).toBeInTheDocument();
  });

  it("keeps the offline message for an unreachable backend", async () => {
    const { ready } = renderApp(
      mockApi({
        health: vi.fn(async () => {
          throw new TypeError("offline");
        }),
      }),
    );
    await ready;
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      within(screen.getByRole("contentinfo")).getByText("Backend nicht erreichbar"),
    ).toBeInTheDocument();
  });

  it("reacts when a later save is refused", async () => {
    const api = mockApi({
      putProject: vi.fn(async () => {
        throw authRequired();
      }),
    });
    const { ready, store } = renderApp(api);
    await ready;
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      store.getState().addSlide("a", 0);
      await store.getState().flushSave();
    });
    expect(api.putProject).toHaveBeenCalled();
    expect(store.getState().backend).toEqual({ kind: "unauthorized" });
    expect(await screen.findByRole("dialog", { name: "Zugang erforderlich" })).toBeInTheDocument();
  });
});

describe("access required (compact layout)", () => {
  it.each(["portrait", "landscape"] as const)(
    "shows the dialog as sheet and 'Kein Zugang' in the title bar (%s)",
    async (orientation) => {
      mockLayout("compact", { orientation });
      const { ready } = renderApp(lockedApi());
      await ready;
      expect(await screen.findByRole("dialog", { name: "Zugang erforderlich" })).toBeVisible();
      const titlebar = screen.getByRole("banner");
      expect(within(titlebar).getByText("Kein Zugang")).toBeInTheDocument();
    },
  );
});

describe("access required (medium layout)", () => {
  it("shows 'Kein Zugang' in the title bar", async () => {
    mockLayout("medium");
    const { ready } = renderApp(lockedApi());
    await ready;
    expect(await screen.findByRole("dialog", { name: "Zugang erforderlich" })).toBeVisible();
    expect(within(screen.getByRole("banner")).getByText("Kein Zugang")).toBeInTheDocument();
  });
});
