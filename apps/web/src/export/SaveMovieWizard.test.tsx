import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ExportApi, type ExportJob } from "../lib/apiClient";
import { createAppStore } from "../store/appStore";
import { exportJob, mockApi } from "../store/testApi";
import { AppStoreContext } from "../store/useAppStore";
import { SaveMovieWizard, SaveMovieWizardFromStore } from "./SaveMovieWizard";
import { POLL_INTERVAL_MS } from "./useExportRun";

const WIZARD_TITLE = "Film speichern";
const CANCEL_TITLE = "Export abbrechen";
const CANCEL_QUESTION = "Export wirklich abbrechen?";
const ERROR_TITLE = "Fehler beim Speichern des Films";
const OFFLINE_MESSAGE = "Das Backend ist nicht erreichbar. Bitte versuchen Sie es erneut.";

const GL_ERROR =
  "Der Export ist auf diesem System nicht verfügbar: Es konnte kein OpenGL-Kontext erzeugt werden.";

function exportApi(overrides: Partial<ExportApi> = {}) {
  const api = {
    startExport: vi.fn(
      async ({ profile, fileName }: { profile: "high" | "small"; fileName: string }) =>
        exportJob({ profile, fileName }),
    ),
    getExport: vi.fn(async (id: string) => exportJob({ id, status: "running", progress: 0.1 })),
    cancelExport: vi.fn(async () => undefined),
    exportFileUrl: vi.fn((id: string) => `/api/exports/${id}/file`),
  };
  // Overrides in the tests are vi.fn() mocks as well.
  return { ...api, ...overrides } as typeof api;
}

const job = (overrides: Partial<ExportJob>) => exportJob({ status: "running", ...overrides });

function setup(api = exportApi(), duration = 45) {
  const onClose = vi.fn();
  const download = vi.fn();
  const prepare = vi.fn(async () => undefined);
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <SaveMovieWizard
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        api={api}
        duration={duration}
        prepare={prepare}
        download={download}
      />
    );
  }
  const view = render(<Harness />);
  return { ...view, api, onClose, download, prepare };
}

/** Advance the clock and settle pending requests. */
const tick = (ms = POLL_INTERVAL_MS) => act(() => vi.advanceTimersByTimeAsync(ms));

const wizard = () => screen.getByRole("dialog", { name: WIZARD_TITLE });
const button = (name: string) => screen.getByRole("button", { name });
const nameInput = () => screen.getByRole("textbox", { name: "Dateiname:" });
const progressbar = () => screen.getByRole("progressbar", { name: "Exportfortschritt" });

/*
 * With Vitest fake timers userEvent hangs (RTL waits internally on setTimeout 0),
 * hence fireEvent here; a test with real timers covers keyboard operation.
 */
const click = (name: string) => fireEvent.click(button(name));
const pressEscape = () => fireEvent.keyDown(document.activeElement ?? wizard(), { key: "Escape" });
const typeName = (value: string) => fireEvent.change(nameInput(), { target: { value } });

async function toProgress() {
  click("Weiter");
  click("Weiter");
  await tick(0);
}

