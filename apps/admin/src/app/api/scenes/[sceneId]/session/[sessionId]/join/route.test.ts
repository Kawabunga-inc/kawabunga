import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), joinLiveScene: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@kawabunga/live-scene/server", () => ({ joinLiveScene: mocks.joinLiveScene }));

import { POST } from "./route";

const context = {
  params: Promise.resolve({ sceneId: "draft-scene", sessionId: "session-1" }),
};

describe("admin live-scene join route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("conceals the route from a non-admin before invoking the shared core", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "visitor", role: "user" } });
    const response = await POST(new Request("http://admin.test"), context);
    expect(response.status).toBe(404);
    expect(mocks.joinLiveScene).not.toHaveBeenCalled();
  });

  it("admits staff to any matching scene session through the staff policy", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mocks.joinLiveScene.mockResolvedValue({
      status: 200,
      body: { url: "wss://live.example", token: "token" },
    });
    const response = await POST(new Request("http://admin.test"), context);
    expect(response.status).toBe(200);
    expect(mocks.joinLiveScene).toHaveBeenCalledWith({
      sceneId: "draft-scene",
      sessionId: "session-1",
      identity: "admin-1",
      access: { kind: "staff" },
    });
  });
});
