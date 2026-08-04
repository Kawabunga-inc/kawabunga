import { describe, expect, it } from "vitest";
import type { Scene } from "@kawabunga/types";
import {
  createInitialSceneState,
  resolveSceneDecision,
} from "@kawabunga/orchestration/client";
import {
  buildDecisionJournalEntries,
  buildReflectionJournalEntry,
  buildWorldEventArmedJournalEntry,
} from "@kawabunga/orchestration/journal";
import type { SceneSessionEventRecord } from "@kawabunga/db";
import { parseJournalItems } from "./session-journal";

// The producer/consumer contract: entries built by the orchestration
// journal (what the SceneDriver and orchestrate route persist) must read
// back through the workbench parser with nothing lost.

const SCENE: Scene = {
  id: "test-scene",
  title: "Test scene",
  description: "A scene for the journal round-trip.",
  characters: [
    {
      characterSlug: "abraham",
      displayName: "Abraham",
      voice: "abraham",
      blurb: "An old shepherd.",
    },
    {
      characterSlug: "sarah",
      displayName: "Sarah",
      voice: "sarah",
      blurb: "Sharp-tongued and defensive.",
    },
  ],
  openingBeat: "The strangers have just left.",
  defaultAmbience: null,
};

function asEventRow(
  entry: { type: string; source: string; payload: Record<string, unknown> },
  id: string,
  createdAt: string,
): SceneSessionEventRecord {
  return {
    id,
    sessionId: "session-1",
    turnId: null,
    type: entry.type,
    source: entry.source,
    payload: entry.payload,
    createdAt,
  };
}

describe("journal round-trip (orchestration builders → workbench parser)", () => {
  it("reads a decision entry back with trigger, speculation, and state diff", () => {
    const state = createInitialSceneState(SCENE);
    const resolution = resolveSceneDecision(
      { scene: SCENE, sceneState: state },
      { action: "speak", speakerId: "sarah", beat: "Sarah denies the laugh" },
    );
    const entries = buildDecisionJournalEntries(resolution, {
      trigger: "user-turn",
      userText: "Did I hear someone laugh?",
      latencyMs: 812,
      provider: "cerebras",
      model: "gpt-oss-120b",
      speculation: { outcome: "hit", basedOnText: "did i hear someone", waitedMs: 45 },
    });
    expect(entries).toHaveLength(1);

    const items = parseJournalItems([
      asEventRow(entries[0]!, "e1", "2026-08-04T10:00:00.000Z"),
    ]);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    if (item.kind !== "decision") throw new Error("expected a decision item");
    expect(item.eventType).toBe("scene.decision.speak");
    expect(item.action).toBe("speak");
    expect(item.speakerSlug).toBe("sarah");
    expect(item.trigger).toBe("user-turn");
    expect(item.userText).toBe("Did I hear someone laugh?");
    expect(item.latencyMs).toBe(812);
    expect(item.provider).toBe("cerebras");
    expect(item.speculation).toEqual({
      outcome: "hit",
      basedOnText: "did i hear someone",
      waitedMs: 45,
    });
    expect(item.beat).toBe("Sarah denies the laugh");
    expect(item.previousState?.turnIndex).toBe(0);
    expect(item.nextState?.turnIndex).toBe(1);
    expect(item.nextState?.lastSpeakerSlug).toBe("sarah");
  });

  it("flags degraded fallbacks and recovery", () => {
    const state = createInitialSceneState(SCENE);
    const resolution = resolveSceneDecision(
      { scene: SCENE, sceneState: state },
      { action: "speak", speakerId: "nobody-on-roster" },
    );
    expect(resolution.degraded).toBe(true);
    const entries = buildDecisionJournalEntries(resolution, {
      trigger: "user-turn",
      failure: "Cerebras 503: upstream timeout",
      recovered: "fallback-speaker",
    });
    const items = parseJournalItems([
      asEventRow(entries[0]!, "e1", "2026-08-04T10:00:00.000Z"),
    ]);
    const item = items[0]!;
    if (item.kind !== "decision") throw new Error("expected a decision item");
    expect(item.degraded).toBe(true);
    expect(item.failure).toContain("Cerebras 503");
    expect(item.recovered).toBe("fallback-speaker");
  });

  it("reads a reflection entry back with chronicle before/after", () => {
    const entry = buildReflectionJournalEntry({
      sceneId: SCENE.id,
      model: "claude-sonnet-4-5",
      latencyMs: 4200,
      raw: "STORY: The traveler arrived.\nNOTE: Press Sarah.",
      note: "Press Sarah.",
      factsAdded: ["Sarah denied laughing."],
      landedAdded: ["The welcome"],
      gone: [],
      chronicleBefore: null,
      chronicleAfter: {
        story: "The traveler arrived at dusk.",
        threads: ["The laugh is unexplained."],
        world: ["Evening settles."],
        intents: [{ trigger: "the laugh is named", direction: "Sarah deflects" }],
        timed: [{ afterSeconds: 60, direction: "the fire collapses" }],
        drafts: ["Smoke drifts between the tents."],
      },
      spokenTurns: 4,
    });
    const items = parseJournalItems([
      asEventRow(entry, "r1", "2026-08-04T10:01:00.000Z"),
    ]);
    const item = items[0]!;
    if (item.kind !== "reflection") throw new Error("expected a reflection item");
    expect(item.note).toBe("Press Sarah.");
    expect(item.factsAdded).toEqual(["Sarah denied laughing."]);
    expect(item.landedAdded).toEqual(["The welcome"]);
    expect(item.chronicleBefore).toBeNull();
    expect(item.chronicleAfter?.story).toBe("The traveler arrived at dusk.");
    expect(item.chronicleAfter?.intents).toEqual([
      { trigger: "the laugh is named", direction: "Sarah deflects" },
    ]);
    expect(item.chronicleAfter?.timed).toEqual([
      { afterSeconds: 60, direction: "the fire collapses" },
    ]);
    expect(item.spokenTurns).toBe(4);
    expect(item.error).toBeNull();
  });

  it("reads world-event armings and sorts the rail chronologically", () => {
    const state = createInitialSceneState(SCENE);
    const resolution = resolveSceneDecision(
      { scene: SCENE, sceneState: state },
      { action: "wait-for-user" },
    );
    const decision = buildDecisionJournalEntries(resolution, { trigger: "proactive" })[0]!;
    const world = buildWorldEventArmedJournalEntry({
      sceneId: SCENE.id,
      direction: "a distant cry",
      afterSeconds: 90,
      dueAt: "2026-08-04T10:03:00.000Z",
    });
    const items = parseJournalItems([
      asEventRow(world, "w1", "2026-08-04T10:02:00.000Z"),
      asEventRow(decision, "d1", "2026-08-04T10:00:30.000Z"),
    ]);
    expect(items.map((i) => i.kind)).toEqual(["decision", "world-event"]);
    const worldItem = items[1]!;
    if (worldItem.kind !== "world-event") throw new Error("expected a world event");
    expect(worldItem.direction).toBe("a distant cry");
    expect(worldItem.afterSeconds).toBe(90);
  });

  it("ignores non-journal event types", () => {
    const items = parseJournalItems([
      {
        id: "x1",
        sessionId: "session-1",
        turnId: "t1",
        type: "turn.summary",
        source: "llm",
        payload: { summary: "irrelevant" },
        createdAt: "2026-08-04T10:00:00.000Z",
      },
    ]);
    expect(items).toEqual([]);
  });
});
