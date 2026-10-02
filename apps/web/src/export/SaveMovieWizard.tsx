/**
 * Assistent „Film speichern“ (design.md D6, Spec movie-export): modaler
 * Y2K-Dialog mit den Schritten Dateiname → Qualität → Film wird gespeichert →
 * Fertig, Schaltflächen „Zurück“/„Weiter“/„Abbrechen“ wie im Original und
 * einem Fehlerdialog mit „Erneut versuchen“.
 */
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { ExportApi, ExportProfile } from "../lib/apiClient";
import { timelineOf } from "../player/controls";
import { ConfirmDialog } from "../shell/AppDialogs";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import {
  checkFileName,
  DEFAULT_FILE_NAME,
  estimateBytes,
  estimateRemaining,
  FILE_EXTENSION,
  formatRemaining,
  formatSize,
  PROFILES,
  percent,
} from "./exportFormat";
import styles from "./SaveMovieWizard.module.css";
import { useExportRun } from "./useExportRun";

export const WIZARD_TITLE = "Film speichern";
export const CANCEL_TITLE = "Export abbrechen";
export const CANCEL_QUESTION = "Export wirklich abbrechen?";
export const ERROR_TITLE = "Fehler beim Speichern des Films";

/** Startet den Download der fertigen Datei (in Tests ersetzbar). */
export type DownloadFn = (url: string, fileName: string) => void;

export const downloadViaAnchor: DownloadFn = (url, fileName) => {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
};

export interface SaveMovieWizardProps {
  open: boolean;
  onClose: () => void;
  api: ExportApi;
  /** Gesamtdauer des Films in Sekunden (für die Größenschätzung). */
  duration: number;
  /** Vor dem Start ausführen (z. B. Autosave abschließen, damit der Schnappschuss stimmt). */
  prepare?: () => Promise<void>;
  download?: DownloadFn;
}

/** Der Assistent; sein Zustand beginnt bei jedem Öffnen neu. */
export function SaveMovieWizard({ open, ...rest }: SaveMovieWizardProps) {
  return open ? <Wizard {...rest} /> : null;
}

/** Mit dem App-Store verbunden: öffnet sich über `openExportWizard()`. */
export function SaveMovieWizardFromStore({ download }: { download?: DownloadFn }) {
  const open = useAppStore((s) => s.exportWizardOpen);
  const close = useAppStore((s) => s.closeExportWizard);
  const api = useAppStore((s) => s.exportApi);
  const flushSave = useAppStore((s) => s.flushSave);
  const duration = useAppStore((s) => timelineOf(s.slides).duration);
  return (
    <SaveMovieWizard
      open={open}
      onClose={close}
      api={api}
      duration={duration}
      prepare={flushSave}
      download={download}
    />
  );
}

type Step = "name" | "quality";
type View = Step | "progress" | "done";

const STEP_TITLES: Record<View, string> = {
  name: "Dateiname",
  quality: "Qualität",
  progress: "Film wird gespeichert",
  done: "Fertig",
};
const STEP_NUMBER: Record<View, number> = { name: 1, quality: 2, progress: 3, done: 4 };

