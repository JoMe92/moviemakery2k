/**
 * Translation of backend errors (localization design.md D5). Every code of
 * the contract's `ErrorCode` maps to the catalog key `errors.<code>`
 * (harden-export-and-ui design.md D4: a missing text is a type error, see
 * `errorKey`); codes outside it show the backend's English `message`.
 * Where the code comes from:
 * - HTTP errors: `detail.code` / `detail.params` (`ApiError.info`),
 * - FastAPI's native 422 list: `type` / `ctx` per entry (`info.issues`),
 * - upload results and export jobs alike: `errorCode` / `errorParams` /
 *   `message` (design.md D3).
 */
import {
  ApiError,
  type ApiErrorInfo,
  type ErrorCode,
  type ErrorParams,
  type ExportJob,
  type UploadResult,
} from "../lib/apiClient";
import { formatNumber } from "./format";
import type { Locale } from "./locale";
import { translate, translateDynamic } from "./t";
import type { MessageKey } from "./types";

type UploadFailure = Extract<UploadResult, { ok: false }>;

/**
 * Catalog key of a backend error code. The return type is checked against the
 * catalog: if `errors` in `en.ts` (and thus `de.ts`, which satisfies the same
 * shape) lacks a text for any `ErrorCode`, this line fails `tsc` with the
 * missing key — the catalog cannot fall behind the contract.
 */
export function errorKey(code: ErrorCode): MessageKey {
  return `errors.${code}`;
}

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
  // `code` may lie outside the contract (FastAPI's own types, newer backends),
  // so the lookup is dynamic and a missing text falls back to the message.
  const text = translateDynamic(locale, `errors.${code}`, params, missing);
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
