import { vi } from "vitest";
import type {
  AppApi,
  AudioItem,
  ExportJob,
  ImageItem,
  Project,
  Transition,
  VideoItem,
} from "../lib/apiClient";

export function mediaItem(id: string): ImageItem {
  return {
    id,
    kind: "image",
    filename: `${id}.jpg`,
    width: 640,
    height: 480,
    createdAt: "2026-10-02T00:00:00Z",
    thumbnailUrl: `/api/media/${id}/thumbnail`,
    previewUrl: `/api/media/${id}/preview`,
  };
}

export function audioItem(id: string, duration = 192.4, filename = `${id}.mp3`): AudioItem {
  return {
    id,
    kind: "audio",
    filename,
    duration,
    sampleRate: 44100,
    channels: 2,
    codec: "mp3",
    createdAt: "2026-10-02T00:00:00Z",
    audioUrl: `/api/media/${id}/audio`,
    peaksUrl: `/api/media/${id}/peaks`,
  };
}

export function videoItem(id: string, duration = 105.0, filename = `${id}.mp4`): VideoItem {
  return {
    id,
    kind: "video",
    filename,
    duration,
    width: 640,
    height: 480,
    codec: "h264",
    createdAt: "2026-10-02T00:00:00Z",
    posterUrl: `/api/media/${id}/poster`,
  };
}

export const CATALOG: Transition[] = [
  {
    id: "fade",
    names: { de: "Überblenden", en: "Fade" },
    shader: "fade.glsl",
    defaultDuration: 1.25,
    params: {},
    source: { kind: "wmm2x-xml", ref: "x" },
  },
  {
    id: "circle",
    names: { de: "Kreis", en: "Circle" },
    shader: "circle.glsl",
    defaultDuration: 1.5,
    params: { borderSoftness: 20 },
    source: { kind: "smpte", ref: "x" },
  },
];

export function exportJob(overrides: Partial<ExportJob> = {}): ExportJob {
  return {
    id: "job1",
    status: "queued",
    progress: 0,
    profile: "high",
    fileName: "Mein Film",
    errorCode: null,
    errorParams: {},
    message: null,
    createdAt: "2026-10-02T00:00:00Z",
    ...overrides,
  };
}

export function mockApi(overrides: Partial<AppApi> = {}): AppApi & { saved: Project[] } {
  const saved: Project[] = [];
  return {
    saved,
    health: vi.fn(async () => ({ status: "ok" as const, ffmpeg: "9.0" })),
    catalog: vi.fn(async () => CATALOG),
    listMedia: vi.fn(async () => [mediaItem("a"), mediaItem("b")]),
    uploadMedia: vi.fn(async (file: File) => ({
      ok: true as const,
      filename: file.name,
      item: mediaItem(file.name),
    })),
    deleteMedia: vi.fn(async () => ({ schemaVersion: 3 as const, slides: [], music: [] })),
    getProject: vi.fn(async () => ({ schemaVersion: 3 as const, slides: [], music: [] })),
    putProject: vi.fn(async (p: Project) => {
      saved.push(structuredClone(p));
      return p;
    }),
    startExport: vi.fn(async ({ profile, fileName }) => exportJob({ profile, fileName })),
    getExport: vi.fn(async (id: string) => exportJob({ id, status: "running" })),
    cancelExport: vi.fn(async () => undefined),
    exportFileUrl: vi.fn((id: string) => `/api/exports/${id}/file`),
    ...overrides,
  };
}
