import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getSceneById: vi.fn(),
  createSession: vi.fn(),
  appendEvent: vi.fn(),
}));

vi.mock("../../../../../lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@kawabunga/db", () => ({
  getSceneStore: () => ({ getSceneById: mocks.getSceneById }),
  getSceneSessionStore: () => ({
    createSession: mocks.createSession,
    appendEvent: mocks.appendEvent,
  }),
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ sceneId: "draft-scene" }) };

describe("draft consumer entry gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSceneById.mockResolvedValue({ id: "draft-scene", status: "draft" });
  });

  it("returns a network-layer 404 when a non-staff viewer enters a draft", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "visitor", role: "user" } });
    const response = await POST(
      new Request("http://web.test/api/scenes/draft-scene/enter", { method: "POST" }) as never,
      context,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Scene not found." });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("creates a staff-owned voice session for draft preview", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mocks.createSession.mockResolvedValue({ id: "session-1" });
    const response = await POST(
      new Request("http://web.test/api/scenes/draft-scene/enter", { method: "POST" }) as never,
      context,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://web.test/scenes/draft-scene/session/session-1",
    );
    expect(mocks.createSession).toHaveBeenCalledWith({
      userId: "admin-1",
      sceneId: "draft-scene",
      mode: "voice",
      metadata: { source: "web-lander" },
    });
  });
});
