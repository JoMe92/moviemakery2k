import { vi } from "vitest";
import type { Api, MediaItem, Project, Transition } from "../lib/apiClient";

export function mediaItem(id: string): MediaItem {
  return {
    id,
    filename: `${id}.jpg`,
    width: 640,
    height: 480,
    createdAt: "2026-10-02T00:00:00Z",
    thumbnailUrl: `/api/media/${id}/thumbnail`,
    previewUrl: `/api/media/${id}/preview`,
  };
}

export const CATALOG: Transition[] = [
  {
    id: "fade",
    name: "Überblenden",
    shader: "fade.glsl",
    defaultDuration: 1.25,
    params: {},
    source: { kind: "wmm2x-xml", ref: "x" },
  },
  {
    id: "circle",
    name: "Kreis",
    shader: "circle.glsl",
    defaultDuration: 1.5,
    params: { borderSoftness: 20 },
    source: { kind: "smpte", ref: "x" },
  },
];

export function mockApi(overrides: Partial<Api> = {}): Api & { saved: Project[] } {
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
    deleteMedia: vi.fn(async () => ({ schemaVersion: 1 as const, slides: [] })),
    getProject: vi.fn(async () => ({ schemaVersion: 1 as const, slides: [] })),
    putProject: vi.fn(async (p: Project) => {
      saved.push(structuredClone(p));
      return p;
    }),
    ...overrides,
  };
}
