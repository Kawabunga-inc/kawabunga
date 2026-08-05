import { describe, expect, it } from "vitest";
import {
  initialSceneCaptionState,
  parseSceneTranscript,
  sceneCaptionReducer,
  selectAgentCaptionLines,
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
});
