import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), getSession: vi.fn(), listTurnsUpdatedSince: vi.fn(), listEventsSince: vi.fn(),
}));

vi.mock("../../../../../../../lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@kawabunga/db", () => ({ getSceneSessionStore: () => mocks }));

import { GET } from "./route";

const session = {
  id: "session-1", sceneId: "scene-1", userId: "someone-else", mode: "voice", status: "active",
  startedAt: "2026-08-04T10:00:00.000Z", lastActiveAt: "2026-08-04T10:00:01.000Z",
};
const context = { params: Promise.resolve({ sceneId: "scene-1", sessionId: "session-1" }) };
const request = () => new Request("http://localhost/api/scenes/scene-1/session/session-1/journal");

describe("GET consumer staff session journal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(session);
    mocks.listTurnsUpdatedSince.mockResolvedValue([]);
    mocks.listEventsSince.mockResolvedValue([]);
  });

  it("returns 401 signed out without touching session data", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET(request(), context);
    expect(response.status).toBe(401);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.listEventsSince).not.toHaveBeenCalled();
  });

  it("returns a data-empty 404 to nonstaff without touching session data", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "visitor", role: "user" } });
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.listEventsSince).not.toHaveBeenCalled();
  });

  it("lets staff inspect another user's session with the A2 cursor shape", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin", role: "admin" } });
    const response = await GET(request(), context);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.session.userId).toBe("someone-else");
    expect(body).toMatchObject({
      turns: [], events: [], cursors: { turns: null, events: null },
      truncated: { turns: false, events: false },
    });
    expect(mocks.listEventsSince).toHaveBeenCalledWith("session-1", "1970-01-01T00:00:00.000Z", 501);
  });

  it("conceals a session whose scene does not match the route", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin", role: "admin" } });
    mocks.getSession.mockResolvedValue({ ...session, sceneId: "scene-2" });
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(mocks.listEventsSince).not.toHaveBeenCalled();
  });
});
