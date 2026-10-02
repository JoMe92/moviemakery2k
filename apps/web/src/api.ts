export interface Health {
  status: "ok";
  ffmpeg: string | null;
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch("/api/health", { signal });
  if (!res.ok) throw new Error(`Backend antwortet mit ${res.status}`);
  return (await res.json()) as Health;
}

export function describeHealth(health: Health | null): string {
  if (!health) return "Backend nicht erreichbar";
  return health.ffmpeg
    ? `Backend bereit · FFmpeg ${health.ffmpeg}`
    : "Backend bereit · FFmpeg fehlt";
}
