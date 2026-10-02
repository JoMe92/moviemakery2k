/**
 * Flow of an export for the wizard (design.md D5/D6): start, poll the status
 * every 500 ms, cancel. Polling ends on `done`, `failed`, cancel, reset and
 * when the component unmounts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { describeError, jobFailureInfo, translateError } from "../i18n/errors";
import type { Locale } from "../i18n/locale";
import { translate } from "../i18n/t";
import type { ExportApi, ExportJob, ExportProfile } from "../lib/apiClient";

export const POLL_INTERVAL_MS = 500;

export interface ExportRequest {
  profile: ExportProfile;
  fileName: string;
}

export type ExportRun =
  | { phase: "idle" }
  | { phase: "starting"; request: ExportRequest }
  | { phase: "running"; request: ExportRequest; job: ExportJob; startedAt: number }
  | { phase: "done"; request: ExportRequest; job: ExportJob }
  | { phase: "failed"; request: ExportRequest; failure: ExportFailure };

/** Why an export failed; turned into text in the UI language by `failureMessage`. */
export type ExportFailure =
  | { kind: "error"; error: unknown }
  | { kind: "job"; job: ExportJob }
  | { kind: "cancelled" };

/** Text of a failure in `locale`: translated error codes, else the backend message. */
export function failureMessage(failure: ExportFailure, locale: Locale): string {
  switch (failure.kind) {
    case "error":
      return describeError(failure.error, locale, translate(locale, "export.offline"));
    case "job": {
      const info = jobFailureInfo(failure.job);
      return info ? translateError(info, locale) : translate(locale, "export.failed");
    }
    case "cancelled":
      return translate(locale, "export.cancelled");
  }
}

export interface UseExportRunOptions {
  /** Run before starting, e.g. save pending project changes (snapshot). */
  prepare?: () => Promise<void>;
}

export function useExportRun(api: ExportApi, { prepare }: UseExportRunOptions = {}) {
  const [run, setRun] = useState<ExportRun>({ phase: "idle" });
  /** Every increment invalidates running requests and timers. */
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobId = useRef<string | null>(null);

  const stop = useCallback(() => {
    generation.current += 1;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const poll = useCallback(
    (gen: number, request: ExportRequest, startedAt: number) => {
      timer.current = setTimeout(async () => {
        timer.current = null;
        const id = jobId.current;
        if (gen !== generation.current || !id) return;
        let job: ExportJob;
        try {
          job = await api.getExport(id);
        } catch (error) {
          if (gen === generation.current) {
            setRun({ phase: "failed", request, failure: { kind: "error", error } });
          }
          return;
        }
        if (gen !== generation.current) return;
        switch (job.status) {
          case "done":
            setRun({ phase: "done", request, job });
            return;
          case "failed":
            setRun({ phase: "failed", request, failure: { kind: "job", job } });
            return;
          case "cancelled":
            setRun({ phase: "failed", request, failure: { kind: "cancelled" } });
            return;
          default:
            setRun({ phase: "running", request, job, startedAt });
            poll(gen, request, startedAt);
        }
      }, POLL_INTERVAL_MS);
    },
    [api],
  );

  const start = useCallback(
    async (request: ExportRequest) => {
      stop();
      const gen = generation.current;
      jobId.current = null;
      setRun({ phase: "starting", request });
      let job: ExportJob;
      try {
        await prepare?.();
        job = await api.startExport(request);
      } catch (error) {
        if (gen === generation.current) {
          setRun({ phase: "failed", request, failure: { kind: "error", error } });
        }
        return;
      }
      if (gen !== generation.current) {
        // Cancelled while starting: discard the export that just began.
        void api.cancelExport(job.id).catch(() => undefined);
        return;
      }
      jobId.current = job.id;
      const startedAt = Date.now();
      setRun({ phase: "running", request, job, startedAt });
      poll(gen, request, startedAt);
    },
    [api, poll, prepare, stop],
  );

  /** Stop polling and cancel the running export in the backend. */
  const cancel = useCallback(async () => {
    stop();
    const id = jobId.current;
    jobId.current = null;
    setRun({ phase: "idle" });
    if (id) await api.cancelExport(id).catch(() => undefined);
  }, [api, stop]);

  /** Back to the idle state without querying the backend. */
  const reset = useCallback(() => {
    stop();
    jobId.current = null;
    setRun({ phase: "idle" });
  }, [stop]);

  return { run, start, cancel, reset };
}
