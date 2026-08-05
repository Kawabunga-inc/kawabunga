import { describe, expect, it } from "vitest";
import type { SceneSessionTurnRecord } from "@kawabunga/db";
import type { SceneCharacter } from "@kawabunga/types";
import { sceneTurnsToTranscript, visitTimeOfDay } from "./scene-story";

const turn = {
  id: "turn-1",
  sessionId: "session-1",
  inputMode: "voice",
  speakerSlug: "sarah",
  userText: "Are you awake?",
  assistantText: "I have been waiting.",
  status: "completed",
  startedAt: "2026-08-04T18:00:00.000Z",
  tokenUsage: {},
  audioMetrics: {},
  latencySummary: {},
  trace: {},
  metadata: {},
  createdAt: "2026-08-04T18:00:00.000Z",
  updatedAt: "2026-08-04T18:00:01.000Z",
} satisfies SceneSessionTurnRecord;

const sarah = {
  characterSlug: "sarah",
  displayName: "Sarah",
  voice: "sarah",
  blurb: "A watchful host.",
} satisfies SceneCharacter;

describe("sceneTurnsToTranscript", () => {
  it("expands an ordered persisted turn into visitor and scene prose", () => {
    expect(sceneTurnsToTranscript([turn], [sarah])).toMatchObject([
      { role: "user", text: "Are you awake?", speaker: { name: "You" } },
      { role: "agent", text: "I have been waiting.", speaker: { name: "Sarah" } },
    ]);
  });

  it("maps a speaker-less reply to narration", () => {
    expect(sceneTurnsToTranscript([{ ...turn, speakerSlug: null }], [sarah])[1]).toMatchObject({
      speaker: { slug: "narrator", name: "Narrator" },
    });
  });

  it("hydrates only completed turns during a mid-stream refresh", () => {
    const streaming = {
      ...turn,
      id: "turn-streaming",
      status: "streaming",
      userText: "Tell me more.",
      assistantText: "I was walking",
    } satisfies SceneSessionTurnRecord;

    expect(sceneTurnsToTranscript([turn, streaming], [sarah]).map((message) => message.text)).toEqual([
      "Are you awake?",
      "I have been waiting.",
    ]);
  });
});

describe("visitTimeOfDay", () => {
  it("uses the visitor-local hour for the chapter label", () => {
    expect(visitTimeOfDay("2026-08-04T18:00:00.000")).toBe("evening");
  });
});
