import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SceneSessionEventRecord,
  SceneSessionRecord,
  SceneSessionTurnRecord,
} from "@kawabunga/db";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listTurnsUpdatedSince: vi.fn(),
  listEventsSince: vi.fn(),
}));

vi.mock("@kawabunga/db", () => ({
  getSceneSessionStore: () => mocks,
}));

import { GET } from "./route";

const SESSION: SceneSessionRecord = {
  id: "session-1",
  mode: "voice",
  status: "active",
  currentScene: { turnIndex: 2 },
  metadata: {},
  startedAt: "2026-08-04T10:00:00.000Z",
  endedAt: null,
  lastActiveAt: "2026-08-04T10:01:00.000Z",
};

function turn(index: number): SceneSessionTurnRecord {
  const timestamp = new Date(
    Date.parse("2026-08-04T10:00:00.000Z") + index * 1000,
  ).toISOString();
  return {
    id: `turn-${index}`,
    sessionId: SESSION.id,
    turnIndex: index,
    inputMode: "voice",
    status: "completed",
    startedAt: timestamp,
    completedAt: timestamp,
    tokenUsage: {},
    audioMetrics: {},
    latencySummary: {},
    trace: {},
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function event(index: number): SceneSessionEventRecord {
  const timestamp = new Date(
    Date.parse("2026-08-04T10:00:00.000Z") + index * 1000,
  ).toISOString();
  return {
    id: `event-${index}`,
    sessionId: SESSION.id,
    turnId: null,
    type: "test.event",
    source: "system",
    payload: { index },
    createdAt: timestamp,
  };
}

function request(query = "") {
  return new Request(
    `http://localhost/api/scene-sessions/${SESSION.id}/live${query}`,
  );
}

const context = { params: Promise.resolve({ sessionId: SESSION.id }) };

describe("GET /api/scene-sessions/[sessionId]/live", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.listTurnsUpdatedSince.mockResolvedValue([]);
    mocks.listEventsSince.mockResolvedValue([]);
  });

  it("hydrates from the beginning and reports honest truncation", async () => {
    const turns = Array.from({ length: 201 }, (_, index) => turn(index + 1));
    const events = Array.from({ length: 501 }, (_, index) => event(index + 1));
    mocks.listTurnsUpdatedSince.mockResolvedValue(turns);
    mocks.listEventsSince.mockResolvedValue(events);

    const response = await GET(request(), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listTurnsUpdatedSince).toHaveBeenCalledWith(
      SESSION.id,
      "1970-01-01T00:00:00.000Z",
      201,
    );
    expect(mocks.listEventsSince).toHaveBeenCalledWith(
      SESSION.id,
      "1970-01-01T00:00:00.000Z",
      501,
    );
    expect(body.turns).toHaveLength(200);
    expect(body.events).toHaveLength(500);
    expect(body.truncated).toEqual({ turns: true, events: true });
    expect(body.cursors).toEqual({
      turns: turns[199]!.updatedAt,
      events: events[499]!.createdAt,
    });
    expect(body.session.currentScene).toEqual({ turnIndex: 2 });
    expect(Date.parse(body.serverTime)).not.toBeNaN();
  });

  it("leaves request cursors unchanged when both pages are empty", async () => {
    const turnsSince = "2026-08-04T10:04:00.000Z";
    const eventsSince = "2026-08-04T10:05:00.000Z";
    const response = await GET(
      request(
        `?turnsSince=${encodeURIComponent(turnsSince)}&eventsSince=${encodeURIComponent(eventsSince)}`,
      ),
      context,
    );
    const body = await response.json();

    expect(body.turns).toEqual([]);
    expect(body.events).toEqual([]);
    expect(body.cursors).toEqual({ turns: turnsSince, events: eventsSince });
    expect(body.truncated).toEqual({ turns: false, events: false });
  });

  it("returns 404 without querying collections for an unknown session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await GET(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.listTurnsUpdatedSince).not.toHaveBeenCalled();
    expect(mocks.listEventsSince).not.toHaveBeenCalled();
  });

  it("rejects malformed cursors", async () => {
    const response = await GET(request("?turnsSince=not-a-date"), context);
    expect(response.status).toBe(400);
  });
});
