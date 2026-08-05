import { describe, expect, it } from "vitest";
import {
  matchSceneExperiencePreset,
  SCENE_EXPERIENCE_PRESETS,
  serializeSceneExperienceDials,
} from "./types";

describe("scene experience authoring", () => {
  it("defines Story and Living space as dial presets, not stored types", () => {
    expect(SCENE_EXPERIENCE_PRESETS).toEqual({
      story: { initiative: "narrator", narrator: "scenic", drive: "insistent" },
      livingSpace: { initiative: "user", narrator: "minimal", drive: "gentle" },
    });
  });

  it("serializes configured dials for scene definition persistence", () => {
    expect(
      serializeSceneExperienceDials({
        initiative: "narrator",
        userRole: "character",
        userCharacter: {
          name: " Miriam ",
          blurb: " Royal archivist. ",
          relationship: " Former patron ",
        },
        userDirector: false,
      }),
    ).toEqual({
      initiative: "narrator",
      userRole: "character",
      userCharacter: {
        name: "Miriam",
        blurb: "Royal archivist.",
        relationship: "Former patron",
      },
      userDirector: false,
    });
  });

  it("derives the active mode from the dials, honestly", () => {
    expect(
      matchSceneExperiencePreset({
        initiative: "narrator",
        narrator: "scenic",
        drive: "insistent",
      }),
    ).toBe("story");
    expect(
      matchSceneExperiencePreset({
        initiative: "user",
        narrator: "minimal",
        drive: "gentle",
      }),
    ).toBe("livingSpace");
    // Any hand-set dial breaks the match — the toggle must read Custom.
    expect(
      matchSceneExperiencePreset({
        initiative: "shared",
        narrator: "scenic",
        drive: "insistent",
      }),
    ).toBe(null);
    expect(
      matchSceneExperiencePreset({
        initiative: "narrator",
        narrator: "scenic",
        drive: "balanced",
      }),
    ).toBe(null);
  });

  it("omits legacy defaults from persisted definitions", () => {
    expect(
      serializeSceneExperienceDials({
        initiative: "user",
        userRole: "visitor",
        userCharacter: { name: "", blurb: "", relationship: "" },
        userDirector: true,
      }),
    ).toEqual({
      initiative: null,
      userRole: null,
      userCharacter: null,
      userDirector: null,
    });
  });
});
