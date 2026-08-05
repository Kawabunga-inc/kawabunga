import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  notFound: vi.fn(),
  getSceneById: vi.fn(),
  getGraph: vi.fn(),
  listSessionsForUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("../../../lib/auth", () => ({ auth: mocks.auth }));
vi.mock("../../../components/consumer-scene-nav", () => ({ ConsumerSceneNav: () => null }));
vi.mock("../../../components/deep-theme", () => ({ DeepTheme: () => null }));
vi.mock("../../../components/scene-enter-controls", () => ({
  SceneEnterControls: () => null,
  VisitAgainButton: () => null,
}));
vi.mock("@kawabunga/db", () => ({
  getSceneStore: () => ({ getSceneById: mocks.getSceneById }),
  getSceneGraphStore: () => ({ getGraph: mocks.getGraph }),
  getSceneSessionStore: () => ({ listSessionsForUser: mocks.listSessionsForUser }),
  getCharacterStore: () => ({ getById: vi.fn() }),
}));

import SceneLanderPage from "./page";

const props = {
  params: Promise.resolve({ sceneId: "draft-scene" }),
  searchParams: Promise.resolve({}),
};
const draft = {
  id: "draft-scene",
  status: "draft",
  title: "Draft scene",
  prompt: "A private preview.",
  definition: { narrator: "minimal" },
};

describe("draft scene lander", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSceneById.mockResolvedValue(draft);
    mocks.getGraph.mockResolvedValue({ nodes: [], edges: [] });
    mocks.listSessionsForUser.mockResolvedValue([]);
    mocks.notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
  });

  it("returns not-found to non-staff before reading draft graph data", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "visitor", role: "user" } });
    await expect(SceneLanderPage(props)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getGraph).not.toHaveBeenCalled();
  });

  it("renders the warning-amber DRAFT PREVIEW ribbon for staff", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    const page = await SceneLanderPage(props);
    const html = renderToStaticMarkup(createElement(() => page));
    expect(html).toContain("DRAFT PREVIEW · visible only to staff");
  });
});
