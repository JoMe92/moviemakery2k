import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportApi } from "../lib/apiClient";
import { exportJob } from "../store/testApi";
import { SaveMovieWizard } from "./SaveMovieWizard";
import { canShareFiles, loadShareFile, SHARE_LIMIT_BYTES, type ShareEnv } from "./share";
import { POLL_INTERVAL_MS } from "./useExportRun";

// add-mobile-delivery design.md D8, spec movie-export "Film am Handy teilen".

const MB = 1024 * 1024;

interface FakeOptions {
  secure?: boolean;
  canShare?: boolean | "throws" | "missing";
  /** Content-Length header; null sends none. */
  contentLength?: number | null;
  /** Size the loaded blob reports. */
  blobSize?: number;
  ok?: boolean;
  share?: () => Promise<void>;
}

function fakeEnv(options: FakeOptions = {}) {
  const {
    secure = true,
    canShare = true,
    contentLength = 40 * MB,
    blobSize,
    ok = true,
    share = async () => {},
  } = options;
  const shareFn = vi.fn(async (_data: ShareData) => share());
  const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => {
    const headers = new Headers();
    if (contentLength !== null) headers.set("content-length", String(contentLength));
    const blob = new Blob(["mp4"], { type: "video/mp4" });
    if (blobSize !== undefined) Object.defineProperty(blob, "size", { value: blobSize });
    return { ok, headers, blob: async () => blob } as unknown as Response;
  });
  const env: ShareEnv = {
    secure,
    share: shareFn,
    canShare:
      canShare === "missing"
        ? undefined
        : () => {
            if (canShare === "throws") throw new TypeError("no files");
            return canShare;
          },
    fetch: fetchFn,
  };
  return { env, shareFn, fetchFn };
}

function exportApi(): ExportApi {
  return {
    startExport: vi.fn(async ({ profile, fileName }) => exportJob({ profile, fileName })),
    getExport: vi.fn(async (id: string) => exportJob({ id, status: "done", progress: 1 })),
    cancelExport: vi.fn(async () => undefined),
    exportFileUrl: vi.fn((id: string) => `/api/exports/${id}/file`),
  };
}

const tick = (ms = POLL_INTERVAL_MS) => act(() => vi.advanceTimersByTimeAsync(ms));
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

/** Runs the wizard to the step "Fertig" with `env` for sharing. */
async function toDone(env: ShareEnv, next = "Weiter") {
  const download = vi.fn();
  render(
    <SaveMovieWizard
      open
      onClose={() => {}}
      api={exportApi()}
      duration={10}
      prepare={async () => {}}
      download={download}
      share={env}
    />,
  );
  click(next);
  click(next);
  await tick(0);
  await tick();
  return { download };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("“Share…” in the step “Fertig”", () => {
  it("preloads the file, then opens the share dialog with “Mein Film.mp4”", async () => {
    const { env, shareFn, fetchFn } = fakeEnv();
    let finishLoading: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      finishLoading = resolve;
    });
    const realFetch = fetchFn.getMockImplementation();
    fetchFn.mockImplementation(async (url, init) => {
      await gate;
      return (realFetch as NonNullable<typeof realFetch>)(url, init);
    });
    const { download } = await toDone(env);

    expect(screen.getByRole("heading", { name: "Fertig" })).toBeInTheDocument();
    const shareButton = screen.getByRole("button", { name: "Teilen…" });
    expect(shareButton).toBeDisabled();
    expect(screen.getByText("Wird vorbereitet…")).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledWith("/api/exports/job1/file", expect.anything());

    finishLoading();
    await tick(0);
    expect(shareButton).toBeEnabled();
    expect(screen.queryByText("Wird vorbereitet…")).toBeNull();

    fireEvent.click(shareButton);
    expect(shareFn).toHaveBeenCalledTimes(1);
    const data = shareFn.mock.calls[0]?.[0];
    const file = data?.files?.[0];
    expect(file?.name).toBe("Mein Film.mp4");
    expect(file?.type).toBe("video/mp4");
    expect(data?.title).toBe("Mein Film.mp4");
    await tick(0);
    expect(screen.queryByRole("alert")).toBeNull();

    // "Herunterladen" stays unchanged.
    click("Film herunterladen");
    expect(download).toHaveBeenCalledWith("/api/exports/job1/file", "Mein Film.mp4");
  });

  it("is labelled in English", async () => {
    localStorage.setItem("mmy.locale", "en");
    const { env } = fakeEnv();
    await toDone(env, "Next");
    expect(screen.getByRole("button", { name: "Share…" })).toBeInTheDocument();
  });

  it.each<[string, FakeOptions]>([
    ["insecure context (HTTP in the LAN)", { secure: false }],
    ["no canShare", { canShare: "missing" }],
    ["files not shareable", { canShare: false }],
    ["canShare throws", { canShare: "throws" }],
  ])("shows only “Herunterladen”: %s", async (_name, options) => {
    const { env, fetchFn } = fakeEnv(options);
    await toDone(env);
    await tick(0);
    expect(screen.getByRole("button", { name: "Film herunterladen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Teilen…" })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each<[string, FakeOptions]>([
    ["by Content-Length", { contentLength: SHARE_LIMIT_BYTES + 1 }],
    ["by the loaded size", { contentLength: null, blobSize: SHARE_LIMIT_BYTES + 1 }],
    ["when loading fails", { ok: false }],
  ])("hides “Teilen…” for a file over 200 MB or not loadable (%s)", async (_name, options) => {
    const { env } = fakeEnv(options);
    await toDone(env);
    await tick(0);
    expect(screen.queryByRole("button", { name: "Teilen…" })).toBeNull();
    expect(screen.getByRole("button", { name: "Film herunterladen" })).toBeEnabled();
  });

  it("keeps exactly 200 MB shareable", async () => {
    const { env } = fakeEnv({ contentLength: SHARE_LIMIT_BYTES, blobSize: SHARE_LIMIT_BYTES });
    await toDone(env);
    await tick(0);
    expect(screen.getByRole("button", { name: "Teilen…" })).toBeEnabled();
  });

  it("treats a cancelled share dialog (AbortError) as no error", async () => {
    const { env, shareFn } = fakeEnv({
      share: async () => {
        throw new DOMException("cancelled", "AbortError");
      },
    });
    await toDone(env);
    await tick(0);
    click("Teilen…");
    await tick(0);
    expect(shareFn).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports other share errors and keeps “Herunterladen”", async () => {
    const { env } = fakeEnv({
      share: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    });
    await toDone(env);
    await tick(0);
    click("Teilen…");
    await tick(0);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Das Teilen ist fehlgeschlagen. Sie können den Film weiterhin herunterladen.",
    );
    expect(screen.getByRole("button", { name: "Film herunterladen" })).toBeEnabled();
  });
});

describe("loadShareFile", () => {
  it("aborts the request when the step is left", async () => {
    vi.useRealTimers();
    const { env, fetchFn } = fakeEnv();
    let seen: AbortSignal | undefined;
    fetchFn.mockImplementation(async (_url, init) => {
      seen = init?.signal ?? undefined;
      throw new DOMException("aborted", "AbortError");
    });
    const controller = new AbortController();
    const result = loadShareFile(env, "/x", "a.mp4", controller.signal);
    controller.abort();
    expect(await result).toBeNull();
    expect(seen?.aborted).toBe(true);
  });

  it("needs a secure context and file sharing", () => {
    expect(canShareFiles(fakeEnv().env)).toBe(true);
    expect(canShareFiles({ ...fakeEnv().env, share: undefined })).toBe(false);
  });
});
