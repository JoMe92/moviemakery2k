import { describe, expect, it } from "vitest";
// The backend's list of error codes (design.md D5) is the contract to check against.
import errorsPy from "../../../../backend/src/mmy_backend/errors.py?raw";
import { ApiError, type ApiErrorInfo } from "../lib/apiClient";
import { exportJob } from "../store/testApi";
import { de } from "./de";
import { en } from "./en";
import { describeError, jobFailureInfo, translateError, uploadFailureInfo } from "./errors";

/** Body of the call starting at `open` (index of "("), honouring Python string literals. */
function callBody(text: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error("unbalanced ErrorSpec call");
}

/** Codes and their params from `"code": ErrorSpec("template", ("param", …))` in errors.py. */
function backendCodes(): Map<string, string[]> {
  const codes = new Map<string, string[]>();
  for (const match of errorsPy.matchAll(/"([a-z]+(?:\.[A-Za-z]+)+)": ErrorSpec\(/g)) {
    const body = callBody(errorsPy, (match.index ?? 0) + match[0].length - 1);
    // The params tuple is the trailing `("a", "b")` group, if any.
    const tuple = /\(((?:\s*"[A-Za-z]+"\s*,?)+)\)\s*,?\s*$/.exec(body)?.[1] ?? "";
    codes.set(
      match[1] ?? "",
      [...tuple.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1] ?? ""),
    );
  }
  return codes;
}

function lookup(catalog: object, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    return node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
  }, catalog);
}

describe("backend error codes", () => {
  const codes = backendCodes();

  it("reads the code list from errors.py", () => {
    expect(codes.size).toBeGreaterThanOrEqual(30);
    expect(codes.has("export.emptyProject")).toBe(true);
    expect(codes.get("export.ffmpegInputClosed")).toEqual(["frame", "total"]);
  });

  it("every code has a German and an English text with only known placeholders", () => {
    for (const [code, params] of codes) {
      for (const catalog of [de, en]) {
        const text = lookup(catalog, `errors.${code}`);
        expect(typeof text, code).toBe("string");
        const used = [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        for (const name of used) expect(params, `${code}: {${name}}`).toContain(name);
      }
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

  it("unifies `error` (upload) and `errorCode` (export job)", () => {
    const upload = uploadFailureInfo({
      ok: false,
      filename: "a.gif",
      error: "media.tooLarge",
      errorParams: { maxMegabytes: 25 },
      message: "The file is too large (at most 25 MB).",
    });
    expect(translateError(upload, "de")).toBe("Die Datei ist zu groß (höchstens 25 MB).");
    const job = exportJob({
      status: "failed",
      error: "FFmpeg failed with exit code 1.",
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
