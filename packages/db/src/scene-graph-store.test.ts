import { describe, expect, it } from "vitest";
import {
  ambienceDataSchema,
  getSceneGraphStore,
  NODE_KINDS,
  propDataSchema,
  stagePositionSchema,
  zoneDataSchema,
} from "./scene-graph-store";

describe("scene graph ambience nodes", () => {
  it("accepts valid ambience data", () => {
    expect(
      ambienceDataSchema.parse({
        trackId: "tent-evening",
        description: "Low evening ambience.",
        isDefault: true,
      }),
    ).toEqual({
      trackId: "tent-evening",
      description: "Low evening ambience.",
      isDefault: true,
    });
    expect(NODE_KINDS).toContain("ambience");
  });

  it("rejects empty ambience track ids", () => {
    expect(() => ambienceDataSchema.parse({ trackId: "" })).toThrow();
  });

  it("rejects ref ids for ambience nodes before touching the database", async () => {
    await expect(
      getSceneGraphStore().createNode({
        sceneId: "scene_1",
        kind: "ambience",
        refId: "voice_or_media_ref",
        label: "Tent evening",
        data: { trackId: "tent-evening" },
      }),
    ).rejects.toThrow("must not carry refId");
  });
});

describe("stage node kinds (prop, zone)", () => {
  it("registers prop and zone in the kind registry", () => {
    expect(NODE_KINDS).toContain("prop");
    expect(NODE_KINDS).toContain("zone");
  });

  it("accepts valid prop data and rejects unknown keys", () => {
    expect(
      propDataSchema.parse({ glyph: "fire", radiusM: 0.75, soundSource: true }),
    ).toEqual({ glyph: "fire", radiusM: 0.75, soundSource: true });
    expect(() => propDataSchema.parse({ pixels: 40 })).toThrow();
  });

  it("requires shape and dimensions on zones", () => {
    expect(
      zoneDataSchema.parse({ shape: "ellipse", widthM: 10, heightM: 8 }),
    ).toEqual({ shape: "ellipse", widthM: 10, heightM: 8 });
    expect(() => zoneDataSchema.parse({ shape: "blob", widthM: 10, heightM: 8 })).toThrow();
    expect(() => zoneDataSchema.parse({ shape: "rect" })).toThrow();
  });

  it("rejects ref ids for stage kinds before touching the database", async () => {
    await expect(
      getSceneGraphStore().createNode({
        sceneId: "scene_1",
        kind: "zone",
        refId: "some_ref",
        label: "The tent",
        data: { shape: "rect", widthM: 4, heightM: 3 },
      }),
    ).rejects.toThrow("must not carry refId");
  });
});

describe("stage positions", () => {
  it("accepts meters with optional z and rotation", () => {
    expect(stagePositionSchema.parse({ x: -3, y: 0.5 })).toEqual({ x: -3, y: 0.5 });
    expect(stagePositionSchema.parse({ x: 4, y: 3, z: 2, rotation: 92 })).toEqual({
      x: 4,
      y: 3,
      z: 2,
      rotation: 92,
    });
  });

  it("rejects payloads that are not stage positions", () => {
    // Legacy React-Flow rows carried extra keys in some builds; anything
    // non-conforming must read as unplaced rather than throw.
    expect(() => stagePositionSchema.parse({ x: 100 })).toThrow();
    expect(() => stagePositionSchema.parse({ x: 1, y: 2, vx: 3 })).toThrow();
  });
});
