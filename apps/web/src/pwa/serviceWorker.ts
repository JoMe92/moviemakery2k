/**
 * Registration of the app shell's service worker (add-mobile-delivery design.md D6).
 *
 * Only in the production build and only in a secure context (HTTPS or
 * localhost); the dev server and Vitest never register a worker. A new version
 * waits ("prompt") until the user chooses "Reload" in the update notice.
 */

/** Activates the waiting worker; with `true` the page reloads afterwards. */
export type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

export interface RegisterOptions {
  onNeedRefresh(): void;
  onRegisterError?(error: unknown): void;
}

export type Registrar = (options: RegisterOptions) => UpdateServiceWorker;

export interface ServiceWorkerEnv {
  /** Production build (`import.meta.env.PROD`). */
  prod: boolean;
  /** `window.isSecureContext`. */
  secure: boolean;
  /** The browser offers `navigator.serviceWorker`. */
  supported: boolean;
}

export function currentEnv(): ServiceWorkerEnv {
  return {
    prod: import.meta.env.PROD,
    secure: typeof window !== "undefined" && window.isSecureContext === true,
    supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
  };
}

export function shouldRegister(env: ServiceWorkerEnv): boolean {
  return env.prod && env.secure && env.supported;
}

// --- Update state: "New version available" ------------------------------------

type Listener = () => void;

let pending: UpdateServiceWorker | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export const updateState = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** A new version waits for activation. */
  needRefresh(): boolean {
    return pending !== null;
  },
  /** Activates the new version and reloads the page. */
  async reload(): Promise<void> {
    const update = pending;
    if (update) await update(true);
  },
  /** Test hook: marks a waiting version (or none). */
  set(update: UpdateServiceWorker | null): void {
    pending = update;
    emit();
  },
};

const loadRegistrar = async (): Promise<Registrar> =>
  (await import("virtual:pwa-register")).registerSW;

/**
 * Registers the worker when `shouldRegister(env)`; returns whether it did.
 * `load` is injectable for tests (the default imports vite-plugin-pwa's module).
 */
export async function registerServiceWorker(
  env: ServiceWorkerEnv = currentEnv(),
  load: () => Promise<Registrar> = loadRegistrar,
): Promise<boolean> {
  if (!shouldRegister(env)) return false;
  const register = await load();
  const update = register({
    onNeedRefresh: () => updateState.set(update),
    onRegisterError: (error) => console.warn("Service worker registration failed", error),
  });
  return true;
}
