/**
 * Typed access to the backend. The types come from the OpenAPI document
 * (`pixi run gen-api` → src/generated/schema.d.ts).
 */
import createClient from "openapi-fetch";
import type { components, paths } from "../generated/schema";

type Schemas = components["schemas"];
export type Health = Schemas["Health"];
export type MediaItem = Schemas["MediaItem"];
export type ImageItem = Schemas["ImageItem"];
export type AudioItem = Schemas["AudioItem"];
export type Project = Schemas["Project"];
export type Slide = Schemas["Slide"];
export type TransitionRef = Schemas["TransitionRef"];
export type Transition = Schemas["Transition"];
export type UploadResult = Schemas["MediaUploadSuccess"] | Schemas["MediaUploadFailure"];
export type ExportJob = Schemas["ExportJob"];
export type ExportProfile = Schemas["ExportProfile"];
export type ExportStatus = Schemas["ExportStatus"];
export type ApiErrorBody = Schemas["ApiError"];
/** Every code the backend can send (design.md D4); the error catalog is keyed by it. */
export type ErrorCode = Schemas["ErrorCode"];

/** Export jobs (design.md D5); a separate part so the wizard needs only this one. */
export interface ExportApi {
  /** Starts an export (202); 409/422 throw an ApiError with the backend's message. */
  startExport(request: { profile: ExportProfile; fileName: string }): Promise<ExportJob>;
  getExport(id: string): Promise<ExportJob>;
  /** Cancels a running export or deletes a result (204). */
  cancelExport(id: string): Promise<void>;
  /** URL of the finished MP4 (Content-Disposition with "<name>.mp4"). */
  exportFileUrl(id: string): string;
}

/** Narrow, mockable interface used by the store. */
export interface Api {
  health(): Promise<Health>;
  catalog(): Promise<Transition[]>;
  listMedia(): Promise<MediaItem[]>;
  /** Uploads exactly one file and returns its result. */
  uploadMedia(file: File): Promise<UploadResult>;
  /** Deletes a media item and returns the (possibly cascade-modified) project. */
  deleteMedia(id: string): Promise<Project>;
  getProject(): Promise<Project>;
  putProject(project: Project): Promise<Project>;
}

/** All backend access of the web app. */
export type AppApi = Api & ExportApi;

/** Values an error message is built from (`params`, `ctx`, `errorParams`). */
export type ErrorParams = Readonly<Record<string, string | number>>;

/**
 * Structured backend error (design.md D5): stable `code` (null if the backend
 * sent none), its `params` and the English `message`. `issues` holds single
 * rule violations (FastAPI's native 422 list or `project.invalid`).
 */
export interface ApiErrorInfo {
  code: string | null;
  params: ErrorParams;
  message: string;
  issues?: readonly ApiErrorInfo[];
  /**
   * 1-based number of the storyboard picture a native 422 entry refers to,
   * from its `loc` (`["body", "slides", <i>, …]` → `i + 1`; harden-export-and-ui
   * design.md D6). Absent if the entry concerns no picture.
   */
  picture?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Structured error for translation (localization design.md D5). */
    readonly info?: ApiErrorInfo,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function errorParams(value: unknown): ErrorParams {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string | number> = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === "string" || typeof v === "number") out[key] = v;
  }
  return out;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Picture number of a FastAPI `loc` (`["body", "slides", <i>, …]` → `i + 1`), or null. */
export function pictureOfLoc(loc: unknown): number | null {
  if (!Array.isArray(loc) || loc[0] !== "body" || loc[1] !== "slides") return null;
  const index: unknown = loc[2];
  return typeof index === "number" && Number.isInteger(index) && index >= 0 ? index + 1 : null;
}

function issueOf(item: unknown): ApiErrorInfo | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  // Native FastAPI entry: `type` is the code, `ctx` the params, `msg` the message.
  if ("msg" in raw || "type" in raw) {
    const info: ApiErrorInfo = {
      code: str(raw.type) || null,
      params: errorParams(raw.ctx),
      message: str(raw.msg),
    };
    const picture = pictureOfLoc(raw.loc);
    if (picture !== null) info.picture = picture;
    return info;
  }
  return {
    code: str(raw.code) || null,
    params: errorParams(raw.params),
    message: str(raw.message),
  };
}

