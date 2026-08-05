import { describe, expect, it } from "vitest";
import type { SceneSessionJournalFeed, SceneSessionJournalState } from "./scene-session-journal";
import { mergeSceneSessionJournal, shouldPollSceneSessionJournal, timedWorldEventSeconds } from "./scene-session-journal";

const current: SceneSessionJournalState = {
  session: null,
  turns: [{
    id: "turn-1", sessionId: "session-1", inputMode: "voice", status: "streaming",
    assistantText: "Half", startedAt: "2026-08-04T10:00:00.000Z", completedAt: null,
    tokenUsage: {}, audioMetrics: {}, latencySummary: {}, trace: {}, metadata: {},
    createdAt: "2026-08-04T10:00:00.000Z", updatedAt: "2026-08-04T10:00:01.000Z",
  }],
  events: [{ id: "event-1", sessionId: "session-1", type: "scene.started", source: "system", payload: {}, createdAt: "2026-08-04T10:00:00.000Z" }],
  cursors: { turns: "2026-08-04T10:00:01.000Z", events: "2026-08-04T10:00:00.000Z" },
};

function feed(): SceneSessionJournalFeed {
  return {
    session: { id: "session-1", mode: "voice", status: "active", startedAt: "2026-08-04T10:00:00.000Z", lastActiveAt: "2026-08-04T10:00:03.000Z" },
    turns: [{ ...current.turns[0]!, status: "completed", assistantText: "Whole line", updatedAt: "2026-08-04T10:00:03.000Z" }],
    events: [{ id: "event-2", sessionId: "session-1", type: "scene.reflection", source: "system", payload: {}, createdAt: "2026-08-04T10:00:03.000Z" }],
    cursors: { turns: "2026-08-04T10:00:03.000Z", events: "2026-08-04T10:00:03.000Z" },
    truncated: { turns: false, events: false }, serverTime: "2026-08-04T10:00:03.000Z",
  };
}

describe("consumer session journal feed", () => {
  it("replaces mutable turns and appends immutable events", () => {
    const merged = mergeSceneSessionJournal(current, feed());
    expect(merged.turns).toHaveLength(1);
    expect(merged.turns[0]?.assistantText).toBe("Whole line");
    expect(merged.events.map((event) => event.id)).toEqual(["event-1", "event-2"]);
  });

  it("polls only while the staff tab is open, visible, and live", () => {
    expect(shouldPollSceneSessionJournal({ open: true, visible: true, live: true })).toBe(true);
    expect(shouldPollSceneSessionJournal({ open: false, visible: true, live: true })).toBe(false);
    expect(shouldPollSceneSessionJournal({ open: true, visible: false, live: true })).toBe(false);
    expect(shouldPollSceneSessionJournal({ open: true, visible: true, live: false })).toBe(false);
  });

  it("anchors timed events to the reflection and floors an elapsed event at due now", () => {
    const reflection = "2026-08-04T10:00:00.000Z";
    expect(timedWorldEventSeconds(reflection, 30, Date.parse("2026-08-04T10:00:26.200Z"))).toBe(4);
    expect(timedWorldEventSeconds(reflection, 30, Date.parse("2026-08-04T10:00:31.000Z"))).toBe(0);
  });
});
