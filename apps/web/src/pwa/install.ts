/**
 * "Install as app" (add-mobile-delivery design.md D7).
 *
 * Chromium/Android fire `beforeinstallprompt`: the event is kept and its
 * `prompt()` opens the browser's install dialog. Without it (iOS Safari) the
 * entry opens our own instructions dialog ("Share → Add to Home Screen"). The
 * entry is absent outside a secure context and while the app already runs
 * installed (standalone).
 */
import { useSyncExternalStore } from "react";

/** Chromium's install event (not in the DOM typings). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallEnv {
  /** `window.isSecureContext`. */
  secure: boolean;
  /** `display-mode: standalone` or iOS `navigator.standalone`. */
  standalone: boolean;
}

export function currentInstallEnv(win: Window = window): InstallEnv {
  const standaloneMedia = win.matchMedia?.("(display-mode: standalone)").matches === true;
  const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { secure: win.isSecureContext === true, standalone: standaloneMedia || iosStandalone };
}

export function canOfferInstall(env: InstallEnv, installed: boolean): boolean {
  return env.secure && !env.standalone && !installed;
}

// --- State shared by menu, task pane, taskbar and the dialog -------------------

interface InstallSnapshot {
  prompt: BeforeInstallPromptEvent | null;
  /** `appinstalled` fired in this session. */
  installed: boolean;
  /** Our instructions dialog is open. */
  instructionsOpen: boolean;
}

let snapshot: InstallSnapshot = { prompt: null, installed: false, instructionsOpen: false };
const listeners = new Set<() => void>();

function update(patch: Partial<InstallSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export const installState = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: (): InstallSnapshot => snapshot,
  closeInstructions: () => update({ instructionsOpen: false }),
  /** Test hook: back to the start state. */
  reset: () => update({ prompt: null, installed: false, instructionsOpen: false }),
};

/** Keeps `beforeinstallprompt` for later and notices a finished install. */
export function listenForInstall(win: Window = window): () => void {
  const onPrompt = (event: Event) => {
    // Suppress the browser's own mini-infobar; our entry offers the dialog.
    event.preventDefault();
    update({ prompt: event as BeforeInstallPromptEvent });
  };
  const onInstalled = () => update({ prompt: null, installed: true });
  win.addEventListener("beforeinstallprompt", onPrompt);
  win.addEventListener("appinstalled", onInstalled);
  return () => {
    win.removeEventListener("beforeinstallprompt", onPrompt);
    win.removeEventListener("appinstalled", onInstalled);
  };
}

/** Opens the browser's install dialog, or our instructions without one. */
export async function install(): Promise<"prompted" | "instructions"> {
  const event = snapshot.prompt;
  if (!event) {
    update({ instructionsOpen: true });
    return "instructions";
  }
  // A prompt can be used only once.
  update({ prompt: null });
  await event.prompt();
  const choice = await event.userChoice;
  if (choice.outcome === "accepted") update({ installed: true });
  return "prompted";
}

/**
 * The install action while the entry is available, otherwise undefined
 * (menu and task entries are then absent). `env` is injectable for tests.
 */
export function useInstallAction(env?: InstallEnv): (() => void) | undefined {
  const state = useSyncExternalStore(installState.subscribe, installState.get);
  const resolved = env ?? currentInstallEnv();
  return canOfferInstall(resolved, state.installed) ? () => void install() : undefined;
}

export function useInstallInstructionsOpen(): boolean {
  return useSyncExternalStore(installState.subscribe, () => installState.get().instructionsOpen);
}
