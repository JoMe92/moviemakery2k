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

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function unwrap<T>(result: { data?: T; error?: unknown; response: Response }, what: string): T {
  if (result.data !== undefined) return result.data;
  throw new ApiError(`${what} fehlgeschlagen (${result.response.status})`, result.response.status);
}

export function createApi(baseUrl = "", fetchImpl: typeof fetch = (...a) => fetch(...a)): Api {
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
  };
}
