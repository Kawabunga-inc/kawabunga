// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../hooks/use-live-scene", () => ({
  useLiveScene: () => ({
    stage: "connected",
    error: null,
    agentLevel: 0,
    micLevel: 0,
    begin: vi.fn(),
    leave: vi.fn(),
  }),
}));
vi.mock("../hooks/use-scene-captions", () => ({
  useSceneCaptions: () => ({
    state: { visible: true },
    transcript: [],
    historyReady: true,
    current: null,
    previous: null,
    receive: vi.fn(),
    hydrate: vi.fn(),
    setVisible: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock("../hooks/use-scene-session-journal", () => ({
  useSceneSessionJournal: () => ({
    session: null,
    turns: [],
    events: [],
    cursors: { turns: null, events: null },
    error: null,
  }),
}));

import { ScenePlayer } from "./scene-player";

describe("ScenePlayer staff mount", () => {
  it("opens the shared Session view with the host workbench link", () => {
    render(
      <ScenePlayer
        sceneId="scene-1"
        sessionId="session-1"
        title="Draft scene"
        startedAt="2026-08-05T10:00:00.000Z"
        endedAt={null}
        ambience={null}
        arcLength={2}
        provider={{
          join: vi.fn(),
          end: vi.fn(),
          fetchTranscript: vi.fn(),
          fetchJournal: vi.fn(),
        }}
        viewer={{ isStaff: true }}
        landerHref="/scenes/scene-1"
        workbenchHref="/sessions/session-1"
        sessionEnded={false}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Session ADMIN/i }));
    expect(screen.getByRole("region", { name: "Live scene session instrumentation" }))
      .toBeTruthy();
    expect(screen.getByRole("link", { name: "Open full workbench →" }).getAttribute("href"))
      .toBe("/sessions/session-1");
  });
});
