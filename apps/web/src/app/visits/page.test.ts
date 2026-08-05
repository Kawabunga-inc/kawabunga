import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn(),
  listSessionsForUser: vi.fn(),
  listEventsForSessions: vi.fn(),
  listTurnsForSessions: vi.fn(),
  getSceneById: vi.fn(),
  getGraph: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../lib/auth", () => ({ auth: mocks.auth }));
vi.mock("../../components/deep-theme", () => ({ DeepTheme: () => null }));
vi.mock("../../components/visits-view", () => ({ VisitsView: () => null }));
vi.mock("../../lib/consumer-scenes", () => ({
  paginateSceneVisits: (sessions: unknown[], visible: number) => ({
    sessions: sessions.slice(0, visible),
    hasMore: sessions.length > visible,
  }),
  sessionDurationLabel: () => "1 min",
  sessionOutcome: () => null,
  visitsSignInPath: () => "/auth/signin?callbackUrl=%2Fvisits",
}));
vi.mock("../../lib/session-activity", () => ({
  classifySessionActivity: () => ({ isActive: false, ageMs: 60_000 }),
}));
vi.mock("../../lib/scene-story", () => ({ sceneTurnsToTranscript: () => [] }));
vi.mock("@kawabunga/db", () => ({
  getSceneSessionStore: () => ({
    listSessionsForUser: mocks.listSessionsForUser,
    listEventsForSessions: mocks.listEventsForSessions,
    listTurnsForSessions: mocks.listTurnsForSessions,
  }),
  getSceneStore: () => ({ getSceneById: mocks.getSceneById }),
  getSceneGraphStore: () => ({ getGraph: mocks.getGraph }),
}));

import VisitsPage from "./page";

describe("My visits route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listSessionsForUser.mockResolvedValue([]);
    mocks.listEventsForSessions.mockResolvedValue([]);
    mocks.listTurnsForSessions.mockResolvedValue([]);
  });

  it("redirects signed-out visitors to sign-in with the safe visits callback", async () => {
    mocks.auth.mockResolvedValue(null);
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });

    await expect(VisitsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "redirect:/auth/signin?callbackUrl=%2Fvisits",
    );
    expect(mocks.listSessionsForUser).not.toHaveBeenCalled();
  });

  it("queries visits with only the authenticated owner's id", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "owner-123", name: "Owner", email: "owner@example.com" },
    });

    await VisitsPage({ searchParams: Promise.resolve({}) });

    expect(mocks.listSessionsForUser).toHaveBeenCalledOnce();
    expect(mocks.listSessionsForUser).toHaveBeenCalledWith("owner-123", 1_000);
  });
});