function Wizard({
  onClose,
  api,
  duration,
  prepare,
  download = downloadViaAnchor,
}: Omit<SaveMovieWizardProps, "open">) {
  const [step, setStep] = useState<Step>("name");
  const [nameText, setNameText] = useState(DEFAULT_FILE_NAME);
  const [profile, setProfile] = useState<ExportProfile>("high");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { run, start, cancel, reset } = useExportRun(api, { prepare });

  const nameId = useId();
  const nameHintId = useId();
  const radioName = useId();
  const stepRef = useRef<HTMLElement>(null);

  const check = checkFileName(nameText);
  // Bei einem Fehler bleibt die Fortschrittsseite hinter dem Fehlerdialog stehen.
  const view: View = run.phase === "idle" ? step : run.phase === "done" ? "done" : "progress";
  const busy = run.phase === "starting" || run.phase === "running";

  // Beim Schrittwechsel das erste Bedienelement fokussieren (Tastaturbedienung).
  const lastView = useRef<View | null>(null);
  useEffect(() => {
    if (lastView.current !== null && lastView.current !== view) {
      stepRef.current?.closest("dialog")?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    lastView.current = view;
  }, [view]);

  const begin = () => {
    // Doppelklick auf „Weiter“ startet keinen zweiten Export.
    if (!check.ok || run.phase !== "idle") return;
    void start({ profile, fileName: check.name });
  };

  const next = () => {
    if (step === "name") {
      if (check.ok) setStep("quality");
    } else {
      begin();
    }
  };

  /** „Abbrechen“, Schließen-Knopf und Escape. */
  const requestClose = () => {
    if (busy) setConfirmCancel(true);
    else onClose();
  };

  const confirmAbort = async () => {
    setConfirmCancel(false);
    await cancel();
    onClose();
  };

  const closeError = () => {
    reset();
    setStep("quality");
  };

  const retry = () => {
    if (run.phase === "failed") void start(run.request);
  };

  let body: ReactNode;
  if (view === "name") {
    body = (
      <>
        <p>Geben Sie einen Namen für den Film ein.</p>
        <div className={styles.field}>
          <label htmlFor={nameId}>Dateiname:</label>
          <input
            id={nameId}
            data-autofocus
            className={styles.input}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={nameText}
            aria-invalid={check.ok ? undefined : true}
            aria-describedby={nameHintId}
            onChange={(event) => setNameText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                next();
              }
            }}
          />
        </div>
        {check.ok ? (
          <p id={nameHintId} className={styles.hint}>
            Wird als „{check.name}
            {FILE_EXTENSION}“ gespeichert.
          </p>
        ) : (
          <p id={nameHintId} className={styles.error} role="alert">
            {check.message}
          </p>
        )}
      </>
    );
  } else if (view === "quality") {
    body = (
      <fieldset className={styles.options}>
        <legend>Wählen Sie die Qualität des Films:</legend>
        {PROFILES.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              data-autofocus={option.value === profile ? true : undefined}
              type="radio"
              name={radioName}
              value={option.value}
              checked={profile === option.value}
              onChange={() => setProfile(option.value)}
            />
            <span className={styles.optionLabel}>{option.label}</span>
            <span className={styles.size}>
              Geschätzte Größe: {formatSize(estimateBytes(duration, option.value))}
            </span>
          </label>
        ))}
      </fieldset>
    );
  } else if (view === "progress") {
    const progress = run.phase === "running" ? run.job.progress : 0;
    const pct = percent(progress);
    const remaining =
      run.phase === "running" && run.job.status === "running"
        ? estimateRemaining(Date.now() - run.startedAt, progress)
        : null;
    body = (
      <>
        <p>
          „{run.phase !== "idle" ? run.request.fileName : nameText}
          {FILE_EXTENSION}“ wird gespeichert …
        </p>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label="Exportfortschritt"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct} %`}
        >
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        </div>
        <p className={styles.status} aria-live="polite">
          {pct} % abgeschlossen
        </p>
        <p className={styles.hint}>Verbleibende Zeit: {formatRemaining(remaining)}</p>
      </>
    );
  } else {
    const job = run.phase === "done" ? run.job : null;
    const fileName = `${job?.fileName ?? ""}${FILE_EXTENSION}`;
    body = (
      <>
        <p>Der Film „{fileName}“ wurde gespeichert.</p>
        <p>
          <Button
            data-autofocus
            onClick={() => job && download(api.exportFileUrl(job.id), fileName)}
          >
            Film herunterladen
          </Button>
        </p>
        <p className={styles.hint}>
          Klicken Sie auf „Fertig stellen“, um den Assistenten zu schließen.
        </p>
      </>
    );
  }

  const footer =
    view === "done" ? (
      <>
        <Button disabled>Zurück</Button>
        <Button onClick={onClose}>Fertig stellen</Button>
        <Button disabled>Abbrechen</Button>
      </>
    ) : (
      <>
        <Button disabled={view !== "quality"} onClick={() => setStep("name")}>
          Zurück
        </Button>
        <Button disabled={view === "progress" || !check.ok} onClick={next}>
          Weiter
        </Button>
        <Button data-autofocus={view === "progress" ? true : undefined} onClick={requestClose}>
          Abbrechen
        </Button>
      </>
    );

  return (
    <>
      <Dialog open title={WIZARD_TITLE} onClose={requestClose} footer={footer}>
        <section ref={stepRef} className={styles.step} aria-labelledby={`${nameId}-step`}>
          <h3 id={`${nameId}-step`} className={styles.stepTitle}>
            {STEP_TITLES[view]}
          </h3>
          <p className={styles.stepNumber}>Schritt {STEP_NUMBER[view]} von 4</p>
          {body}
        </section>
      </Dialog>
      <ConfirmDialog
        open={confirmCancel}
        title={CANCEL_TITLE}
        message={CANCEL_QUESTION}
        onConfirm={() => void confirmAbort()}
        onCancel={() => setConfirmCancel(false)}
      />
      <Dialog
        open={run.phase === "failed"}
        title={ERROR_TITLE}
        onClose={closeError}
        footer={
          <>
            <Button onClick={retry}>Erneut versuchen</Button>
            <Button onClick={closeError}>Schließen</Button>
          </>
        }
      >
        <p className={styles.errorMessage} role="alert">
          {run.phase === "failed" ? run.message : ""}
        </p>
      </Dialog>
    </>
  );
}
