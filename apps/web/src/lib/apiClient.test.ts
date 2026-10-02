import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi, errorDetail, parseErrorBody } from "./apiClient";

// openapi-fetch baut Request-Objekte; Node braucht dafür absolute URLs.
const BASE = "http://backend.test";

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("errorDetail", () => {
  it("liest die englische Meldung eines ApiError (design.md D5)", () => {
    expect(
      errorDetail({
        detail: {
          code: "export.emptyProject",
          params: {},
          message: "Cannot export: the storyboard is empty.",
        },
      }),
    ).toBe("Cannot export: the storyboard is empty.");
    expect(errorDetail({ detail: { code: "export.busy", params: {}, message: "" } })).toBeNull();
  });

  it("liest Text- und Listenform von FastAPI", () => {
    expect(errorDetail({ detail: "Export nicht möglich: Der Bildstreifen ist leer." })).toBe(
      "Export nicht möglich: Der Bildstreifen ist leer.",
    );
    expect(
      errorDetail({
        detail: [
          { loc: ["body", "fileName"], msg: "Der Dateiname ist ungültig.", type: "value_error" },
          { loc: ["body", "profile"], msg: "Unbekanntes Profil.", type: "enum" },
        ],
      }),
    ).toBe("Der Dateiname ist ungültig. Unbekanntes Profil.");
    expect(errorDetail(undefined)).toBeNull();
    expect(errorDetail("Internal Server Error")).toBeNull();
    expect(errorDetail({ detail: [] })).toBeNull();
  });
});

describe("Export-Schnittstelle", () => {
  it("startet, fragt ab, bricht ab und baut die Download-Adresse", async () => {
    const job = {
      id: "abc",
      status: "queued",
      progress: 0,
      profile: "high",
      fileName: "Mein Film",
      error: null,
      createdAt: "2026-10-02T00:00:00Z",
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request;
      if (request.method === "POST") return json(202, job);
      if (request.method === "DELETE") return new Response(null, { status: 204 });
      return json(200, { ...job, status: "running", progress: 0.5 });
    });
    const api = createApi(BASE, fetchImpl as unknown as typeof fetch);

    expect(await api.startExport({ profile: "high", fileName: "Mein Film" })).toEqual(job);
    const post = fetchImpl.mock.calls[0]?.[0] as Request;
    expect(new URL(post.url).pathname).toBe("/api/exports");
    expect(await post.json()).toEqual({ profile: "high", fileName: "Mein Film" });

    expect((await api.getExport("abc")).progress).toBe(0.5);
    await expect(api.cancelExport("abc")).resolves.toBeUndefined();
    expect(api.exportFileUrl("abc")).toBe(`${BASE}/api/exports/abc/file`);
  });

  it("wirft bei 409 und 422 die Meldung des Backends", async () => {
    const busy = "An export is already running. Wait for it to finish or cancel it first.";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json(409, { detail: { code: "export.busy", params: { exportId: "abc" }, message: busy } }),
      )
      .mockResolvedValueOnce(
        json(422, {
          detail: [
            {
              loc: ["body", "fileName"],
              msg: "The file name is invalid.",
              type: "export.fileName.invalid",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response("kaputt", { status: 500 }));
    const api = createApi(BASE, fetchImpl as unknown as typeof fetch);
    const request = { profile: "small" as const, fileName: "x" };

    await expect(api.startExport(request)).rejects.toMatchObject({
      message: busy,
      status: 409,
      info: { code: "export.busy" },
    });
    await expect(api.startExport(request)).rejects.toMatchObject({
      message: "The file name is invalid.",
      status: 422,
    });
    await expect(api.startExport(request)).rejects.toMatchObject({
      message: "Starting the export failed (500)",
      status: 500,
      info: { code: "client.requestFailed", params: { status: 500 } },
    });
  });
});

describe("parseErrorBody", () => {
  it("liefert Code, Parameter und Meldung strukturiert", () => {
    expect(
      parseErrorBody({
        detail: {
          code: "media.tooManyFiles",
          params: { max: 50, count: 51, junk: { x: 1 } },
          message: "Too many files: at most 50 per import (51 sent).",
        },
      }),
    ).toEqual({
      code: "media.tooManyFiles",
      params: { max: 50, count: 51 },
      message: "Too many files: at most 50 per import (51 sent).",
    });
  });

  it("liest FastAPIs Liste mit `type` als Code und `ctx` als Parameter", () => {
    const info = parseErrorBody({
      detail: [
        {
          loc: ["body", "fileName"],
          msg: "The file name is too long (at most 120 characters).",
          type: "export.fileName.tooLong",
          ctx: { max: 120 },
        },
        { loc: ["body", "profile"], msg: "Input should be 'high' or 'small'", type: "enum" },
      ],
    });
    expect(info?.code).toBeNull();
    expect(info?.issues).toEqual([
      {
        code: "export.fileName.tooLong",
        params: { max: 120 },
        message: "The file name is too long (at most 120 characters).",
      },
      { code: "enum", params: {}, message: "Input should be 'high' or 'small'" },
    ]);
  });

  it("liest die Einzelfehler von project.invalid", () => {
    const info = parseErrorBody({
      detail: {
        code: "project.invalid",
        params: { count: 1, summary: "x" },
        message: "The project is invalid: x",
        issues: [
          {
            code: "project.slide.unknownMedia",
            params: { slide: 2, slideId: "s2", mediaId: "m9" },
            message: "Slide 2 …",
            loc: ["body", "slides", 1],
          },
        ],
      },
    });
    expect(info?.issues?.[0]).toEqual({
      code: "project.slide.unknownMedia",
      params: { slide: 2, slideId: "s2", mediaId: "m9" },
      message: "Slide 2 …",
    });
  });
});

describe("Upload-Fehler", () => {
  it("wirft bei 413 einen ApiError mit Code", async () => {
    const fetchImpl = vi.fn(async () =>
      json(413, {
        detail: { code: "media.tooManyFiles", params: { max: 50, count: 51 }, message: "Too many" },
      }),
    );
    const api = createApi(BASE, fetchImpl as unknown as typeof fetch);
    const error = await api.uploadMedia(new File(["x"], "a.jpg")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 413, info: { code: "media.tooManyFiles" } });
  });
});
