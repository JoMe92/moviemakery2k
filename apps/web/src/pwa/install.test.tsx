import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";
import {
  type BeforeInstallPromptEvent,
  canOfferInstall,
  currentInstallEnv,
  install,
  installState,
  listenForInstall,
} from "./install";

// add-mobile-delivery design.md D7, spec installable-app "Als App installieren".

function setSecure(secure: boolean) {
  Object.defineProperty(window, "isSecureContext", { value: secure, configurable: true });
}

function setIosStandalone(standalone: boolean | undefined) {
  Object.defineProperty(window.navigator, "standalone", { value: standalone, configurable: true });
}

/** Fake Chromium install event. */
function promptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as BeforeInstallPromptEvent;
  const prompt = vi.fn(async () => {});
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  return { event, prompt };
}

let stopListening: () => void = () => {};
beforeEach(() => {
  setSecure(true);
  stopListening = listenForInstall(window);
});
afterEach(() => {
  stopListening();
  act(() => installState.reset());
  setSecure(false);
  setIosStandalone(undefined);
});

describe("availability", () => {
  it("needs a secure context and no standalone mode", () => {
    expect(canOfferInstall({ secure: true, standalone: false }, false)).toBe(true);
    expect(canOfferInstall({ secure: false, standalone: false }, false)).toBe(false);
    expect(canOfferInstall({ secure: true, standalone: true }, false)).toBe(false);
    expect(canOfferInstall({ secure: true, standalone: false }, true)).toBe(false);
  });

  it("reads the environment: secure context, display-mode and iOS standalone", () => {
    expect(currentInstallEnv()).toEqual({ secure: true, standalone: false });
    setIosStandalone(true);
    expect(currentInstallEnv().standalone).toBe(true);
    setIosStandalone(undefined);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({ matches: query === "(display-mode: standalone)" }),
    });
    expect(currentInstallEnv().standalone).toBe(true);
  });
});

describe("install()", () => {
  it("opens the browser dialog from the kept event (Android)", async () => {
    const { event, prompt } = promptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    await act(async () => {
      expect(await install()).toBe("prompted");
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(installState.get().installed).toBe(true);
    expect(installState.get().instructionsOpen).toBe(false);
  });

  it("keeps the entry after a dismissed browser dialog", async () => {
    const { event } = promptEvent("dismissed");
    act(() => {
      window.dispatchEvent(event);
    });
    await act(async () => {
      await install();
    });
    expect(installState.get().installed).toBe(false);
  });

  it("opens the instructions without an event (iOS)", async () => {
    await act(async () => {
      expect(await install()).toBe("instructions");
    });
    expect(installState.get().instructionsOpen).toBe(true);
  });

  it("hides the entry after appinstalled", () => {
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(installState.get().installed).toBe(true);
  });
});

describe("entries in the app (wide layout)", () => {
  it("offers Extras → 'Als App installieren…' and the task in '3. Film fertig stellen'", async () => {
    const user = userEvent.setup();
    const { ready } = renderApp();
    await ready;
    expect(screen.getByRole("button", { name: "Als App installieren…" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Extras" }));
    expect(screen.getByRole("menuitem", { name: "Als App installieren…" })).toBeInTheDocument();
  });

  it("shows the iOS instructions dialog in German and English", async () => {
    const user = userEvent.setup();
    const { ready, store } = renderApp();
    await ready;
    await user.click(screen.getByRole("button", { name: "Als App installieren…" }));
    const dialog = screen.getByRole("dialog", { name: "Als App installieren" });
    expect(dialog).toHaveTextContent("„Teilen“");
    expect(dialog).toHaveTextContent("„Zum Home-Bildschirm“");
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => store.getState().setLocale("en"));
    await user.click(screen.getByRole("button", { name: "Install as app…" }));
    const english = screen.getByRole("dialog", { name: "Install as app" });
    expect(english).toHaveTextContent("“Share”");
    expect(english).toHaveTextContent("“Add to Home Screen”");
  });

  it("opens the browser dialog on Android instead of the instructions", async () => {
    const user = userEvent.setup();
    const { ready } = renderApp();
    await ready;
    const { event, prompt } = promptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    await user.click(screen.getByRole("button", { name: "Als App installieren…" }));
    expect(prompt).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Installed: the entry disappears.
    expect(screen.queryByRole("button", { name: "Als App installieren…" })).toBeNull();
  });

  it("has no entry over HTTP in the LAN", async () => {
    setSecure(false);
    const user = userEvent.setup();
    const { ready } = renderApp();
    await ready;
    expect(screen.queryByRole("button", { name: "Als App installieren…" })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Extras" }));
    expect(screen.queryByRole("menuitem", { name: "Als App installieren…" })).toBeNull();
  });

  it("has no entry when running installed", async () => {
    setIosStandalone(true);
    const { ready } = renderApp();
    await ready;
    expect(screen.queryByRole("button", { name: "Als App installieren…" })).toBeNull();
  });
});

describe("entry in the taskbar sheet (compact layout)", () => {
  it("offers the entry under '3. Fertig stellen'", async () => {
    mockLayout("compact");
    const user = userEvent.setup();
    const { ready } = renderApp();
    await ready;
    const taskbar = screen.getByRole("navigation", { name: "Filmschritte" });
    await user.click(within(taskbar).getByRole("button", { name: "3. Fertig stellen" }));
    await user.click(await screen.findByRole("button", { name: "Als App installieren…" }));
    expect(screen.getByRole("dialog", { name: "Als App installieren" })).toBeInTheDocument();
  });
});
