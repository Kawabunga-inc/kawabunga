// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  live: {
    stage: "connected" as string,
    error: null as string | null,
    agentLevel: 0,
    micLevel: 0.18,
    begin: vi.fn(),
    leave: vi.fn(),
    switchAudioInput: vi.fn(),
    switchAudioOutput: vi.fn(),
  },
  audio: {
    inputs: [
      { deviceId: "default", label: "System default microphone" },
      { deviceId: "mic-2", label: "Studio microphone" },
    ],
    outputs: [
      { deviceId: "default", label: "System default speaker" },
      { deviceId: "speaker-2", label: "Desk speakers" },
    ],
    selectedInputId: "default",
    selectedOutputId: "default",
    selectedInputLabel: "System default microphone",
    selectedOutputLabel: "System default speaker",
    permission: "granted" as string,
    previewLevel: 0.22,
    previewActive: true,
    checkingInput: false,
    testingOutput: false,
    error: null as string | null,
    outputSwitchSupported: true,
    outputPickerSupported: false,
    refreshDevices: vi.fn(),
    checkInput: vi.fn(),
    selectInput: vi.fn(),
    selectOutput: vi.fn(),
    chooseOutput: vi.fn(),
    testOutput: vi.fn(),
    prepareForJoin: vi.fn(),
    stopPreview: vi.fn(),
    reportError: vi.fn(),
  },
}));

vi.mock("../hooks/use-live-scene", () => ({
  useLiveScene: () => mocks.live,
}));
vi.mock("../hooks/use-scene-audio-devices", () => ({
  useSceneAudioDevices: () => mocks.audio,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.live.stage = "connected";
    mocks.live.error = null;
    mocks.audio.permission = "granted";
    mocks.audio.error = null;
    mocks.audio.prepareForJoin.mockResolvedValue({
      audioInputDeviceId: "mic-2",
      audioOutputDeviceId: "speaker-2",
    });
  });
  afterEach(cleanup);

  it("can open directly into admin instrumentation", () => {
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
        initialView="session"
      />,
    );

    expect(screen.getByRole("region", { name: "Live scene session instrumentation" }))
      .toBeTruthy();
    expect(screen.getByRole("tab", { name: /Session ADMIN/i }).getAttribute("aria-selected"))
      .toBe("true");
  });

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

  it("shows managed input and output diagnostics when microphone access fails", async () => {
    mocks.live.stage = "denied";
    mocks.live.error = "Permission denied";
    mocks.audio.permission = "denied";
    mocks.audio.error = "Allow the microphone in browser site controls.";

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

    expect(screen.getByRole("region", { name: "Audio setup" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Input device" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Output device" })).toBeTruthy();
    expect(screen.getByText("Studio microphone")).toBeTruthy();
    expect(screen.getByText("Desk speakers")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(mocks.audio.checkInput).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Test speaker" }));
    expect(mocks.audio.testOutput).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Enter with these devices" }));

    await waitFor(() => {
      expect(mocks.live.begin).toHaveBeenCalledWith({
        audioInputDeviceId: "mic-2",
        audioOutputDeviceId: "speaker-2",
      });
    });
  });

  it("keeps audio device management available while the room is live", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Audio devices" }));
    expect(screen.getByRole("dialog", { name: "Audio devices" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Input device" }), {
      target: { value: "mic-2" },
    });
    expect(mocks.audio.selectInput).toHaveBeenCalledWith("mic-2");
  });
});
