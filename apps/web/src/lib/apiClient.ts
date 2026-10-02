/**
 * Typisierter Zugriff auf das Backend. Die Typen kommen aus dem OpenAPI-Dokument
 * (`pixi run gen-api` → src/generated/schema.d.ts).
 */
import createClient from "openapi-fetch";
import type { components, paths } from "../generated/schema";

type Schemas = components["schemas"];
export type Health = Schemas["Health"];
export type MediaItem = Schemas["MediaItem"];
export type Project = Schemas["Project"];
export type Slide = Schemas["Slide"];
export type TransitionRef = Schemas["TransitionRef"];
export type Transition = Schemas["Transition"];
export type UploadResult = Schemas["MediaUploadSuccess"] | Schemas["MediaUploadFailure"];
export type ExportJob = Schemas["ExportJob"];
export type ExportProfile = Schemas["ExportProfile"];
export type ExportStatus = Schemas["ExportStatus"];

/** Export-Jobs (design.md D5); eigener Teil, damit der Assistent nur ihn braucht. */
export interface ExportApi {
  /** Startet einen Export (202); 409/422 werfen einen ApiError mit der Meldung des Backends. */
  startExport(request: { profile: ExportProfile; fileName: string }): Promise<ExportJob>;
  getExport(id: string): Promise<ExportJob>;
  /** Bricht einen laufenden Export ab bzw. löscht ein Ergebnis (204). */
  cancelExport(id: string): Promise<void>;
  /** Adresse der fertigen MP4 (Content-Disposition mit „<Name>.mp4“). */
  exportFileUrl(id: string): string;
}

/** Schmale, mockbare Schnittstelle, die der Store nutzt. */
export interface Api {
  health(): Promise<Health>;
  catalog(): Promise<Transition[]>;
  listMedia(): Promise<MediaItem[]>;
  /** Lädt genau eine Datei hoch und liefert ihr Ergebnis. */
  uploadMedia(file: File): Promise<UploadResult>;
  /** Löscht ein Medium und liefert das (ggf. kaskadiert geänderte) Projekt. */
  deleteMedia(id: string): Promise<Project>;
  getProject(): Promise<Project>;
  putProject(project: Project): Promise<Project>;
}

/** Alle Backend-Zugriffe der Web-App. */
export type AppApi = Api & ExportApi;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Lesbare Meldung aus einem FastAPI-Fehlerrumpf: `detail` ist entweder ein Text
 * (z. B. leeres Projekt, laufender Export) oder eine Liste von Prüffehlern.
 */
export function errorDetail(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("detail" in body)) return null;
  const { detail } = body as { detail: unknown };
  if (typeof detail === "string") return detail || null;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : "",
      )
      .filter(Boolean);
    return messages.length > 0 ? messages.join(" ") : null;
  }
  return null;
}

function unwrap<T>(result: { data?: T; error?: unknown; response: Response }, what: string): T {
  if (result.data !== undefined) return result.data;
  throw new ApiError(`${what} fehlgeschlagen (${result.response.status})`, result.response.status);
}

export function createApi(baseUrl = "", fetchImpl: typeof fetch = (...a) => fetch(...a)): AppApi {
  const client = createClient<paths>({ baseUrl, fetch: fetchImpl });
  return {
    async health() {
      return unwrap(await client.GET("/api/health"), "Health");
    },
    async catalog() {
      return unwrap(await client.GET("/api/catalog/transitions"), "Katalog").transitions;
    },
    async listMedia() {
      return unwrap(await client.GET("/api/media"), "Medienliste").items;
    },
    async uploadMedia(file) {
      const body = new FormData();
      body.append("files", file, file.name);
      const res = await fetchImpl(`${baseUrl}/api/media`, { method: "POST", body });
      if (!res.ok) throw new ApiError(`Upload fehlgeschlagen (${res.status})`, res.status);
      const data = (await res.json()) as Schemas["MediaUploadResponse"];
      const first = data.items[0];
      if (!first) throw new ApiError("Upload ohne Ergebnis");
      return first;
    },
    async deleteMedia(id) {
      const result = await client.DELETE("/api/media/{media_id}", {
        params: { path: { media_id: id } },
      });
      return unwrap(result, "Löschen").project;
    },
    async getProject() {
      return unwrap(await client.GET("/api/project"), "Projekt laden");
    },
    async putProject(project) {
      return unwrap(await client.PUT("/api/project", { body: project }), "Projekt speichern");
    },
    async startExport(request) {
      const result = await client.POST("/api/exports", { body: request });
      if (result.data !== undefined) return result.data;
      const status = result.response.status;
      throw new ApiError(
        errorDetail(result.error) ?? `Export starten fehlgeschlagen (${status})`,
        status,
      );
    },
    async getExport(id) {
      const result = await client.GET("/api/exports/{export_id}", {
        params: { path: { export_id: id } },
      });
      return unwrap(result, "Exportstatus");
    },
    async cancelExport(id) {
      const result = await client.DELETE("/api/exports/{export_id}", {
        params: { path: { export_id: id } },
      });
      if (!result.response.ok) {
        const status = result.response.status;
        throw new ApiError(
          errorDetail(result.error) ?? `Abbrechen fehlgeschlagen (${status})`,
          status,
        );
      }
    },
    exportFileUrl(id) {
      return `${baseUrl}/api/exports/${encodeURIComponent(id)}/file`;
    },
  };
}
