import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ getDb: () => null }));

import { getSceneSessionStore } from "./scene-session-store";

describe("scene session live cursors (memory store)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T10:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("returns a turn again after its mutable row is updated", async () => {
    const store = getSceneSessionStore();
    const sessionId = "live-cursor-turn-update";
    await store.createSession({ id: sessionId, mode: "voice" });

    vi.setSystemTime(new Date("2026-08-04T10:00:01.000Z"));
    await store.upsertTurn({
      id: "turn-1",
      sessionId,
      inputMode: "voice",
      status: "streaming",
      assistantText: "Hel",
    });
    const first = await store.listTurnsUpdatedSince(
      sessionId,
      "1970-01-01T00:00:00.000Z",
    );
    expect(first).toHaveLength(1);
    expect(first[0]?.status).toBe("streaming");
    const cursor = first[0]!.updatedAt;

    vi.setSystemTime(new Date("2026-08-04T10:00:02.000Z"));
    await store.upsertTurn({
      id: "turn-1",
      sessionId,
      inputMode: "voice",
      status: "completed",
      assistantText: "Hello",
      completedAt: "2026-08-04T10:00:02.000Z",
    });
    const incremental = await store.listTurnsUpdatedSince(sessionId, cursor);

    expect(incremental).toHaveLength(1);
    expect(incremental[0]).toMatchObject({
      id: "turn-1",
      status: "completed",
      assistantText: "Hello",
    });
    expect(incremental[0]!.updatedAt > cursor).toBe(true);
  });

  it("returns events strictly after the cursor in chronological order", async () => {
    const store = getSceneSessionStore();
    const sessionId = "live-cursor-event-strict";
    await store.createSession({ id: sessionId, mode: "chat" });
    await store.appendEvent({
      id: "event-at-cursor",
      sessionId,
      type: "scene.decision.wait",
      source: "orchestrator",
      createdAt: "2026-08-04T10:00:01.000Z",
    });
    await store.appendEvent({
      id: "event-later",
      sessionId,
      type: "scene.decision.speak",
      source: "orchestrator",
      createdAt: "2026-08-04T10:00:02.000Z",
    });

    const events = await store.listEventsSince(
      sessionId,
      "2026-08-04T10:00:01.000Z",
    );

    expect(events.map((event) => event.id)).toEqual(["event-later"]);
  });

  it("honors collection caps and returns empty pages without synthetic rows", async () => {
    const store = getSceneSessionStore();
    const sessionId = "live-cursor-cap";
    await store.createSession({ id: sessionId, mode: "mixed" });
    for (let index = 1; index <= 3; index += 1) {
      await store.appendEvent({
        id: `cap-event-${index}`,
        sessionId,
        type: "test.event",
        source: "system",
        createdAt: `2026-08-04T10:00:0${index}.000Z`,
      });
    }

    const capped = await store.listEventsSince(
      sessionId,
      "1970-01-01T00:00:00.000Z",
      2,
    );
    const empty = await store.listEventsSince(
      sessionId,
      "2026-08-04T10:00:03.000Z",
    );

    expect(capped.map((event) => event.id)).toEqual([
      "cap-event-1",
      "cap-event-2",
    ]);
    expect(empty).toEqual([]);
  });

  it("initializes a deferred scene snapshot without replacing later state", async () => {
    const store = getSceneSessionStore();
    const sessionId = "deferred-scene-snapshot";
    await store.createSession({ id: sessionId, mode: "voice" });

    await store.initializeSceneState({
      sessionId,
      initialScene: { beat: "opening" },
      currentScene: { beat: "opening" },
    });
    await store.updateCurrentScene({
      sessionId,
      currentScene: { beat: "later" },
    });
    await store.initializeSceneState({
      sessionId,
      initialScene: { beat: "replacement" },
      currentScene: { beat: "replacement" },
    });

    expect(await store.getSession(sessionId)).toMatchObject({
      initialScene: { beat: "opening" },
      currentScene: { beat: "later" },
    });
  });

  it("lists only the requested user's sessions in newest-first pages", async () => {
    const store = getSceneSessionStore();

    vi.setSystemTime(new Date("2026-08-04T10:01:00.000Z"));
    await store.createSession({ id: "visit-older", userId: "visitor-c5", mode: "voice" });
    vi.setSystemTime(new Date("2026-08-04T10:02:00.000Z"));
    await store.createSession({ id: "visit-other-user", userId: "someone-else", mode: "voice" });
    vi.setSystemTime(new Date("2026-08-04T10:03:00.000Z"));
    await store.createSession({ id: "visit-newer", userId: "visitor-c5", mode: "voice" });

    const page = await store.listSessionsForUser("visitor-c5", 2);

    expect(page.map((session) => session.id)).toEqual(["visit-newer", "visit-older"]);
    expect(page.every((session) => session.userId === "visitor-c5")).toBe(true);
  });
});
