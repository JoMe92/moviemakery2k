import { useSyncExternalStore } from "react";

/*
 * Tile size of the storyboard strip (add-mobile-layout design.md D12): three
 * levels, changed by pinch or "Smaller"/"Larger", stored locally like the
 * language. "medium" is the desktop size.
 */

export const TILE_SIZES = ["small", "medium", "large"] as const;
export type TileSize = (typeof TILE_SIZES)[number];
export const TILE_SIZE_STORAGE_KEY = "mmy.tileSize";
export const DEFAULT_TILE_SIZE: TileSize = "medium";

function read(): TileSize {
  try {
    const stored = globalThis.localStorage?.getItem(TILE_SIZE_STORAGE_KEY);
    return (TILE_SIZES as readonly string[]).includes(stored ?? "")
      ? (stored as TileSize)
      : DEFAULT_TILE_SIZE;
  } catch {
    return DEFAULT_TILE_SIZE;
  }
}

let current: TileSize | null = null;
const listeners = new Set<() => void>();

export function getTileSize(): TileSize {
  if (current === null) current = read();
  return current;
}

export function setTileSize(size: TileSize): void {
  current = size;
  try {
    globalThis.localStorage?.setItem(TILE_SIZE_STORAGE_KEY, size);
  } catch {
    // Storage unavailable: the size holds for this session only.
  }
  for (const l of listeners) l();
}

/** One level smaller (-1) or larger (+1), clamped to the three levels. */
export function stepTileSize(direction: -1 | 1): void {
  const index = TILE_SIZES.indexOf(getTileSize());
  const next = TILE_SIZES[Math.min(TILE_SIZES.length - 1, Math.max(0, index + direction))];
  if (next && next !== getTileSize()) setTileSize(next);
}

/** Forgets the cached level (tests reset localStorage between cases). */
export function resetTileSize(): void {
  current = null;
}

export function useTileSize(): TileSize {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getTileSize,
    () => DEFAULT_TILE_SIZE,
  );
}
