/**
 * "Share…" in the step "Finished" (add-mobile-delivery design.md D8).
 *
 * The Web Share API needs a user gesture, and loading a large file takes
 * longer than that gesture stays valid. So the wizard preloads the MP4 as a
 * blob when the step is reached and calls `navigator.share` directly in the
 * tap. Shown only in a secure context, when the device can share files and
 * the file is at most 200 MB; "Download" always stays.
 */
import { useEffect, useState } from "react";

export const SHARE_LIMIT_BYTES = 200 * 1024 * 1024;
export const MP4_TYPE = "video/mp4";

/** What sharing needs from the browser; injectable for tests. */
export interface ShareEnv {
  secure: boolean;
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

export function currentShareEnv(): ShareEnv {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    secure: typeof window !== "undefined" && window.isSecureContext === true,
    share: typeof nav?.share === "function" ? (data) => nav.share(data) : undefined,
    canShare: typeof nav?.canShare === "function" ? (data) => nav.canShare(data) : undefined,
    fetch: (url, init) => fetch(url, init),
  };
}

/** Secure context and file sharing supported (probed with an empty MP4). */
export function canShareFiles(env: ShareEnv): boolean {
  if (!env.secure || !env.share || !env.canShare) return false;
  try {
    return env.canShare({ files: [new File([], "probe.mp4", { type: MP4_TYPE })] });
  } catch {
    return false;
  }
}

export type ShareState =
  /** No button: insecure, unsupported, too large or the file could not be loaded. */
  | { kind: "hidden" }
  /** Button shown but disabled while the file loads. */
  | { kind: "preparing" }
  | { kind: "ready"; file: File };

/** Loads the file at `url` for sharing; `null` means "not shareable". */
export async function loadShareFile(
  env: ShareEnv,
  url: string,
  fileName: string,
  signal?: AbortSignal,
): Promise<File | null> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort);
  try {
    const response = await env.fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > SHARE_LIMIT_BYTES) {
      // Known to be too large: do not load it into memory.
      controller.abort();
      return null;
    }
    const blob = await response.blob();
    if (blob.size > SHARE_LIMIT_BYTES) return null;
    const file = new File([blob], fileName, { type: MP4_TYPE });
    return env.canShare?.({ files: [file] }) ? file : null;
  } catch {
    return null;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

/** Preloads the file while `url` is set; aborts when the step is left. */
export function useShareFile(env: ShareEnv, url: string | null, fileName: string): ShareState {
  const supported = url !== null && canShareFiles(env);
  const [state, setState] = useState<ShareState>(
    supported ? { kind: "preparing" } : { kind: "hidden" },
  );
  useEffect(() => {
    if (!supported || url === null) {
      setState({ kind: "hidden" });
      return;
    }
    const controller = new AbortController();
    setState({ kind: "preparing" });
    void loadShareFile(env, url, fileName, controller.signal).then((file) => {
      if (controller.signal.aborted) return;
      setState(file ? { kind: "ready", file } : { kind: "hidden" });
    });
    return () => controller.abort();
  }, [env, supported, url, fileName]);
  return state;
}

export type ShareOutcome = "shared" | "cancelled" | "failed";

/** Opens the device's share dialog; call it directly in the click handler. */
export async function shareFile(env: ShareEnv, file: File, title: string): Promise<ShareOutcome> {
  try {
    await env.share?.({ files: [file], title });
    return "shared";
  } catch (error) {
    // Closing the share dialog is no error.
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    return "failed";
  }
}
