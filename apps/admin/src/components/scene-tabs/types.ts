export type SceneTab =
  | "overview"
  | "canvas"
  | "cast"
  | "environment"
  | "narrator"
  | "game";

export type SceneInitiative = "user" | "shared" | "narrator";
export type SceneDrive = "gentle" | "balanced" | "insistent";
export type SceneNarrator = "off" | "minimal" | "scenic";
export type SceneUserRole = "visitor" | "character";
export type SceneUserCharacter = {
  name: string;
  blurb: string;
  relationship?: string;
};

/** Authoring conveniences only — presets write the orthogonal dials and are
 * never persisted as an experience-type value. */
export const SCENE_EXPERIENCE_PRESETS = {
  story: {
    initiative: "narrator",
    narrator: "scenic",
    drive: "insistent",
  },
  livingSpace: {
    initiative: "user",
    narrator: "minimal",
    drive: "gentle",
  },
} as const satisfies Record<
  string,
  { initiative: SceneInitiative; narrator: SceneNarrator; drive: SceneDrive }
>;

export function serializeSceneExperienceDials(input: {
  initiative: SceneInitiative;
  userRole: SceneUserRole;
  userCharacter: SceneUserCharacter;
  userDirector: boolean;
}): {
  initiative: SceneInitiative | null;
  userRole: SceneUserRole | null;
  userCharacter: SceneUserCharacter | null;
  userDirector: boolean | null;
} {
  return {
    initiative: input.initiative === "user" ? null : input.initiative,
    userRole: input.userRole === "visitor" ? null : input.userRole,
    userCharacter:
      input.userRole === "character"
        ? {
            name: input.userCharacter.name.trim(),
            blurb: input.userCharacter.blurb.trim(),
            ...(input.userCharacter.relationship?.trim()
              ? { relationship: input.userCharacter.relationship.trim() }
              : {}),
          }
        : null,
    userDirector: input.userDirector ? null : false,
  };
}