/**
 * Structured error from a FastAPI error body: `detail` is an `ApiError`
 * (`{code, params, message}`, optionally with `issues`), FastAPI's native list
 * of validation errors, or a plain text. Null if the body carries no error.
 */
export function parseErrorBody(body: unknown): ApiErrorInfo | null {
  if (!body || typeof body !== "object" || !("detail" in body)) return null;
  const { detail } = body as { detail: unknown };
  if (typeof detail === "string")
    return detail ? { code: null, params: {}, message: detail } : null;
  if (Array.isArray(detail)) {
    const issues = detail.map(issueOf).filter((i): i is ApiErrorInfo => i !== null);
    if (issues.length === 0) return null;
    const message = issues
      .map((i) => i.message)
      .filter(Boolean)
      .join(" ");
    return { code: null, params: {}, message, issues };
  }
  if (detail && typeof detail === "object") {
    const raw = detail as Record<string, unknown>;
    const info: ApiErrorInfo = {
      code: str(raw.code) || null,
      params: errorParams(raw.params),
      message: str(raw.message),
    };
    if (Array.isArray(raw.issues)) {
      info.issues = raw.issues.map(issueOf).filter((i): i is ApiErrorInfo => i !== null);
    }
    return info.code || info.message ? info : null;
  }
  return null;
}

/** Readable (English) backend message of an error body, or null. */
export function errorDetail(body: unknown): string | null {
  return parseErrorBody(body)?.message || null;
}

/** Error for a failed request; the UI translates it via `client.requestFailed`. */
function requestFailed(what: string, status: number, body?: unknown): ApiError {
  const info = parseErrorBody(body);
  if (info) return new ApiError(info.message || `${what} failed (${status})`, status, info);
  const message = `${what} failed (${status})`;
  return new ApiError(message, status, {
    code: "client.requestFailed",
    params: { status },
    message,
  });
}

function unwrap<T>(result: { data?: T; error?: unknown; response: Response }, what: string): T {
  if (result.data !== undefined) return result.data;
  throw requestFailed(what, result.response.status, result.error);
}

export function createApi(baseUrl = "", fetchImpl: typeof fetch = (...a) => fetch(...a)): AppApi {
  const client = createClient<paths>({ baseUrl, fetch: fetchImpl });
  return {
    async health() {
      return unwrap(await client.GET("/api/health"), "Health check");
    },
    async catalog() {
      return unwrap(await client.GET("/api/catalog/transitions"), "Loading the catalog")
        .transitions;
    },
    async listMedia() {
      return unwrap(await client.GET("/api/media"), "Loading the media list").items;
    },
    async uploadMedia(file) {
      const body = new FormData();
      body.append("files", file, file.name);
      const res = await fetchImpl(`${baseUrl}/api/media`, { method: "POST", body });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => undefined);
        throw requestFailed("Upload", res.status, body);
      }
      const data = (await res.json()) as Schemas["MediaUploadResponse"];
      const first = data.items[0];
      if (!first) throw new ApiError("Upload returned no result");
      return first;
    },
    async deleteMedia(id) {
      const result = await client.DELETE("/api/media/{media_id}", {
        params: { path: { media_id: id } },
      });
      return unwrap(result, "Deleting the media item").project;
    },
    async getProject() {
      return unwrap(await client.GET("/api/project"), "Loading the project");
    },
    async putProject(project) {
      return unwrap(await client.PUT("/api/project", { body: project }), "Saving the project");
    },
    async startExport(request) {
      const result = await client.POST("/api/exports", { body: request });
      if (result.data !== undefined) return result.data;
      throw requestFailed("Starting the export", result.response.status, result.error);
    },
    async getExport(id) {
      const result = await client.GET("/api/exports/{export_id}", {
        params: { path: { export_id: id } },
      });
      return unwrap(result, "Loading the export status");
    },
    async cancelExport(id) {
      const result = await client.DELETE("/api/exports/{export_id}", {
        params: { path: { export_id: id } },
      });
      if (!result.response.ok) {
        throw requestFailed("Cancelling the export", result.response.status, result.error);
      }
    },
    exportFileUrl(id) {
      return `${baseUrl}/api/exports/${encodeURIComponent(id)}/file`;
    },
  };
}
