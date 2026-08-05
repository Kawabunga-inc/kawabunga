import { describe, expect, it } from "vitest";
import { sceneDefinitionSchema, sceneSchema } from "./scene";

describe("scene experience dials", () => {
  it("parses configured runtime and nullable definition forms", () => {
    const userCharacter = {
      name: "Miriam",
      blurb: "A royal archivist carrying a sealed decree.",
      relationship: "the cast's former patron",
    };
    expect(
      sceneDefinitionSchema.parse({
        initiative: "narrator",
        userRole: "character",
        userCharacter,
        userDirector: false,
      }),
    ).toMatchObject({
      initiative: "narrator",
      userRole: "character",
      userCharacter,
      userDirector: false,
    });
    expect(
      sceneSchema.parse({
        id: "role-scene",
        title: "Role scene",
        description: "A test scene.",
        characters: [
          {
            characterSlug: "ada",
            displayName: "Ada",
            voice: "ada",
            blurb: "A witness.",
          },
        ],
        openingBeat: "The room waits.",
        defaultAmbience: null,
        initiative: "narrator",
        userRole: "character",
        userCharacter,
        userDirector: false,
      }),
    ).toMatchObject({
      initiative: "narrator",
      userRole: "character",
      userCharacter,
      userDirector: false,
    });
  });

  it("keeps legacy definitions nullable by default", () => {
    expect(sceneDefinitionSchema.parse({})).toMatchObject({
      initiative: null,
      userRole: null,
      userCharacter: null,
      userDirector: null,
    });
  });
});