async function toProgressIn(locale: string) {
  const next = locale === "en" ? "Next" : "Weiter";
  click(next);
  click(next);
  await tick(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("“Save Movie” wizard", () => {
  it("saves with default values and offers “Mein Film.mp4” for download", async () => {
    const api = exportApi();
    api.getExport
      .mockResolvedValueOnce(job({ progress: 0.25 }))
      .mockResolvedValueOnce(job({ progress: 0.5 }))
      .mockResolvedValueOnce(job({ status: "done", progress: 1 }));
    const { download, prepare, onClose } = setup(api);

    expect(wizard()).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Dateiname" })).toBeInTheDocument();
    expect(nameInput()).toHaveValue("Mein Film");
    expect(nameInput()).toHaveFocus();
    expect(screen.getByText("Wird als „Mein Film.mp4“ gespeichert.")).toBeInTheDocument();
    expect(button("Zurück")).toBeDisabled();

    click("Weiter");
    expect(screen.getByRole("heading", { name: "Qualität" })).toBeInTheDocument();
    const high = screen.getByRole("radio", { name: /Hohe Qualität \(960×720\)/ });
    expect(high).toBeChecked();
    expect(high).toHaveFocus();
    expect(high.closest("label")).toHaveTextContent("Geschätzte Größe: ca. 3,4 MB");
    expect(
      screen.getByRole("radio", { name: /Kleine Datei \(640×480\)/ }).closest("label"),
    ).toHaveTextContent("Geschätzte Größe: ca. 1,8 MB");
    expect(api.startExport).not.toHaveBeenCalled();

    click("Weiter");
    await tick(0);
    expect(prepare).toHaveBeenCalledOnce();
    expect(api.startExport).toHaveBeenCalledWith({ profile: "high", fileName: "Mein Film" });
    expect(screen.getByRole("heading", { name: "Film wird gespeichert" })).toBeInTheDocument();
    expect(progressbar()).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("Verbleibende Zeit: wird berechnet…")).toBeInTheDocument();
    expect(button("Abbrechen")).toHaveFocus();
    expect(button("Weiter")).toBeDisabled();

    await tick();
    expect(progressbar()).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("25 % abgeschlossen")).toBeInTheDocument();
    // 0.5 s run time: still too little data for an estimate.
    expect(screen.getByText("Verbleibende Zeit: wird berechnet…")).toBeInTheDocument();

    await tick();
    expect(progressbar()).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("Verbleibende Zeit: ca. 1 Sek.")).toBeInTheDocument();

    await tick();
    expect(screen.getByRole("heading", { name: "Fertig" })).toBeInTheDocument();
    expect(screen.getByText("Der Film „Mein Film.mp4“ wurde gespeichert.")).toBeInTheDocument();
    const downloadButton = button("Film herunterladen");
    expect(downloadButton).toHaveFocus();

    // After "done", polling stops.
    await tick(POLL_INTERVAL_MS * 4);
    expect(api.getExport).toHaveBeenCalledTimes(3);

    fireEvent.click(downloadButton);
    expect(download).toHaveBeenCalledWith("/api/exports/job1/file", "Mein Film.mp4");

    click("Fertig stellen");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.cancelExport).not.toHaveBeenCalled();
  });

  it("disables “Next” for invalid characters and names them", async () => {
    const { api } = setup();

    typeName("Urlaub/2003");
    expect(button("Weiter")).toBeDisabled();
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Der Dateiname enthält unerlaubte Zeichen: /",
    );
    fireEvent.keyDown(nameInput(), { key: "Enter" });
    expect(screen.getByRole("heading", { name: "Dateiname" })).toBeInTheDocument();

    typeName("");
    expect(button("Weiter")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Bitte geben Sie einen Dateinamen ein.");

    typeName("Urlaub 2003");
    expect(button("Weiter")).toBeEnabled();
    expect(screen.getByText("Wird als „Urlaub 2003.mp4“ gespeichert.")).toBeInTheDocument();
    expect(api.startExport).not.toHaveBeenCalled();
  });

  it("closes on cancel before the start without exporting", async () => {
    const { api, onClose } = setup();
    click("Weiter");
    click("Zurück");
    expect(nameInput()).toHaveFocus();
    click("Weiter");

    click("Abbrechen");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.startExport).not.toHaveBeenCalled();
    expect(api.cancelExport).not.toHaveBeenCalled();
  });

  it("closes with Escape before the start", async () => {
    const { api, onClose } = setup();
    pressEscape();
    expect(onClose).toHaveBeenCalledOnce();
    expect(api.startExport).not.toHaveBeenCalled();
  });

  it("cancels a running export after confirmation", async () => {
    const { api, onClose } = setup();
    await toProgress();
    await tick();
    expect(progressbar()).toHaveAttribute("aria-valuenow", "10");

    click("Abbrechen");
    const confirm = screen.getByRole("dialog", { name: CANCEL_TITLE });
    expect(confirm).toHaveTextContent(CANCEL_QUESTION);
    click("Nein");
    expect(screen.queryByRole("dialog", { name: CANCEL_TITLE })).toBeNull();
    expect(api.cancelExport).not.toHaveBeenCalled();
    await tick();
    expect(api.getExport).toHaveBeenCalledTimes(2);

    click("Abbrechen");
    click("Ja");
    await tick(0);
    expect(api.cancelExport).toHaveBeenCalledWith("job1");
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();

    await tick(POLL_INTERVAL_MS * 4);
    expect(api.getExport).toHaveBeenCalledTimes(2);
  });

  it("also asks for confirmation on Escape during the export", async () => {
    const { onClose } = setup();
    await toProgress();
    pressEscape();
    expect(screen.getByRole("dialog", { name: CANCEL_TITLE })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("discards an export that was cancelled while starting", async () => {
    let resolveStart: (job: ExportJob) => void = () => undefined;
    const api = exportApi({
      startExport: vi.fn(
        () =>
          new Promise<ExportJob>((resolve) => {
            resolveStart = resolve;
          }),
      ),
    });
    const { onClose } = setup(api);
    await toProgress();
    click("Abbrechen");
    click("Ja");
    await tick(0);
    expect(onClose).toHaveBeenCalledOnce();
    expect(api.cancelExport).not.toHaveBeenCalled();

    await act(async () => resolveStart(exportJob({ id: "late" })));
    expect(api.cancelExport).toHaveBeenCalledWith("late");
    await tick(POLL_INTERVAL_MS * 4);
    expect(api.getExport).not.toHaveBeenCalled();
  });

  it("shows a failure in the error dialog and retries", async () => {
    const api = exportApi();
    api.getExport
      .mockResolvedValueOnce(job({ status: "failed", message: GL_ERROR }))
      .mockResolvedValueOnce(job({ status: "done", progress: 1 }));
    setup(api);
    await toProgress();
    await tick();

    const error = screen.getByRole("dialog", { name: ERROR_TITLE });
    expect(error).toHaveTextContent(GL_ERROR);
    expect(button("Erneut versuchen")).toHaveFocus();

    click("Erneut versuchen");
    await tick(0);
    expect(screen.queryByRole("dialog", { name: ERROR_TITLE })).toBeNull();
    expect(api.startExport).toHaveBeenCalledTimes(2);
    expect(api.startExport).toHaveBeenLastCalledWith({ profile: "high", fileName: "Mein Film" });

    await tick();
    expect(button("Film herunterladen")).toBeInTheDocument();
  });

  it("returns to the quality step after “Close” in the error dialog", async () => {
    const api = exportApi({
      getExport: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    setup(api);
    await toProgress();
    await tick();
    const errorDialog = screen.getByRole("dialog", { name: ERROR_TITLE });
    expect(errorDialog).toHaveTextContent(OFFLINE_MESSAGE);

    // Every button name in the dialog is unique (spec app-shell): the title bar
    // button is "Dialog schließen", only the footer button is "Schließen".
    const names = within(errorDialog)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim());
    expect(names).toEqual(["Dialog schließen", "Erneut versuchen", "Schließen"]);
    expect(new Set(names).size).toBe(names.length);
    expect(
      within(errorDialog).getByRole("button", { name: "Dialog schließen" }),
    ).toBeInTheDocument();
    fireEvent.click(within(errorDialog).getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog", { name: ERROR_TITLE })).toBeNull();
    expect(screen.getByRole("heading", { name: "Qualität" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Hohe Qualität/ })).toHaveFocus();
    await tick(POLL_INTERVAL_MS * 4);
    expect(api.getExport).toHaveBeenCalledOnce();
  });

  it("reports an export already running (409) and an empty project (422)", async () => {
    const busy = "Es läuft bereits ein Export. Bitte warten oder ihn zuerst abbrechen.";
    const empty = "Export nicht möglich: Der Bildstreifen ist leer.";
    const api = exportApi({
      startExport: vi
        .fn()
        .mockRejectedValueOnce(new ApiError(busy, 409))
        .mockRejectedValueOnce(new ApiError(empty, 422)),
    });
    setup(api);
    await toProgress();
    expect(screen.getByRole("dialog", { name: ERROR_TITLE })).toHaveTextContent(busy);
    expect(api.getExport).not.toHaveBeenCalled();

    click("Erneut versuchen");
    await tick(0);
    expect(screen.getByRole("dialog", { name: ERROR_TITLE })).toHaveTextContent(empty);
  });

  it("stops polling on unmount", async () => {
    const { api, unmount } = setup();
    await toProgress();
    await tick();
    expect(api.getExport).toHaveBeenCalledOnce();
    unmount();
    await tick(POLL_INTERVAL_MS * 4);
    expect(api.getExport).toHaveBeenCalledOnce();
  });
});

describe("wizard in English and error codes", () => {
  const apiError = (code: string, params: Record<string, string | number>, message: string) =>
    new ApiError(message, 422, { code, params, message });

  it("shows all steps in English with an English size estimate", async () => {
    localStorage.setItem("mmy.locale", "en");
    const api = exportApi();
    api.getExport.mockResolvedValueOnce(job({ status: "done", progress: 1, fileName: "My Movie" }));
    setup(api);

    expect(screen.getByRole("dialog", { name: "Save Movie" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "File Name" })).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "File name:" })).toHaveValue("My Movie");
    expect(screen.getByText("Will be saved as “My Movie.mp4”.")).toBeInTheDocument();
    expect(button("Back")).toBeDisabled();

    click("Next");
    expect(screen.getByRole("heading", { name: "Quality" })).toBeInTheDocument();
    const high = screen.getByRole("radio", { name: /High quality \(960×720\)/ });
    expect(high.closest("label")).toHaveTextContent("Estimated size: approx. 3.4 MB");
    expect(
      screen.getByRole("radio", { name: /Small file \(640×480\)/ }).closest("label"),
    ).toHaveTextContent("Estimated size: approx. 1.8 MB");

    click("Next");
    await tick(0);
    expect(screen.getByRole("heading", { name: "Saving Movie" })).toBeInTheDocument();
    expect(screen.getByText("Time remaining: calculating…")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Export progress" })).toBeInTheDocument();
    await tick();
    expect(screen.getByRole("heading", { name: "Finished" })).toBeInTheDocument();
    expect(screen.getByText("The movie “My Movie.mp4” has been saved.")).toBeInTheDocument();
    expect(button("Download Movie")).toBeInTheDocument();
    expect(button("Finish")).toBeEnabled();
  });

  it("names invalid file names in English", () => {
    localStorage.setItem("mmy.locale", "en");
    setup();
    fireEvent.change(screen.getByRole("textbox", { name: "File name:" }), {
      target: { value: "a:b" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The file name contains characters that are not allowed: :",
    );
    expect(button("Next")).toBeDisabled();
  });

  it.each([
    ["de", "Fehler beim Speichern des Films", "Export nicht möglich: Der Bildstreifen ist leer."],
    ["en", "Error Saving the Movie", "Cannot export: the storyboard is empty."],
  ])("translates the known code export.emptyProject (%s)", async (locale, title, text) => {
    localStorage.setItem("mmy.locale", locale);
    const api = exportApi({
      startExport: vi
        .fn()
        .mockRejectedValue(
          apiError("export.emptyProject", {}, "Cannot export: the storyboard is empty."),
        ),
    });
    setup(api);
    await toProgressIn(locale);
    expect(screen.getByRole("dialog", { name: title })).toHaveTextContent(text);
  });

  it("shows the backend's English message for an unknown code", async () => {
    const api = exportApi({
      startExport: vi
        .fn()
        .mockRejectedValue(apiError("export.somethingNew", { x: 1 }, "Something new went wrong.")),
    });
    setup(api);
    await toProgress();
    expect(screen.getByRole("dialog", { name: ERROR_TITLE })).toHaveTextContent(
      "Something new went wrong.",
    );
  });

  it("translates FastAPI's 422 list with our code in `type`", async () => {
    const message = "The file name is too long (at most 120 characters).";
    const api = exportApi({
      startExport: vi.fn().mockRejectedValue(
        new ApiError(message, 422, {
          code: null,
          params: {},
          message,
          issues: [{ code: "export.fileName.tooLong", params: { max: 120 }, message }],
        }),
      ),
    });
    setup(api);
    await toProgress();
    expect(screen.getByRole("dialog", { name: ERROR_TITLE })).toHaveTextContent(
      "Der Dateiname ist zu lang (höchstens 120 Zeichen).",
    );
  });

  it("translates the job error export.glUnavailable via errorCode", async () => {
    const api = exportApi();
    api.getExport.mockResolvedValueOnce(
      job({
        status: "failed",
        message: "Export is not available on this system: no OpenGL context …",
        errorCode: "export.glUnavailable",
        errorParams: { reason: "EGL: no display" },
      }),
    );
    setup(api);
    await toProgress();
    await tick();
    const dialog = screen.getByRole("dialog", { name: ERROR_TITLE });
    expect(dialog).toHaveTextContent(
      "Der Export ist auf diesem System nicht verfügbar: Es konnte kein OpenGL-Kontext zum Rendern erzeugt werden.",
    );
    expect(dialog).not.toHaveTextContent("EGL");
  });
});

describe("keyboard operation (real timers)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("can be operated entirely by keyboard", async () => {
    const api = exportApi();
    api.getExport.mockResolvedValue(job({ status: "done", progress: 1, profile: "small" }));
    const { download, onClose } = setup(api);
    const user = userEvent.setup();

    await user.clear(nameInput());
    await user.keyboard("Urlaub{Enter}");
    const high = screen.getByRole("radio", { name: /Hohe Qualität/ });
    expect(high).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /Kleine Datei/ })).toBeChecked();
    // Tab: Back → Next (the dialog's focus trap keeps focus in the wizard).
    await user.tab();
    await user.tab();
    expect(button("Weiter")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(api.startExport).toHaveBeenCalledWith({ profile: "small", fileName: "Urlaub" });
    await waitFor(() => expect(button("Film herunterladen")).toHaveFocus());
    await user.keyboard("{Enter}");
    expect(download).toHaveBeenCalledWith("/api/exports/job1/file", "Mein Film.mp4");
    await user.tab();
    expect(button("Fertig stellen")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("wizard via the app store", () => {
  it("opens only with pictures and estimates the size from the total duration", async () => {
    const store = createAppStore(
      mockApi({
        getProject: vi.fn(async () => ({
          schemaVersion: 2 as const,
          music: [],
          slides: [
            { id: "s1", mediaId: "a", duration: 30, transitionIn: null },
            { id: "s2", mediaId: "b", duration: 15, transitionIn: null },
          ],
        })),
      }),
    );
    render(
      <AppStoreContext.Provider value={store}>
        <SaveMovieWizardFromStore />
      </AppStoreContext.Provider>,
    );
    act(() => store.getState().openExportWizard());
    expect(store.getState().exportWizardOpen).toBe(false);

    await act(() => store.getState().init());
    act(() => store.getState().openExportWizard());
    expect(wizard()).toBeInTheDocument();

    click("Weiter");
    expect(screen.getByRole("radio", { name: /Hohe Qualität/ }).closest("label")).toHaveTextContent(
      "ca. 3,4 MB",
    );
    click("Abbrechen");
    expect(store.getState().exportWizardOpen).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
