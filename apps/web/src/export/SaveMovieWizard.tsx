/**
 * Assistent „Film speichern“ (design.md D6, Spec movie-export): modaler
 * Y2K-Dialog mit den Schritten Dateiname → Qualität → Film wird gespeichert →
 * Fertig, Schaltflächen „Zurück“/„Weiter“/„Abbrechen“ wie im Original und
 * einem Fehlerdialog mit „Erneut versuchen“.
 */
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { translateError } from "../i18n/errors";
import type { MessageKey } from "../i18n/types";
import { useT } from "../i18n/useT";
import type { ExportApi, ExportProfile } from "../lib/apiClient";
import { timelineOf } from "../player/controls";
import { ConfirmDialog } from "../shell/AppDialogs";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import {
  checkFileName,
  estimateBytes,
  estimateRemaining,
  FILE_EXTENSION,
  formatRemaining,
  formatSize,
  PROFILES,
  percent,
} from "./exportFormat";
import styles from "./SaveMovieWizard.module.css";
import { failureMessage, useExportRun } from "./useExportRun";

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

const STEP_TITLES: Record<View, MessageKey> = {
  name: "export.steps.name",
  quality: "export.steps.quality",
  progress: "export.steps.progress",
  done: "export.steps.done",
};
const STEP_NUMBER: Record<View, number> = { name: 1, quality: 2, progress: 3, done: 4 };

function Wizard({
  onClose,
  api,
  duration,
  prepare,
  download = downloadViaAnchor,
}: Omit<SaveMovieWizardProps, "open">) {
  const { t, locale } = useT();
  const [step, setStep] = useState<Step>("name");
  const [nameText, setNameText] = useState(() => t("export.defaultFileName"));
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
        <p>{t("export.namePrompt")}</p>
        <div className={styles.field}>
          <label htmlFor={nameId}>{t("export.nameLabel")}</label>
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
            {t("export.savedAs", { file: `${check.name}${FILE_EXTENSION}` })}
          </p>
        ) : (
          <p id={nameHintId} className={styles.error} role="alert">
            {translateError(check.error, locale)}
          </p>
        )}
      </>
    );
  } else if (view === "quality") {
    body = (
      <fieldset className={styles.options}>
        <legend>{t("export.qualityLegend")}</legend>
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
            <span className={styles.optionLabel}>{t(`export.profiles.${option.value}`)}</span>
            <span className={styles.size}>
              {t("export.estimatedSize", {
                size: formatSize(estimateBytes(duration, option.value), locale),
              })}
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
          {t("export.saving", {
            file: `${run.phase !== "idle" ? run.request.fileName : nameText}${FILE_EXTENSION}`,
          })}
        </p>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label={t("export.progressLabel")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={t("export.percent", { percent: pct })}
        >
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        </div>
        <p className={styles.status} aria-live="polite">
          {t("export.percentDone", { percent: pct })}
        </p>
        <p className={styles.hint}>
          {t("export.remaining", { time: formatRemaining(remaining, locale) })}
        </p>
      </>
    );
  } else {
    const job = run.phase === "done" ? run.job : null;
    const fileName = `${job?.fileName ?? ""}${FILE_EXTENSION}`;
    body = (
      <>
        <p>{t("export.saved", { file: fileName })}</p>
        <p>
          <Button
            data-autofocus
            onClick={() => job && download(api.exportFileUrl(job.id), fileName)}
          >
            {t("export.download")}
          </Button>
        </p>
        <p className={styles.hint}>{t("export.finishHint")}</p>
      </>
    );
  }

  const footer =
    view === "done" ? (
      <>
        <Button disabled>{t("export.back")}</Button>
        <Button onClick={onClose}>{t("export.finish")}</Button>
        <Button disabled>{t("common.cancel")}</Button>
      </>
    ) : (
      <>
        <Button disabled={view !== "quality"} onClick={() => setStep("name")}>
          {t("export.back")}
        </Button>
        <Button disabled={view === "progress" || !check.ok} onClick={next}>
          {t("export.next")}
        </Button>
        <Button data-autofocus={view === "progress" ? true : undefined} onClick={requestClose}>
          {t("common.cancel")}
        </Button>
      </>
    );

  return (
    <>
      <Dialog open title={t("export.title")} onClose={requestClose} footer={footer}>
        <section ref={stepRef} className={styles.step} aria-labelledby={`${nameId}-step`}>
          <h3 id={`${nameId}-step`} className={styles.stepTitle}>
            {t(STEP_TITLES[view])}
          </h3>
          <p className={styles.stepNumber}>
            {t("export.stepOf", { step: STEP_NUMBER[view], total: 4 })}
          </p>
          {body}
        </section>
      </Dialog>
      <ConfirmDialog
        open={confirmCancel}
        title={t("export.cancelTitle")}
        message={t("export.cancelQuestion")}
        onConfirm={() => void confirmAbort()}
        onCancel={() => setConfirmCancel(false)}
      />
      <Dialog
        open={run.phase === "failed"}
        title={t("export.errorTitle")}
        onClose={closeError}
        footer={
          <>
            <Button onClick={retry}>{t("export.retry")}</Button>
            <Button onClick={closeError}>{t("common.close")}</Button>
          </>
        }
      >
        <p className={styles.errorMessage} role="alert">
          {run.phase === "failed" ? failureMessage(run.failure, locale) : ""}
        </p>
      </Dialog>
    </>
  );
}
