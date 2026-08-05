import { describe, expect, it } from "vitest";
import {
  initialSceneCaptionState,
  parseSceneTranscript,
  sceneCaptionReducer,
  selectAgentCaptionLines,
  selectSceneTranscript,
} from "./scene-captions";

describe("sceneCaptionReducer", () => {
  it("upserts partial transcript text without changing its order", () => {
    const partial = { role: "agent" as const, id: "turn-1", text: "Come", final: false };
    const first = sceneCaptionReducer(initialSceneCaptionState, {
      type: "received",
      message: partial,
    });
    const final = sceneCaptionReducer(first, {
      type: "received",
      message: { ...partial, text: "Come closer.", final: true },
    });
    expect(final.order).toEqual(["turn-1"]);
    expect(final.messages["turn-1"]).toMatchObject({ text: "Come closer.", final: true });
  });

  it("selects the latest two agent lines and ignores user transcripts", () => {
    const messages = [
      { role: "agent" as const, id: "a", text: "First", final: true },
      { role: "user" as const, id: "u", text: "Hello", final: true },
      { role: "agent" as const, id: "b", text: "Second", final: false },
    ];
    const state = messages.reduce(
      (current, message) => sceneCaptionReducer(current, { type: "received", message }),
      initialSceneCaptionState,
    );
    expect(selectAgentCaptionLines(state)).toMatchObject({
      previous: { id: "a" },
      current: { id: "b" },
    });
  });

  it("parses the agent's speaker-bearing data message", () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({
        role: "agent",
        id: "turn-2",
        text: "The fire settles.",
        final: true,
        speaker: { slug: "narrator", name: "Narrator" },
      }),
    );
    expect(parseSceneTranscript(payload)).toMatchObject({
      role: "agent",
      speaker: { slug: "narrator", name: "Narrator" },
    });
  });

  it("keeps hydrated history as the prefix and appends the live tail", () => {
    const history = [
      { role: "user" as const, id: "history:u", text: "Who is there?", final: true },
      { role: "agent" as const, id: "history:a", text: "Only me.", final: true },
    ];
    const hydrated = sceneCaptionReducer(initialSceneCaptionState, {
      type: "hydrated",
      messages: history,
    });
    const live = sceneCaptionReducer(hydrated, {
      type: "received",
      message: { role: "user", id: "live:u", text: "Come closer.", final: true },
    });
    expect(selectSceneTranscript(live).map((message) => message.text)).toEqual([
      "Who is there?",
      "Only me.",
      "Come closer.",
    ]);
  });

  it("absorbs one pre-hydration overlap message", () => {
    const live = sceneCaptionReducer(initialSceneCaptionState, {
      type: "received",
      message: { role: "user", id: "live:u", text: "Who is there?", final: true },
    });
    const hydrated = sceneCaptionReducer(live, {
      type: "hydrated",
      messages: [
        {
          role: "user",
          id: "history:u",
          text: "Who is there?",
          final: true,
          speaker: { slug: "user", name: "You" },
        },
      ],
    });
    expect(selectSceneTranscript(hydrated)).toHaveLength(1);
    expect(selectSceneTranscript(hydrated)[0]?.id).toBe("history:u");
  });

  it("keeps a repeated identical line received after hydration", () => {
    const overlap = sceneCaptionReducer(initialSceneCaptionState, {
      type: "received",
      message: { role: "user", id: "live:overlap", text: "Yes.", final: true },
    });
    const hydrated = sceneCaptionReducer(overlap, {
      type: "hydrated",
      messages: [
        { role: "user", id: "history:yes", text: "Yes.", final: true },
      ],
    });
    const repeated = sceneCaptionReducer(hydrated, {
      type: "received",
      message: { role: "user", id: "live:repeat", text: "Yes.", final: true },
    });

    expect(selectSceneTranscript(repeated).map((message) => message.id)).toEqual([
      "history:yes",
      "live:repeat",
    ]);
  });
});
