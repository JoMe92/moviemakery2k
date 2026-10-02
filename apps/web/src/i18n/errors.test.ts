import { describe, expect, it } from "vitest";
import { ApiError, type ApiErrorInfo, parseErrorBody } from "../lib/apiClient";
import { exportJob } from "../store/testApi";
import { de } from "./de";
import { en } from "./en";
import {
  describeError,
  errorKey,
  jobFailureInfo,
  translateError,
  uploadFailureInfo,
} from "./errors";
import { translate } from "./t";

// Completeness of the catalog against the backend's codes is a type check
// (`errorKey`, design.md D4), not a test.

/** All `[dotted key, text]` leaves below `node`. */
function leaves(node: object, prefix: string): [string, string][] {
  return Object.entries(node).flatMap(([name, value]): [string, string][] =>
    typeof value === "string"
      ? [[`${prefix}.${name}`, value]]
      : leaves(value as object, `${prefix}.${name}`),
  );
}

/** Parsed error body; fails the test if the body carries no error. */
function parsed(body: unknown): ApiErrorInfo {
  const info = parseErrorBody(body);
  if (!info) throw new Error("no error in body");
  return info;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("error catalog", () => {
  it("maps a code to its catalog key", () => {
    expect(errorKey("export.fileName.tooLong")).toBe("errors.export.fileName.tooLong");
    expect(translate("en", errorKey("media.notFound"))).toBe("Media item not found.");
  });

  it("German texts use the same placeholders as the English ones", () => {
    const german = new Map(leaves(de.errors, "errors"));
    for (const [key, text] of leaves(en.errors, "errors")) {
      expect(placeholders(german.get(key) ?? ""), key).toEqual(placeholders(text));
    }
  });
});

describe("translateError", () => {
  it("translates known codes with params in both languages", () => {
    const info = { code: "export.emptyProject", params: {}, message: "Cannot export …" };
    expect(translateError(info, "de")).toBe("Export nicht möglich: Der Bildstreifen ist leer.");
    expect(translateError(info, "en")).toBe("Cannot export: the storyboard is empty.");
    const range = {
      code: "project.slideDuration.outOfRange",
      params: { min: 0.5, max: 60, value: 0.1 },
      message: "…",
    };
    expect(translateError(range, "de")).toBe(
      "Die Bilddauer muss zwischen 0,5 und 60 s liegen (ist 0,1 s).",
    );
    expect(translateError(range, "en")).toBe(
      "The picture duration must be between 0.5 and 60 s (is 0.1 s).",
    );
  });

  it("shows the English message for an unknown code, a general text without a message", () => {
    expect(translateError({ code: "x.new", params: {}, message: "Backend says no." }, "de")).toBe(
      "Backend says no.",
    );
    expect(translateError({ code: "x.new", params: {}, message: "" }, "de")).toBe(
      "Ein unbekannter Fehler ist aufgetreten.",
    );
  });

  it("translates FastAPI's list: own codes individually, foreign ones generally", () => {
    const info: ApiErrorInfo = {
      code: null,
      params: {},
      message: "…",
      issues: [
        { code: "export.fileName.tooLong", params: { max: 120 }, message: "…" },
        { code: "missing", params: {}, message: "Field required" },
        { code: "enum", params: {}, message: "Input should be …" },
      ],
    };
    expect(translateError(info, "en")).toBe(
      "The file name is too long (at most 120 characters). The input is invalid.",
    );
  });

  it("puts the picture number from `loc` in front of a 422 entry (design.md D6)", () => {
    const error = new ApiError(
      "…",
      422,
      parsed({
        detail: [
          {
            loc: ["body", "slides", 1, "duration"],
            msg: "The picture duration must be between 0.5 and 60 s (is 0.1 s).",
            type: "project.slideDuration.outOfRange",
            ctx: { min: 0.5, max: 60, value: 0.1 },
          },
        ],
      }),
    );
    expect(describeError(error, "de")).toBe(
      "Bild 2: Die Bilddauer muss zwischen 0,5 und 60 s liegen (ist 0,1 s).",
    );
    expect(describeError(error, "en")).toBe(
      "Picture 2: The picture duration must be between 0.5 and 60 s (is 0.1 s).",
    );
  });

  it("adds no picture number to a 422 entry outside the storyboard", () => {
    const info = parsed({
      detail: [
        { loc: ["body", "fileName"], msg: "…", type: "export.fileName.tooLong", ctx: { max: 120 } },
        { loc: ["body", "slides"], msg: "List too long", type: "too_long" },
      ],
    });
    expect(translateError(info, "de")).toBe(
      "Der Dateiname ist zu lang (höchstens 120 Zeichen). Die Eingabe ist ungültig.",
    );
    expect(translateError(info, "en")).toBe(
      "The file name is too long (at most 120 characters). The input is invalid.",
    );
  });

  it("builds the project.invalid summary from the translated individual errors", () => {
    const info = {
      code: "project.invalid",
      params: { count: 1, summary: "Slide 2 …" },
      message: "The project is invalid: Slide 2 …",
      issues: [
        {
          code: "project.slide.unknownMedia",
          params: { slide: 2, slideId: "s2", mediaId: "m9" },
          message: "…",
        },
      ],
    };
    expect(translateError(info, "de")).toBe(
      "Das Projekt ist ungültig: Bild 2 (ID „s2“): unbekanntes Medium „m9“.",
    );
  });
});

describe("error sources", () => {
  it("describeError: ApiError translated, otherwise backend unreachable", () => {
    const known = new ApiError("Too many", 413, {
      code: "media.tooManyFiles",
      params: { max: 50, count: 51 },
      message: "Too many",
    });
    expect(describeError(known, "de")).toBe(
      "Zu viele Dateien: höchstens 50 je Import (51 gesendet).",
    );
    expect(describeError(new ApiError("plain text", 500), "en")).toBe("plain text");
    expect(describeError(new TypeError("Failed to fetch"), "en")).toBe(
      "The backend is not reachable.",
    );
    const http = new ApiError("Loading the project failed (500)", 500, {
      code: "client.requestFailed",
      params: { status: 500 },
      message: "Loading the project failed (500)",
    });
    expect(describeError(http, "de")).toBe(
      "Die Anfrage an das Backend ist fehlgeschlagen (Status 500).",
    );
  });

  it("reads the same fields from upload results and export jobs", () => {
    const upload = uploadFailureInfo({
      ok: false,
      filename: "a.gif",
      errorCode: "media.tooLarge",
      errorParams: { maxMegabytes: 25 },
      message: "The file is too large (at most 25 MB).",
    });
    expect(translateError(upload, "de")).toBe("Die Datei ist zu groß (höchstens 25 MB).");
    const job = exportJob({
      status: "failed",
      message: "FFmpeg failed with exit code 1.",
      errorCode: "export.ffmpegFailed",
      errorParams: { returnCode: 1 },
    });
    const info = jobFailureInfo(job);
    expect(info && translateError(info, "de")).toBe(
      "FFmpeg ist mit dem Exit-Code 1 fehlgeschlagen.",
    );
    expect(jobFailureInfo(exportJob({ status: "failed" }))).toBeNull();
  });
});
