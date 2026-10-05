import { vi } from "vitest";
import type {
  AppApi,
  AudioItem,
  AutoMovieStyle,
  Effect,
  ExportJob,
  ImageItem,
  Project,
  Slide,
  TitleStyle,
  Transition,
  VideoItem,
} from "../lib/apiClient";
import { slideEffectId, slideMediaId } from "./projectOps";

/**
 * `slideMediaId`/`slideEffectId` for a possibly-absent element, so tests can
 * assert on `slides[0]` without narrowing the `Slide` union by hand.
 */
export function slideMediaIdOf(slide: Slide | undefined): string | null | undefined {
  return slide ? slideMediaId(slide) : undefined;
}

export function slideEffectIdOf(slide: Slide | undefined): string | null | undefined {
  return slide ? slideEffectId(slide) : undefined;
}

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
    videoUrl: `/api/media/${id}/video`,
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

/**
 * Title catalog stand-in (add-titles-and-credits D4): one static one-line
 * style, one animated one-line style, a smaller-font one and a credits
 * style - enough to cover every layout and phase effect in tests.
 */
export const TITLE_CATALOG: TitleStyle[] = [
  {
    id: "basic-title",
    names: { de: "Einfacher Titel", en: "Basic Title" },
    layout: "one-line",
    anchor: { x: 0, y: 0, scale: 1 },
    fontScale: 1,
    phases: {
      entrance: { effect: "fade" },
      main: { effect: "static" },
      exit: { effect: "fade" },
    },
    source: { kind: "wmm2x-xml", ref: "x" },
  },
  {
    id: "fly-in",
    names: { de: "Einfliegen", en: "Fly In" },
    layout: "one-line",
    anchor: { x: 0, y: 0, scale: 1 },
    fontScale: 1,
    phases: {
      entrance: {
        effect: "position",
        start: { x: -1, y: 0, scale: 1 },
        end: { x: 0, y: 0, scale: 1 },
      },
      main: { effect: "static" },
      exit: { effect: "fade" },
    },
    source: { kind: "wmm2x-xml", ref: "x" },
  },
  {
    id: "subtitle",
    names: { de: "Untertitel", en: "Subtitle" },
    layout: "one-line",
    anchor: { x: 0, y: -0.7, scale: 1 },
    fontScale: 0.7,
    phases: {
      entrance: { effect: "fade" },
      main: { effect: "static" },
      exit: { effect: "fade" },
    },
    source: { kind: "wmm2x-xml", ref: "x" },
  },
  {
    id: "fade-in-and-out",
    names: { de: "Ein- und Ausblenden", en: "Fade In and Out" },
    layout: "two-line",
    anchor: { x: 0, y: 0, scale: 1 },
    fontScale: 1,
    phases: {
      entrance: { effect: "fade" },
      main: { effect: "static" },
      exit: { effect: "fade" },
    },
    source: { kind: "wmm2x-xml", ref: "x" },
  },
  {
    id: "scroll-up-stacked",
    names: { de: "Nach oben rollen, gestapelt", en: "Scroll Up Stacked" },
    layout: "credits",
    anchor: { x: 0, y: 0, scale: 1 },
    fontScale: 1,
    phases: {
      entrance: { effect: "fade" },
      main: {
        effect: "position",
        start: { x: 0, y: -1, scale: 1 },
        end: { x: 0, y: 1, scale: 1 },
      },
      exit: { effect: "fade" },
    },
    source: { kind: "wmm2x-xml", ref: "x" },
  },
];

export const EFFECT_CATALOG: Effect[] = [
  {
    id: "sepia",
    names: { de: "Sepia", en: "Sepia" },
    shader: "sepia.glsl",
    params: {},
    source: { kind: "wmm2x-xml", ref: "x" },
  },
  {
    id: "negative",
    names: { de: "Negativ", en: "Negative" },
    shader: "negative.glsl",
    params: {},
    source: { kind: "wmm2x-xml", ref: "x" },
  },
];

export const AUTOMOVIE_CATALOG: AutoMovieStyle[] = [
  {
    id: "classic",
    names: { de: "Klassisch", en: "Classic" },
    descriptions: { de: "Überblenden zwischen allen Elementen.", en: "Fade between all." },
    transitionId: "fade",
    effectId: null,
    titleStyleId: "basic-title",
    requiresMusic: false,
  },
  {
    id: "old-movie",
    names: { de: "Alter Film", en: "Old Movie" },
    descriptions: { de: "Auflösen, gealtert.", en: "Dissolve, aged." },
    transitionId: "dissolve",
    effectId: "film-age-older",
    titleStyleId: "basic-title",
    requiresMusic: false,
  },
  {
    id: "music-video",
    names: { de: "Musikvideo", en: "Music Video" },
    descriptions: { de: "Kreis, an die Musik angepasst.", en: "Circle, fitted to the music." },
    transitionId: "circle",
    effectId: null,
    titleStyleId: "zoom-in",
    requiresMusic: true,
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
    effectCatalog: vi.fn(async () => EFFECT_CATALOG),
    titleCatalog: vi.fn(async () => TITLE_CATALOG),
    automovieCatalog: vi.fn(async () => AUTOMOVIE_CATALOG),
    listMedia: vi.fn(async () => [mediaItem("a"), mediaItem("b")]),
    uploadMedia: vi.fn(async (file: File) => ({
      ok: true as const,
      filename: file.name,
      item: mediaItem(file.name),
    })),
    deleteMedia: vi.fn(async () => ({ schemaVersion: 5 as const, slides: [], music: [] })),
    getProject: vi.fn(async () => ({ schemaVersion: 5 as const, slides: [], music: [] })),
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
