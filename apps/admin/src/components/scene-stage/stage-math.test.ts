import { describe, expect, it } from "vitest";
import {
  clampToWorld,
  defaultPxPerM,
  isPlaced,
  screenToWorld,
  snapTo,
  visibleWorldBounds,
  WORLD,
  worldToScreen,
  zIndexFor,
} from "./stage-math";

const SIZE = { width: 960, height: 640 };
const VP = { cx: 0, cy: 0, pxPerM: 40 };

describe("stage transforms", () => {
  it("puts the world origin at screen center for a centered viewport", () => {
    expect(worldToScreen({ x: 0, y: 0 }, VP, SIZE)).toEqual({ x: 480, y: 320 });
  });

  it("flips y: world up is screen up (smaller y)", () => {
    const p = worldToScreen({ x: 0, y: 2 }, VP, SIZE);
    expect(p.y).toBe(320 - 80);
  });

  it("round-trips world → screen → world", () => {
    const original = { x: -3.5, y: 1.25 };
    const vp = { cx: 4, cy: -2, pxPerM: 33 };
    const back = screenToWorld(worldToScreen(original, vp, SIZE), vp, SIZE);
    expect(back.x).toBeCloseTo(original.x, 10);
    expect(back.y).toBeCloseTo(original.y, 10);
  });

  it("fits the default 24m view width", () => {
    expect(defaultPxPerM({ width: 960, height: 640 })).toBe(960 / WORLD.defaultViewWidthM);
  });
});

describe("snap and clamp", () => {
  it("snaps to the half-meter grid without float dust", () => {
    expect(snapTo(3.26, 0.5)).toBe(3.5);
    expect(snapTo(-3.74, 0.5)).toBe(-3.5);
    expect(snapTo(0.3 + 0.000000000004, 0.1)).toBe(0.3);
  });

  it("ignores non-positive steps", () => {
    expect(snapTo(3.26, 0)).toBe(3.26);
  });

  it("clamps to the 96×64 world", () => {
    expect(clampToWorld({ x: 500, y: -500 })).toEqual({ x: 48, y: -32 });
  });
});

describe("isPlaced (legacy pixel neutralization)", () => {
  it("accepts in-bounds meters", () => {
    expect(isPlaced({ x: -3, y: 0.5 })).toBe(true);
    expect(isPlaced({ x: 48, y: -32 })).toBe(true);
  });

  it("treats null and out-of-bounds values as unplaced", () => {
    expect(isPlaced(null)).toBe(false);
    expect(isPlaced(undefined)).toBe(false);
    // Legacy React-Flow pixel coordinates land far outside the world.
    expect(isPlaced({ x: 220, y: -240 })).toBe(false);
    expect(isPlaced({ x: 0, y: 64.5 })).toBe(false);
  });

  it("rejects non-finite coordinates", () => {
    expect(isPlaced({ x: Number.NaN, y: 0 })).toBe(false);
  });
});

describe("z ordering", () => {
  it("orders zones under props under characters under audio", () => {
    expect(zIndexFor("zone", null)).toBeLessThan(zIndexFor("artifact", null));
    expect(zIndexFor("artifact", null)).toBeLessThan(zIndexFor("character", null));
    expect(zIndexFor("character", null)).toBeLessThan(zIndexFor("audio", null));
  });

  it("lets position.z override the kind default", () => {
    expect(zIndexFor("zone", { x: 0, y: 0, z: 99 })).toBe(99);
  });
});

describe("visible bounds", () => {
  it("clamps the visible rect to the world edges", () => {
    const bounds = visibleWorldBounds({ cx: 47, cy: 31, pxPerM: 10 }, SIZE);
    expect(bounds.maxX).toBe(48);
    expect(bounds.maxY).toBe(32);
    expect(bounds.minX).toBeCloseTo(47 - 48, 10);
  });
});
