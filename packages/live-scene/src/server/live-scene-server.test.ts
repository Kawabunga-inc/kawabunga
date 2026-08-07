import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionDetail: vi.fn(),
  initializeSceneState: vi.fn(),
  createSession: vi.fn(),
  appendEvent: vi.fn(),
  endSession: vi.fn(),
  listTurnsUpdatedSince: vi.fn(),
  listEventsSince: vi.fn(),
  getSceneById: vi.fn(),
  resolveOrchestratorScene: vi.fn(),
  buildSnapshot: vi.fn(() => ({ sceneState: { beat: "opening" } })),
  createInitial: vi.fn(() => ({ beat: "opening" })),
  grants: [] as Array<Record<string, unknown>>,
  roomConfigs: [] as Array<Record<string, unknown>>,
}));

vi.mock("@kawabunga/db", () => ({
  getSceneSessionStore: () => mocks,
  getSceneStore: () => ({
    getSceneById: mocks.getSceneById,
    resolveOrchestratorScene: mocks.resolveOrchestratorScene,
  }),
}));
vi.mock("@kawabunga/orchestration/client", () => ({
  buildSceneSessionSnapshot: mocks.buildSnapshot,
  createInitialSceneState: mocks.createInitial,
}));
vi.mock("livekit-server-sdk", () => ({
  TrackSource: { MICROPHONE: "microphone" },
  AccessToken: class {
    set roomConfig(config: Record<string, unknown>) { mocks.roomConfigs.push(config); }
    addGrant(grant: Record<string, unknown>) { mocks.grants.push(grant); }
    async toJwt() { return "signed-token"; }
  },
}));
vi.mock("@livekit/protocol", () => ({
  RoomAgentDispatch: class {
    constructor(value: Record<string, unknown>) { Object.assign(this, value); }
  },
  RoomConfiguration: class {
    constructor(value: Record<string, unknown>) { Object.assign(this, value); }
  },
}));

import {
  createAdminLiveSceneSession,
  fetchLiveSceneJournal,
  joinLiveScene,
} from "./live-scene-server";

const activeSession = {
  id: "session-1",
  userId: "admin-1",
  sceneId: "draft-scene",
  mode: "voice",
  status: "active",
  startedAt: "2026-08-05T10:00:00.000Z",
  lastActiveAt: "2026-08-05T10:00:00.000Z",
  metadata: { source: "admin-live" },
};

describe("shared live-scene server cores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.grants.length = 0;
    mocks.roomConfigs.length = 0;
    mocks.getSession.mockResolvedValue(activeSession);
    mocks.resolveOrchestratorScene.mockResolvedValue({ characters: [], arc: [] });
    process.env.LIVEKIT_URL = "wss://live.example";
    process.env.LIVEKIT_API_KEY = "key";
    process.env.LIVEKIT_API_SECRET = "secret";
    process.env.LIVEKIT_AGENT_NAME = "test-live-scene-agent";
  });

  it("mints the canonical staff room and initializes a missing snapshot", async () => {
    const result = await joinLiveScene({
      sceneId: "draft-scene",
      sessionId: "session-1",
      identity: "admin-2",
      access: { kind: "staff" },
    });

    expect(result).toEqual({
      status: 200,
      body: { url: "wss://live.example", token: "signed-token" },
    });
    expect(mocks.initializeSceneState).toHaveBeenCalledWith({
      sessionId: "session-1",
      initialScene: { sceneState: { beat: "opening" } },
      currentScene: { sceneState: { beat: "opening" } },
    });
    expect(mocks.grants).toContainEqual(expect.objectContaining({
      room: "scene-draft-scene-session-1",
      roomJoin: true,
      canPublishData: false,
    }));
    expect(mocks.roomConfigs).toEqual([
      expect.objectContaining({
        agents: [
          expect.objectContaining({
            agentName: "test-live-scene-agent",
            metadata: JSON.stringify({
              sceneId: "draft-scene",
              sessionId: "session-1",
              journalVersion: 1,
            }),
          }),
        ],
      }),
    ]);
  });

  it("keeps the consumer join owner-only", async () => {
    const result = await joinLiveScene({
      sceneId: "draft-scene",
      sessionId: "session-1",
      identity: "visitor-2",
      access: { kind: "owner", userId: "visitor-2" },
    });
    expect(result).toMatchObject({ status: 403 });
    expect(mocks.resolveOrchestratorScene).not.toHaveBeenCalled();
  });

  it("creates an owner-attributed admin-live session for existing feeds", async () => {
    mocks.getSceneById.mockResolvedValue({ id: "draft-scene", status: "draft" });
    mocks.createSession.mockResolvedValue(activeSession);

    const result = await createAdminLiveSceneSession({
      sceneId: "draft-scene",
      userId: "admin-1",
    });

    expect(result.status).toBe(201);
    expect(mocks.createSession).toHaveBeenCalledWith({
      userId: "admin-1",
      sceneId: "draft-scene",
      mode: "voice",
      metadata: { source: "admin-live" },
    });
    expect(mocks.appendEvent).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      type: "session.started",
      source: "admin-live",
    }));
  });

  it("serves the shared A2 cursor shape without an ownership gate", async () => {
    mocks.listTurnsUpdatedSince.mockResolvedValue([]);
    mocks.listEventsSince.mockResolvedValue([]);
    const result = await fetchLiveSceneJournal({
      sceneId: "draft-scene",
      sessionId: "session-1",
      turnsSince: null,
      eventsSince: null,
    });
    expect(result).toMatchObject({
      status: 200,
      body: {
        session: activeSession,
        cursors: { turns: null, events: null },
        truncated: { turns: false, events: false },
      },
    });
    expect(mocks.listEventsSince).toHaveBeenCalledWith(
      "session-1",
      "1970-01-01T00:00:00.000Z",
      501,
    );
  });
});
