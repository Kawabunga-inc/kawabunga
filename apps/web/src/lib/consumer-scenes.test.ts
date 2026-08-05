import { describe, expect, it } from "vitest";
import type { SceneSessionRecord } from "@kawabunga/db";
import type { SceneRecord } from "@kawabunga/types";
import {
  isNewScene,
  NEW_SCENE_WINDOW_MS,
  paginateSceneVisits,
  selectBrowseScenes,
  sessionOutcome,
  visitsSignInPath,
} from "./consumer-scenes";

function scene(id: string, createdAt: string, status: SceneRecord["status"] = "active") {
  return {
    id,
    userId: null,
    title: id,
    prompt: "An authored hook.",
    status,
    definition: {
      nodes: [], edges: [], openingBeat: "", defaultAmbience: null,
      narratorVoiceId: null, openingNarration: null, openingNarrationVariants: null,
      openingMode: null, narrator: null, objective: null, drive: null, stage: null,
      soloCharacterId: null,
    },
    version: 1,
    createdAt,
    updatedAt: createdAt,
  } satisfies SceneRecord;
}

describe("consumer scene browse rules", () => {
  it("keeps the visits auth callback on the local visits route", () => {
    expect(visitsSignInPath()).toBe("/auth/signin?callbackUrl=%2Fvisits");
  });

  it("pages the latest scene visits without letting character-only sessions crowd them out", () => {
    const sessions = [
      { id: "character-only", sceneId: null },
      ...Array.from({ length: 21 }, (_, index) => ({ id: `scene-${index}`, sceneId: "mamre" })),
    ] as SceneSessionRecord[];
    const page = paginateSceneVisits(sessions, 20);

    expect(page.sessions).toHaveLength(20);
    expect(page.sessions[0]?.id).toBe("scene-0");
    expect(page.hasMore).toBe(true);
  });

  it("features the newest active scene deterministically", () => {
    expect(
      selectBrowseScenes([
        scene("z-draft", "2026-08-05T12:00:00.000Z", "draft"),
        scene("b", "2026-08-04T12:00:00.000Z"),
        scene("a", "2026-08-04T12:00:00.000Z"),
        scene("older", "2026-07-01T12:00:00.000Z"),
      ]).map((item) => item.id),
    ).toEqual(["a", "b", "older"]);
  });

  it("uses a strict 14-day NEW boundary with createdAt fallback", () => {
    const now = Date.parse("2026-08-05T12:00:00.000Z");
    expect(isNewScene(scene("inside", new Date(now - NEW_SCENE_WINDOW_MS + 1).toISOString()), now)).toBe(true);
    expect(isNewScene(scene("boundary", new Date(now - NEW_SCENE_WINDOW_MS).toISOString()), now)).toBe(false);
  });

  it("marks the final landed beat complete only when the whole authored arc landed", () => {
    const visit = {
      currentScene: { arcLanded: ["Arrival", "The promise stood"] },
    } as SceneSessionRecord;
    expect(sessionOutcome(visit, 2)).toEqual({ label: "The promise stood", complete: true });
    expect(sessionOutcome(visit, 3)).toEqual({ label: "The promise stood", complete: false });
  });
});
