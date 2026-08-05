import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), fetchLiveSceneJournal: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@kawabunga/live-scene/server", () => ({
  fetchLiveSceneJournal: mocks.fetchLiveSceneJournal,
}));

import { GET } from "./route";

const context = {
  params: Promise.resolve({ sceneId: "scene-1", sessionId: "someone-elses-session" }),
};

describe("admin live-scene journal route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses admin auth as its only viewer gate", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mocks.fetchLiveSceneJournal.mockResolvedValue({
      status: 200,
      body: {
        session: { id: "someone-elses-session", userId: "admin-2" },
        turns: [], events: [], cursors: { turns: null, events: null },
        truncated: { turns: false, events: false }, serverTime: "now",
      },
    });
    const response = await GET(
      new Request("http://admin.test/api/journal?eventsSince=2026-08-05T10%3A00%3A00.000Z"),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.fetchLiveSceneJournal).toHaveBeenCalledWith({
      sceneId: "scene-1",
      sessionId: "someone-elses-session",
      turnsSince: null,
      eventsSince: "2026-08-05T10:00:00.000Z",
    });
  });

  it("conceals journal data from non-admin viewers", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "visitor", role: "user" } });
    const response = await GET(new Request("http://admin.test/api/journal"), context);
    expect(response.status).toBe(404);
    expect(mocks.fetchLiveSceneJournal).not.toHaveBeenCalled();
  });
});
