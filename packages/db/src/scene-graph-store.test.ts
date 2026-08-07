import { describe, expect, it } from "vitest";
import {
  ambienceDataSchema,
  getSceneGraphStore,
  NODE_KINDS,
  artifactDataSchema,
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
    expect(NODE_KINDS).toContain("artifact");
    expect(NODE_KINDS).toContain("zone");
  });

  it("accepts valid prop data and rejects unknown keys", () => {
    expect(
      artifactDataSchema.parse({ glyph: "fire", radiusM: 0.75, soundSource: true }),
    ).toEqual({ glyph: "fire", radiusM: 0.75, soundSource: true });
    expect(() => artifactDataSchema.parse({ pixels: 40 })).toThrow();
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

describe("prop ref rules (ref-optional kind)", () => {
  it("accepts icon in prop data and still tolerates legacy glyph", () => {
    expect(artifactDataSchema.parse({ icon: "tent", widthM: 4, heightM: 3 })).toEqual({
      icon: "tent",
      widthM: 4,
      heightM: 3,
    });
    expect(artifactDataSchema.parse({ glyph: "▲" })).toEqual({ glyph: "▲" });
  });

  it("still rejects refIds on kinds that never allow them", async () => {
    await expect(
      getSceneGraphStore().createNode({
        sceneId: "scene_1",
        kind: "zone",
        refId: "prop_asset_ref",
        label: "The tent",
        data: { shape: "rect", widthM: 4, heightM: 3 },
      }),
    ).rejects.toThrow("must not carry refId");
  });

  it("does not reject a ref-backed prop at the validation layer", async () => {
    // Props are ref-OPTIONAL: the refId gate must pass; the next check is
    // asset existence, which needs a database — absent one, the error is
    // about the DB, never "must not carry refId".
    await expect(
      getSceneGraphStore().createNode({
        sceneId: "scene_1",
        kind: "artifact",
        refId: "some_prop_asset",
        label: "Tent",
        data: { icon: "tent" },
      }),
    ).rejects.toThrow(/DATABASE_URL|not found/);
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
