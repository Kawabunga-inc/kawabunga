import { describe, expect, it } from "vitest";
import type { SceneSessionRecord } from "@kawabunga/db";
import {
  characterInitials,
  descriptionExcerpt,
  isPublishableScene,
  latestArcBeatLabel,
  latestSessionForUser,
  safeCallbackPath,
} from "./scene-lander";

describe("consumer scene lander helpers", () => {
  it("only publishes active scenes", () => {
    expect(isPublishableScene("active")).toBe(true);
    expect(isPublishableScene("draft")).toBe(false);
    expect(isPublishableScene("archived")).toBe(false);
  });

  it("keeps at most three authored sentences without inventing copy", () => {
    expect(descriptionExcerpt("One. Two? Three! Four.")).toBe("One. Two? Three!");
    expect(descriptionExcerpt("  One authored thought  ")).toBe("One authored thought");
  });

  it("builds compact character initials", () => {
    expect(characterInitials("Abraham")).toBe("AB");
    expect(characterInitials("Mary Magdalene")).toBe("MM");
  });

  it("reads the most recent landed arc beat", () => {
    expect(latestArcBeatLabel({ arcLanded: ["Arrival", "The promise stands"] })).toBe(
      "The promise stands",
    );
    expect(latestArcBeatLabel({ arcLanded: [] })).toBeNull();
  });

  it("selects the newest scene session belonging to the viewer", () => {
    const sessions = [
      { id: "newest-other", userId: "other" },
      { id: "newest-mine", userId: "me" },
      { id: "older-mine", userId: "me" },
    ] as SceneSessionRecord[];
    expect(latestSessionForUser(sessions, "me")?.id).toBe("newest-mine");
  });

  it("only permits same-origin callback paths", () => {
    expect(safeCallbackPath("/scenes/scene-1?enter=1")).toBe(
      "/scenes/scene-1?enter=1",
    );
    expect(safeCallbackPath("https://example.com")).toBe("/dashboard");
    expect(safeCallbackPath("//example.com")).toBe("/dashboard");
    expect(safeCallbackPath(["/scenes/one", "/scenes/two"])).toBe("/dashboard");
  });
});
