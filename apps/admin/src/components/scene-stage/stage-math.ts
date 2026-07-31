import { STAGE_WORLD, type StagePosition } from "@kawabunga/types";

/* ── World ↔ screen math for the overhead stage ─────────────────────
 * Every scene shares one world: meters, origin center, +x right, +y up.
 * The viewport is a world-space center plus a pixels-per-meter zoom;
 * screen y grows downward, so the y axis flips in both transforms.
 */

export const WORLD = STAGE_WORLD;

/** Half-extents — anything beyond these is off the world. */
export const WORLD_MAX_X = WORLD.widthM / 2;
export const WORLD_MAX_Y = WORLD.heightM / 2;

export const MIN_PX_PER_M = 6;
export const MAX_PX_PER_M = 120;

export type Viewport = {
  /** World-space center of the view, meters. */
  cx: number;
  cy: number;
  /** Zoom, expressed as screen pixels per world meter. */
  pxPerM: number;
};

export type ScreenSize = { width: number; height: number };

export function defaultPxPerM(size: ScreenSize): number {
  if (size.width <= 0) return 40;
  return clampZoom(size.width / WORLD.defaultViewWidthM);
}

export function clampZoom(pxPerM: number): number {
  return Math.min(MAX_PX_PER_M, Math.max(MIN_PX_PER_M, pxPerM));
}

/** The zoom at which the world exactly covers the viewport — the hard
 *  floor, so the stage (and its generated terrain plate) is always
 *  full-bleed; the camera never sees past the world edge. */
export function coverZoom(size: ScreenSize): number {
  if (size.width <= 0 || size.height <= 0) return MIN_PX_PER_M;
  return Math.max(size.width / WORLD.widthM, size.height / WORLD.heightM);
}

/** Clamp zoom to [cover, max] and the center so the visible rect stays
 *  inside the world. Assumes cover-clamped zoom, which guarantees the
 *  half-extents fit. */
export function clampViewport(vp: Viewport, size: ScreenSize): Viewport {
  const pxPerM = Math.min(MAX_PX_PER_M, Math.max(coverZoom(size), vp.pxPerM));
  const halfW = size.width / 2 / pxPerM;
  const halfH = size.height / 2 / pxPerM;
  return {
    pxPerM,
    cx: Math.min(WORLD_MAX_X - halfW, Math.max(-WORLD_MAX_X + halfW, vp.cx)),
    cy: Math.min(WORLD_MAX_Y - halfH, Math.max(-WORLD_MAX_Y + halfH, vp.cy)),
  };
}

export function worldToScreen(
  p: { x: number; y: number },
  vp: Viewport,
  size: ScreenSize,
): { x: number; y: number } {
  return {
    x: size.width / 2 + (p.x - vp.cx) * vp.pxPerM,
    y: size.height / 2 - (p.y - vp.cy) * vp.pxPerM,
  };
}

export function screenToWorld(
  s: { x: number; y: number },
  vp: Viewport,
  size: ScreenSize,
): { x: number; y: number } {
  return {
    x: vp.cx + (s.x - size.width / 2) / vp.pxPerM,
    y: vp.cy - (s.y - size.height / 2) / vp.pxPerM,
  };
}

export function snapTo(value: number, stepM: number): number {
  if (!Number.isFinite(stepM) || stepM <= 0) return value;
  // Snapped values are rounded to micrometer precision so jsonb doesn't
  // accumulate float dust (0.30000000000000004 and friends).
  return Math.round(Math.round(value / stepM) * stepM * 1e6) / 1e6;
}

export function clampToWorld(p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.min(WORLD_MAX_X, Math.max(-WORLD_MAX_X, p.x)),
    y: Math.min(WORLD_MAX_Y, Math.max(-WORLD_MAX_Y, p.y)),
  };
}

/** A node is on the stage only when its position parses AND sits inside
 *  the world bounds — which is also what neutralizes legacy React-Flow
 *  pixel coordinates (hundreds of "meters" off-world) without a data
 *  migration. */
export function isPlaced(
  position: StagePosition | null | undefined,
): position is StagePosition {
  if (!position) return false;
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  return (
    Math.abs(position.x) <= WORLD_MAX_X && Math.abs(position.y) <= WORLD_MAX_Y
  );
}

/** Default render order per kind; position.z overrides. */
export function zIndexFor(kind: string, position: StagePosition | null): number {
  if (position?.z !== undefined) return position.z;
  switch (kind) {
    case "zone":
      return 0;
    case "artifact":
      return 10;
    case "character":
      return 20;
    case "audio":
      return 30;
    default:
      return 15;
  }
}

/** World-space rectangle currently visible, clamped to the world. */
export function visibleWorldBounds(vp: Viewport, size: ScreenSize) {
  const halfW = size.width / 2 / vp.pxPerM;
  const halfH = size.height / 2 / vp.pxPerM;
  return {
    minX: Math.max(-WORLD_MAX_X, vp.cx - halfW),
    maxX: Math.min(WORLD_MAX_X, vp.cx + halfW),
    minY: Math.max(-WORLD_MAX_Y, vp.cy - halfH),
    maxY: Math.min(WORLD_MAX_Y, vp.cy + halfH),
  };
}
