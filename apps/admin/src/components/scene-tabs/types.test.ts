import { describe, expect, it } from "vitest";
import {
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
