import { describe, expect, it } from "vitest";
import type {
  SceneSessionDetailRecord,
  SceneSessionEventRecord,
  SceneSessionRecord,
  SceneSessionTurnRecord,
} from "@kawabunga/db";
import {
  buildSceneOnAirPresentation,
  selectSceneOnAirSessions,
} from "./scene-on-air";

const NOW = Date.parse("2026-08-04T12:00:00.000Z");

function session(
  id: string,
  status: string,
  ageSeconds: number,
): SceneSessionRecord {
  const at = new Date(NOW - ageSeconds * 1000).toISOString();
  return {
    id,
    sceneId: "scene-1",
    mode: "voice",
    status,
    startedAt: at,
    lastActiveAt: at,
  };
}

function turn(
  id: string,
  sessionId: string,
  speakerSlug: string,
  turnIndex: number,
  status = "completed",
  ageSeconds = 2,
): SceneSessionTurnRecord {
  const at = new Date(NOW - ageSeconds * 1000).toISOString();
  return {
    id,
    sessionId,
    turnIndex,
    inputMode: "voice",
    speakerSlug,
    status,
    startedAt: at,
    completedAt: status === "completed" ? at : null,
    tokenUsage: null,
    audioMetrics: null,
    latencySummary: null,
    trace: null,
    metadata: {},
    createdAt: at,
    updatedAt: at,
  };
}

describe("selectSceneOnAirSessions", () => {
  it("uses the exact B3 activity boundary over the scene-scoped rows", () => {
    const sessions = [
      session("fresh-by-turn", "active", 90),
      session("exactly-sixty", "active", 60),
      session("ended", "ended", 1),
    ];
    const turns = [turn("turn-1", "fresh-by-turn", "abraham", 1, "completed", 3)];

    expect(selectSceneOnAirSessions(sessions, [], turns, NOW).map((row) => row.id)).toEqual([
      "fresh-by-turn",
    ]);
  });
});

describe("buildSceneOnAirPresentation", () => {
  it("joins character nodes by server-resolved slug and derives speaking/presence", () => {
    const events: SceneSessionEventRecord[] = [
      {
        id: "event-1",
        sessionId: "live",
        type: "scene.decision.speak",
        source: "orchestration",
        payload: {
          decision: {
            ambience: "night-wind",
            sfx: [{ id: "tent-flap", at: "now" }],
          },
        },
        createdAt: new Date(NOW - 3_000).toISOString(),
      },
    ];
    const detail: SceneSessionDetailRecord = {
      session: {
        ...session("live", "active", 1),
        currentScene: {
          sceneState: {
            beat: "Sarah crosses toward the fire.",
            presentCharacterSlugs: ["sarah"],
            arcLanded: ["arrival"],
          },
        },
      },
      user: null,
      contextBuilds: [],
      turns: [
        turn("a", "live", "abraham", 1, "completed", 8),
        turn("s", "live", "sarah", 2, "streaming", 1),
      ],
      events,
      audioArtifacts: [],
    };

    const result = buildSceneOnAirPresentation({
      detail,
      nodeCharacterSlugs: { "node-a": "abraham", "node-s": "sarah" },
      soundNodeSlugs: { "sound-1": "tent-flap" },
      defaultAmbience: "room-tone",
      nowMs: NOW,
    });

    expect(result.characterByNodeId).toEqual({
      "node-a": { state: "departed", turnNumber: null, lastSpokeTurn: 1 },
      "node-s": { state: "speaking", turnNumber: 2, lastSpokeTurn: null },
    });
    expect(result.beat).toBe("Sarah crosses toward the fire.");
    expect(result.arcLanded).toBe(1);
    expect(result.ambienceSlug).toBe("night-wind");
    expect(result.recentSfxByNodeId["sound-1"]?.ageMs).toBe(3_000);
  });

  it("lights narrator without assigning a character node", () => {
    const detail: SceneSessionDetailRecord = {
      session: {
        ...session("live", "active", 1),
        currentScene: null,
      },
      user: null,
      contextBuilds: [],
      turns: [turn("n", "live", "narrator", 4, "completed", 1)],
      events: [],
      audioArtifacts: [],
    };
    const result = buildSceneOnAirPresentation({
      detail,
      nodeCharacterSlugs: { "node-a": "abraham" },
      soundNodeSlugs: {},
      defaultAmbience: "room-tone",
      nowMs: NOW,
    });

    expect(result.narratorTurnNumber).toBe(4);
    expect(result.characterByNodeId["node-a"]?.state).toBe("present");
    expect(result.ambienceSlug).toBeNull();
  });
});
