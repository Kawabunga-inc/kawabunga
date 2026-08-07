import { describe, expect, it } from "vitest";
import type {
  SceneSessionEventRecord,
  SceneSessionRecord,
  SceneSessionTurnRecord,
} from "@kawabunga/db";
import { aggregateSessionHealthRollup } from "./session-health-rollup";

const session: SceneSessionRecord = {
  id: "session-1",
  mode: "voice",
  status: "ended",
  currentScene: { sceneState: { arcLanded: ["arrival"] } },
  startedAt: "2026-08-05T10:00:00.000Z",
  endedAt: "2026-08-05T10:02:05.000Z",
  lastActiveAt: "2026-08-05T10:02:05.000Z",
};

function turn(id: string, firstAudioMs: number): SceneSessionTurnRecord {
  return {
    id,
    sessionId: session.id,
    inputMode: "voice",
    status: "completed",
    startedAt: "2026-08-05T10:00:00.000Z",
    tokenUsage: {},
    audioMetrics: { firstAudioMs },
    latencySummary: {},
    trace: {},
    metadata: {},
    createdAt: "2026-08-05T10:00:00.000Z",
    updatedAt: "2026-08-05T10:00:01.000Z",
  };
}

function event(payload: Record<string, unknown>): SceneSessionEventRecord {
  return {
    id: "event-1",
    sessionId: session.id,
    type: "scene.decision.speak",
    source: "test",
    payload,
    createdAt: "2026-08-05T10:00:02.000Z",
  };
}

describe("aggregateSessionHealthRollup", () => {
  it("shares p50, duration, journal health, and latest arc progress", () => {
    expect(
      aggregateSessionHealthRollup(
        session,
        [turn("turn-1", 900), turn("turn-2", 1_300), turn("turn-3", 1_100)],
        [
          event({
            degraded: true,
            recovered: "fallback",
            speculation: { outcome: "hit" },
            nextSceneState: { arcLanded: ["arrival", "choice"] },
          }),
        ],
        true,
      ),
    ).toMatchObject({
      turnCount: 3,
      durationLabel: "2m 05s",
      p50FirstAudioMs: 1_100,
      decisionCount: 1,
      degradedCount: 1,
      recoveredCount: 1,
      specHitRate: 1,
      arcLandedCount: 2,
    });
  });

  it("uses honest nulls for pre-journal sessions without an authored arc", () => {
    expect(aggregateSessionHealthRollup(session, [], [], false)).toMatchObject({
      turnCount: 0,
      p50FirstAudioMs: null,
      decisionCount: 0,
      specHitRate: null,
      arcLandedCount: null,
    });
  });
});
