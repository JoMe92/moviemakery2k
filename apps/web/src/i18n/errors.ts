/**
 * Translation of backend errors (localization design.md D5). Known codes map
 * to the catalog keys `errors.<code>`; unknown codes show the backend's
 * English `message`. The API names the code differently per place — this
 * module hides that:
 * - HTTP errors: `detail.code` / `detail.params` (`ApiError.info`),
 * - FastAPI's native 422 list: `type` / `ctx` per entry (`info.issues`),
 * - upload results: `error` / `errorParams`,
 * - export jobs: `errorCode` / `errorParams`.
 */
import {
  ApiError,
  type ApiErrorInfo,
  type ErrorParams,
  type ExportJob,
  type UploadResult,
} from "../lib/apiClient";
import { formatNumber } from "./format";
import type { Locale } from "./locale";
import { translate, translateDynamic } from "./t";

type UploadFailure = Extract<UploadResult, { ok: false }>;

/** Catalog key of a backend error code. */
export const errorKey = (code: string) => `errors.${code}`;

function formatParams(locale: Locale, params: ErrorParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(params)) {
    // Integers (counts, frame numbers, status codes) stay plain; decimals follow the locale.
    out[name] =
      typeof value === "number" && !Number.isInteger(value)
        ? formatNumber(locale, value)
        : String(value);
  }
  return out;
}

function translateCode(
  locale: Locale,
  code: string | null,
  params: Record<string, string>,
): string | null {
  if (!code) return null;
  const missing = "\u0000";
  const text = translateDynamic(locale, errorKey(code), params, missing);
  return text === missing ? null : text;
}

/** Text of one structured error in `locale`. */
export function translateError(info: ApiErrorInfo, locale: Locale): string {
  const issues = info.issues ?? [];
  if (!info.code && issues.length > 0) {
    // FastAPI's native list: our rule violations carry their code in `type`;
    // anything else (missing field, wrong type …) gets a general hint.
    const texts = issues.map(
      (issue) =>
        translateCode(locale, issue.code, formatParams(locale, issue.params)) ??
        translate(locale, "errors.invalidInput"),
    );
    return [...new Set(texts)].join(" ");
  }
  const params = formatParams(locale, info.params);
  if (info.code === "project.invalid" && issues.length > 0) {
    params.summary = issues.map((issue) => translateError(issue, locale)).join("; ");
  }
  return (
    translateCode(locale, info.code, params) || info.message || translate(locale, "errors.unknown")
  );
}

/**
 * Text for anything a backend call threw: an `ApiError` is translated (or
 * shows its message), everything else counts as an unreachable backend.
 */
export function describeError(error: unknown, locale: Locale, offlineText?: string): string {
  if (error instanceof ApiError) {
    return error.info ? translateError(error.info, locale) : error.message;
  }
  return offlineText ?? translate(locale, "errors.client.offline");
}

/** Structured error of a failed upload result. */
export function uploadFailureInfo(result: UploadFailure): ApiErrorInfo {
  return { code: result.errorCode, params: result.errorParams ?? {}, message: result.message };
}

/** Structured error of a failed export job, or null if it carries none. */
export function jobFailureInfo(job: ExportJob): ApiErrorInfo | null {
  if (!job.errorCode && !job.message) return null;
  return { code: job.errorCode ?? null, params: job.errorParams ?? {}, message: job.message ?? "" };
}
