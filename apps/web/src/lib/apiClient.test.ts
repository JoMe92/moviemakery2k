import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi, errorDetail } from "./apiClient";

// openapi-fetch baut Request-Objekte; Node braucht dafür absolute URLs.
const BASE = "http://backend.test";

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("errorDetail", () => {
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
    const busy = "Es läuft bereits ein Export. Bitte warten oder ihn zuerst abbrechen.";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(409, { detail: busy }))
      .mockResolvedValueOnce(
        json(422, { detail: [{ loc: ["body"], msg: "Der Dateiname ist ungültig.", type: "x" }] }),
      )
      .mockResolvedValueOnce(new Response("kaputt", { status: 500 }));
    const api = createApi(BASE, fetchImpl as unknown as typeof fetch);
    const request = { profile: "small" as const, fileName: "x" };

    await expect(api.startExport(request)).rejects.toEqual(new ApiError(busy, 409));
    await expect(api.startExport(request)).rejects.toMatchObject({
      message: "Der Dateiname ist ungültig.",
      status: 422,
    });
    await expect(api.startExport(request)).rejects.toMatchObject({
      message: "Export starten fehlgeschlagen (500)",
      status: 500,
    });
  });
});
