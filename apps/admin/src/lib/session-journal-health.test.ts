import { describe, expect, it } from "vitest";
import type { SceneSessionEventRecord } from "@kawabunga/db";
import { aggregateSessionJournalHealth } from "./session-journal-health";

function event(
  id: string,
  type: string,
  payload: Record<string, unknown>,
): SceneSessionEventRecord {
  return {
    id,
    sessionId: "session-1",
    turnId: null,
    type,
    source: "test",
    payload,
    createdAt: `2026-08-05T10:00:0${id}.000Z`,
  };
}

describe("aggregateSessionJournalHealth", () => {
  it("aggregates decisions, degradation, speculation, latency, and reflections", () => {
    const health = aggregateSessionJournalHealth([
      event("1", "scene.decision.speak", {
        latencyMs: 100,
        speculation: { outcome: "hit" },
      }),
      event("2", "scene.decision.narrate", {
        degraded: true,
        recovered: "fallback-speaker",
        latencyMs: 300,
        speculation: { outcome: "miss" },
      }),
      event("3", "scene.decision.wait-for-user", {
        failure: "provider timeout",
        speculation: { outcome: "none" },
      }),
      event("4", "scene.reflection", { note: "thread advanced" }),
      event("5", "scene.reflection", { error: "chronicler unavailable" }),
      event("6", "turn.completed", {}),
    ]);

    expect(health).toEqual({
      decisionCount: 3,
      degradedCount: 2,
      recoveredCount: 1,
      specHitRate: 0.5,
      avgDecisionMs: 200,
      reflectionCount: 2,
      reflectionFailures: 1,
    });
  });

  it("keeps honest nulls when the journal has no comparable samples", () => {
    expect(aggregateSessionJournalHealth([])).toEqual({
      decisionCount: 0,
      degradedCount: 0,
      recoveredCount: 0,
      specHitRate: null,
      avgDecisionMs: null,
      reflectionCount: 0,
      reflectionFailures: 0,
    });
  });
});
