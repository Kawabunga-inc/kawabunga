import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  notFound: vi.fn(),
  getSceneById: vi.fn(),
  getSessionDetail: vi.fn(),
  resolveOrchestratorScene: vi.fn(),
  player: vi.fn(() => null),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/session-activity", () => ({
  classifySessionActivity: () => ({ isActive: true }),
}));
vi.mock("@/components/admin-live-scene-player", () => ({
  AdminLiveScenePlayer: mocks.player,
}));
vi.mock("@kawabunga/db", () => ({
  getSceneStore: () => ({
    getSceneById: mocks.getSceneById,
    resolveOrchestratorScene: mocks.resolveOrchestratorScene,
  }),
  getSceneSessionStore: () => ({ getSessionDetail: mocks.getSessionDetail }),
}));

import AdminSceneLivePage from "./page";

const session = {
  id: "session-1",
  sceneId: "draft-scene",
  userId: "admin-1",
  status: "active",
  mode: "voice",
  startedAt: "2026-08-05T10:00:00.000Z",
  lastActiveAt: "2026-08-05T10:00:00.000Z",
};

describe("admin Run live page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mocks.notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
  });

  it("does not create a session from a prefetchable page GET", async () => {
    await expect(AdminSceneLivePage({
      params: Promise.resolve({ sceneId: "draft-scene" }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("NOT_FOUND");
  });

  it("mounts the shared staff player for an existing draft session", async () => {
    mocks.getSceneById.mockResolvedValue({ id: "draft-scene", title: "Draft scene" });
    mocks.getSessionDetail.mockResolvedValue({ session, events: [], turns: [] });
    mocks.resolveOrchestratorScene.mockResolvedValue({ defaultAmbience: "night", arc: [{ id: "a" }] });
    const page = await AdminSceneLivePage({
      params: Promise.resolve({ sceneId: "draft-scene" }),
      searchParams: Promise.resolve({ sessionId: "session-1" }),
    });
    expect(page.type).toBe(mocks.player);
    expect(page.props).toMatchObject({
      sceneId: "draft-scene",
      sessionId: "session-1",
      title: "Draft scene",
      ambience: "night",
      arcLength: 1,
      sessionEnded: false,
    });
  });
});
