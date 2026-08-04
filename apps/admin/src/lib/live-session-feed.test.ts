import { describe, expect, it } from "vitest";
import type {
  SceneSessionDetailRecord,
  SceneSessionEventRecord,
  SceneSessionTurnRecord,
} from "@kawabunga/db";
import {
  cursorsForDetail,
  mergeLiveSessionDetail,
  newestLiveActivityMs,
} from "./live-session-feed";

function turn(
  id: string,
  status: string,
  updatedAt: string,
): SceneSessionTurnRecord {
  return {
    id,
    sessionId: "session-1",
    turnIndex: Number(id.replace("turn-", "")),
    inputMode: "voice",
    assistantText: status === "completed" ? "Complete" : "Comp",
    status,
    startedAt: "2026-08-04T10:00:00.000Z",
    completedAt: status === "completed" ? updatedAt : null,
    tokenUsage: {},
    audioMetrics: {},
    latencySummary: {},
    trace: {},
    metadata: {},
    createdAt: "2026-08-04T10:00:00.000Z",
    updatedAt,
  };
}

function event(id: string, createdAt: string): SceneSessionEventRecord {
  return {
    id,
    sessionId: "session-1",
    turnId: null,
    type: "scene.decision.speak",
    source: "orchestrator",
    payload: {},
    createdAt,
  };
}

function detail(): SceneSessionDetailRecord {
  return {
    session: {
      id: "session-1",
      mode: "voice",
      status: "active",
      metadata: {},
      startedAt: "2026-08-04T10:00:00.000Z",
      endedAt: null,
      lastActiveAt: "2026-08-04T10:00:02.000Z",
    },
    user: null,
    contextBuilds: [],
    turns: [
      turn("turn-1", "streaming", "2026-08-04T10:00:01.000Z"),
      turn("turn-2", "completed", "2026-08-04T10:00:02.000Z"),
    ],
    events: [event("event-1", "2026-08-04T10:00:01.500Z")],
    audioArtifacts: [],
  };
}

describe("live session detail merge", () => {
  it("replaces a mutable streaming turn in place and preserves order", () => {
    const seed = detail();
    const completed = turn(
      "turn-1",
      "completed",
      "2026-08-04T10:00:03.000Z",
    );

    const merged = mergeLiveSessionDetail(seed, {
      session: { ...seed.session, lastActiveAt: completed.updatedAt },
      turns: [completed],
      events: [],
    });

    expect(merged.turns.map((item) => item.id)).toEqual(["turn-1", "turn-2"]);
    expect(merged.turns[0]).toBe(completed);
    expect(merged.turns[0]?.status).toBe("completed");
    expect(merged.contextBuilds).toBe(seed.contextBuilds);
    expect(merged.audioArtifacts).toBe(seed.audioArtifacts);
  });

  it("deduplicates immutable events and appends novel rows in feed order", () => {
    const seed = detail();
    const duplicate = { ...seed.events[0]!, payload: { changed: true } };
    const second = event("event-2", "2026-08-04T10:00:02.500Z");
    const third = event("event-3", "2026-08-04T10:00:03.500Z");

    const merged = mergeLiveSessionDetail(seed, {
      session: seed.session,
      turns: [],
      events: [duplicate, second, third],
    });

    expect(merged.events.map((item) => item.id)).toEqual([
      "event-1",
      "event-2",
      "event-3",
    ]);
    expect(merged.events[0]?.payload).toEqual({});
  });

  it("derives cursors and newest activity from the correct timestamps", () => {
    const seed = detail();
    expect(cursorsForDetail(seed)).toEqual({
      turns: "2026-08-04T10:00:02.000Z",
      events: "2026-08-04T10:00:01.500Z",
    });
    expect(newestLiveActivityMs(seed)).toBe(
      Date.parse("2026-08-04T10:00:02.000Z"),
    );
  });
});
