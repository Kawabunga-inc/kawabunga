import { describe, expect, it } from "vitest";
import type { SceneSessionTurnRecord } from "@kawabunga/db";
import type {
  JournalDecisionItem,
  JournalReflectionItem,
  SessionJournalItem,
} from "@/components/session-journal";
import {
  buildTurnCausality,
  directorClockSlice,
  inspectorAnchorFor,
  journalOrdinal,
} from "./turn-causality";

const origin = Date.parse("2026-08-04T12:00:00.000Z");
const at = (seconds: number) => new Date(origin + seconds * 1000).toISOString();

function turn(id: string, index: number, start: number, end = start + 1) {
  return {
    id,
    sessionId: "session",
    turnIndex: index,
    inputMode: "voice",
    status: "completed",
    startedAt: at(start),
    completedAt: at(end),
    tokenUsage: {},
    audioMetrics: {},
    latencySummary: {},
    trace: {},
    metadata: {},
    createdAt: at(start),
    updatedAt: at(end),
  } satisfies SceneSessionTurnRecord;
}

function decision(
  id: string,
  index: number | null,
  created: number,
  action = "speak",
): JournalDecisionItem {
  return {
    kind: "decision",
    id,
    createdAt: at(created),
    createdMs: origin + created * 1000,
    eventType: `scene.decision.${action}`,
    action,
    speakerSlug: action === "narrate" ? null : "sarah",
    trigger: null,
    userText: null,
    latencyMs: 20,
    provider: null,
    model: null,
    degraded: false,
    reason: null,
    failure: null,
    recovered: null,
    cascadeDepth: null,
    worldEventDirective: null,
    narrationAudioMs: null,
    reactionReadyMs: null,
    gapMs: null,
    speculation: null,
    beat: null,
    sceneCue: null,
    previousState: null,
    nextState: index == null ? null : { beat: null, presentCharacterSlugs: [], ambience: null, lastSpeakerSlug: null, turnIndex: index, directorNote: null, arcLanded: [] },
    decisionRaw: {},
  } satisfies JournalDecisionItem;
}

function reflection(id: string, created: number) {
  return {
    kind: "reflection",
    id,
    createdAt: at(created),
    createdMs: origin + created * 1000,
    model: null,
    latencyMs: null,
    raw: null,
    note: null,
    factsAdded: [],
    landedAdded: [],
    gone: [],
    statesChanged: [],
    chronicleBefore: null,
    chronicleAfter: null,
    spokenTurns: null,
    error: null,
  } satisfies JournalReflectionItem;
}

describe("turn causality", () => {
  it("links the normal decision → turn → reflection chain by exact index", () => {
    const t = turn("turn-2", 2, 2);
    const d = decision("decision-2", 2, 1);
    const r = reflection("reflection-1", 4);
    const graph = buildTurnCausality([t], [d, r]);

    expect(graph.decisionByTurnId.get(t.id)?.id).toBe(d.id);
    expect(graph.turnByDecisionId.get(d.id)?.id).toBe(t.id);
    expect(graph.reflectionByTurnId.get(t.id)?.id).toBe(r.id);
    expect(graph.turnsByReflectionId.get(r.id)?.map((item) => item.id)).toEqual([t.id]);
  });

  it("keeps adjacent chain and momentum decisions one-to-one", () => {
    const turns = [turn("turn-3", 3, 3), turn("turn-4", 4, 5)];
    const items = [decision("chain", 3, 2), decision("momentum", 4, 4)];
    const graph = buildTurnCausality(turns, items);

    expect(graph.decisionByTurnId.get("turn-3")?.id).toBe("chain");
    expect(graph.decisionByTurnId.get("turn-4")?.id).toBe("momentum");
  });

  it("links narrate → react pairs without reusing either decision", () => {
    const turns = [turn("narration", 6, 7), turn("reaction", 7, 9)];
    const items = [
      decision("narrate", 6, 6, "narrate"),
      decision("react", 7, 8, "speak"),
    ];
    const graph = buildTurnCausality(turns, items);

    expect(graph.turnByDecisionId.get("narrate")?.id).toBe("narration");
    expect(graph.turnByDecisionId.get("react")?.id).toBe("reaction");
  });

  it("leaves pre-journal turns unlinked", () => {
    const graph = buildTurnCausality([turn("legacy", 0, 1)], []);
    expect(graph.decisionByTurnId.get("legacy")).toBeUndefined();
    expect(graph.reflectionByTurnId.get("legacy")).toBeUndefined();
  });

  it("bounds a reflection to the three most recent completed turns", () => {
    const turns = [
      turn("too-old", 0, 0, 1),
      turn("one", 1, 2, 3),
      turn("two", 2, 4, 5),
      turn("three", 3, 6, 7),
    ];
    const r = reflection("reflection", 8);
    const graph = buildTurnCausality(turns, [r]);

    expect(graph.reflectionByTurnId.has("too-old")).toBe(false);
    expect(graph.turnsByReflectionId.get(r.id)?.map((item) => item.id)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("falls back to the nearest preceding speak/narrate decision", () => {
    const t = turn("turn", 9, 10);
    const ignored = decision("wait", null, 9, "wait-for-user");
    const nearest = decision("nearest", null, 8, "speak");
    const older = decision("older", null, 4, "speak");
    const graph = buildTurnCausality(t ? [t] : [], [older, nearest, ignored]);

    expect(graph.decisionByTurnId.get(t.id)?.id).toBe(nearest.id);
  });

  it("maps all causal entities to their uniform inspector anchors", () => {
    expect(inspectorAnchorFor("turn")).toBe("pipeline");
    expect(inspectorAnchorFor("decision")).toBe("director");
    expect(inspectorAnchorFor("reflection")).toBe("chronicle");
    const items: SessionJournalItem[] = [decision("d1", 1, 1), reflection("r1", 2), decision("d2", 2, 3)];
    expect(journalOrdinal(items, items[2] as JournalDecisionItem)).toBe(2);
  });

  it("charges only a speculation hit's await to the turn clock", () => {
    const hit = decision("hit", 1, 1);
    hit.latencyMs = 610;
    hit.speculation = { outcome: "hit", basedOnText: "hello", waitedMs: 12 };
    const miss = decision("miss", 2, 2);
    miss.latencyMs = 540;
    miss.speculation = { outcome: "miss", basedOnText: "hello", waitedMs: 9 };

    expect(directorClockSlice(hit)).toMatchObject({
      durationMs: 12,
      fullLatencyMs: 610,
      ranDuringEndpointHold: true,
    });
    expect(directorClockSlice(miss)).toMatchObject({
      durationMs: 540,
      fullLatencyMs: 540,
      ranDuringEndpointHold: false,
    });
  });
});
