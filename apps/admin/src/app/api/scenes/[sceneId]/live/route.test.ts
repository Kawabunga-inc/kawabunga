import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), createAdminLiveSceneSession: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@kawabunga/live-scene/server", () => ({
  createAdminLiveSceneSession: mocks.createAdminLiveSceneSession,
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ sceneId: "draft-scene" }) };

describe("admin Run live action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates only on an explicit staff POST and redirects to the session page", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mocks.createAdminLiveSceneSession.mockResolvedValue({
      status: 201,
      body: { session: { id: "session-1" } },
    });
    const response = await POST(
      new Request("http://admin.test/api/scenes/draft-scene/live", { method: "POST" }),
      context,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://admin.test/scenes/draft-scene/live?sessionId=session-1",
    );
    expect(mocks.createAdminLiveSceneSession).toHaveBeenCalledWith({
      sceneId: "draft-scene",
      userId: "admin-1",
    });
  });

  it("does not create for a non-admin", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "visitor", role: "user" } });
    const response = await POST(
      new Request("http://admin.test/api/scenes/draft-scene/live", { method: "POST" }),
      context,
    );
    expect(response.status).toBe(404);
    expect(mocks.createAdminLiveSceneSession).not.toHaveBeenCalled();
  });
});
