import { describe, expect, it } from "vitest";
import { sceneDefinitionSchema } from "@kawabunga/types";
import { resolveSceneExperienceFields, selectDefaultAmbienceTrackId } from "./scene-store";

const baseNode = {
  kind: "ambience" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  refId: null,
  data: {},
};

describe("scene ambience resolution", () => {
  it("uses the default ambience node track id", () => {
    expect(
      selectDefaultAmbienceTrackId(
        [
          {
            ...baseNode,
            id: "node_b",
            data: { trackId: "tent-evening", isDefault: true },
          },
        ],
        "legacy-track",
      ),
    ).toBe("tent-evening");
  });

  it("falls back to scene definition ambience when no ambience node is default", () => {
    expect(
      selectDefaultAmbienceTrackId(
        [
          {
            ...baseNode,
            id: "node_b",
            data: { trackId: "tent-evening" },
          },
        ],
        "legacy-track",
      ),
    ).toBe("legacy-track");
  });

  it("resolves multiple default ambience nodes deterministically", () => {
    expect(
      selectDefaultAmbienceTrackId(
        [
          {
            ...baseNode,
            id: "node_b",
            createdAt: "2026-01-01T00:00:00.000Z",
            data: { trackId: "second", isDefault: true },
          },
          {
            ...baseNode,
            id: "node_a",
            createdAt: "2026-01-01T00:00:00.000Z",
            data: { trackId: "first", isDefault: true },
          },
        ],
        null,
      ),
    ).toBe("first");
  });

  it("prefers a library-backed audio bed over legacy ambience nodes", () => {
    expect(
      selectDefaultAmbienceTrackId(
        [
          {
            ...baseNode,
            id: "node_legacy",
            data: { trackId: "legacy-bed", isDefault: true },
          },
          {
            kind: "audio" as const,
            id: "node_audio",
            createdAt: "2026-01-02T00:00:00.000Z",
            refId: "asset_1",
            data: { role: "bed", isDefault: true },
          },
        ],
        null,
        new Map([["asset_1", "tent-evening"]]),
      ),
    ).toBe("tent-evening");
  });

  it("falls through to legacy ambience when the audio bed slug is unresolvable", () => {
    expect(
      selectDefaultAmbienceTrackId(
        [
          {
            kind: "audio" as const,
            id: "node_audio",
            createdAt: "2026-01-02T00:00:00.000Z",
            refId: "asset_1",
            data: { role: "bed", isDefault: true },
          },
          {
            ...baseNode,
            id: "node_legacy",
            data: { trackId: "legacy-bed", isDefault: true },
          },
        ],
        null,
        new Map(),
      ),
    ).toBe("legacy-bed");
  });
});

describe("scene experience resolution", () => {
  it("lifts configured definition dials into the runtime scene shape", () => {
    const definition = sceneDefinitionSchema.parse({
      initiative: "narrator",
      userRole: "character",
      userCharacter: {
        name: "Miriam",
        blurb: "A royal archivist.",
        relationship: "Ada's former patron",
      },
      userDirector: false,
    });
    expect(resolveSceneExperienceFields(definition)).toEqual({
      initiative: "narrator",
      userRole: "character",
      userCharacter: {
        name: "Miriam",
        blurb: "A royal archivist.",
        relationship: "Ada's former patron",
      },
      userDirector: false,
    });
  });

  it("omits legacy null defaults from the runtime shape", () => {
    expect(resolveSceneExperienceFields(sceneDefinitionSchema.parse({}))).toEqual({});
  });
});
