import { describe, expect, it } from "vitest";
import { buildNarrationTurnRecord } from "./narration";

const base = {
  turnId: "turn-1",
  sessionId: "session-1",
  text: "The fire gutters; the tent flap lifts in the wind.",
  provider: "pocket_tts",
  voiceSlug: "fable",
  startedAt: new Date("2026-07-28T12:00:00.000Z"),
  completedAt: new Date("2026-07-28T12:00:01.500Z"),
  voiced: true,
};

describe("buildNarrationTurnRecord", () => {
  it("records a voiced narration as a completed narrator turn", () => {
    const record = buildNarrationTurnRecord(base);
    expect(record).toMatchObject({
      id: "turn-1",
      sessionId: "session-1",
      inputMode: "narration",
      speakerSlug: "narrator",
      assistantText: base.text,
      provider: "pocket_tts",
      status: "completed",
    });
    // No userText: narration is the world speaking, not a reply to a message.
    expect(record).not.toHaveProperty("userText");
    expect(record.latencySummary).toEqual({ totalMs: 1500 });
    expect(record.metadata).toEqual({
      source: "voice-agent",
      voiced: true,
      voiceSlug: "fable",
    });
  });

  it("marks an aborted narration so barge-in is distinguishable from a clean line", () => {
    const record = buildNarrationTurnRecord({ ...base, voiced: false, aborted: true });
    expect(record.status).toBe("aborted");
    expect(record.metadata).toMatchObject({ voiced: false });
  });

  it("tolerates an unresolved voice binding (recorded, not voiced)", () => {
    const record = buildNarrationTurnRecord({
      ...base,
      provider: null,
      voiceSlug: null,
      voiced: false,
    });
    expect(record.provider).toBeNull();
    expect(record.status).toBe("completed");
    expect(record.metadata).toEqual({ source: "voice-agent", voiced: false });
  });
});
