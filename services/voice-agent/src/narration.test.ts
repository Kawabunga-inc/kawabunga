import { describe, expect, it } from "vitest";
import { buildNarrationTurnRecord, streamNarration } from "./narration";

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

/* ── streamNarration retry ──────────────────────────────────────────────
 * A narration beat has no fallback anywhere — unlike the character path,
 * which carries ttsFallbackRouting — so one transient provider error used to
 * cost the scene a beat that nothing replays. Observed live in c22c0895:
 * 118 characters, status failed, audioDurationMs 0, at scene open.
 */

const FRAME = { type: "audio" as const, pcmFloat32Base64: Buffer.alloc(4).toString("base64"), sampleRate: 24000 };

function fakeAudioSource() {
  const frames: unknown[] = [];
  return {
    frames,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    source: { captureFrame: async (f: unknown) => void frames.push(f) } as any,
  };
}

/** An adapter whose per-attempt behaviour is scripted. */
function scriptedRouting(attempts: Array<"error" | "audio-then-error" | "ok">) {
  let attempt = 0;
  return {
    provider: "elevenlabs",
    voiceContext: { slug: "narrator" },
    adapter: {
      // eslint-disable-next-line require-yield
      async *stream() {
        const behaviour = attempts[attempt++] ?? "ok";
        if (behaviour === "error") {
          yield { type: "error" as const, message: "provider blew up" };
          return;
        }
        yield FRAME;
        if (behaviour === "audio-then-error") {
          yield { type: "error" as const, message: "died mid-line" };
          return;
        }
        yield FRAME;
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("streamNarration retry", () => {
  it("retries a silent failure and delivers the beat", async () => {
    const { source, frames } = fakeAudioSource();
    const retries: unknown[] = [];
    await streamNarration({
      routing: scriptedRouting(["error", "ok"]),
      text: "A distant owl hoots.",
      audioSource: source,
      onRetry: (e) => retries.push(e),
    });
    expect(retries).toHaveLength(1);
    expect(frames.length).toBeGreaterThan(0); // the beat was heard
  });

  it("does NOT retry once the visitor has heard audio", async () => {
    // Starting over would speak the opening words twice, and that cannot be
    // un-heard. A truncated line is the lesser harm.
    const { source } = fakeAudioSource();
    const retries: unknown[] = [];
    await expect(
      streamNarration({
        routing: scriptedRouting(["audio-then-error", "ok"]),
        text: "A distant owl hoots.",
        audioSource: source,
        onRetry: (e) => retries.push(e),
      }),
    ).rejects.toThrow(/died mid-line/);
    expect(retries).toHaveLength(0);
  });

  it("gives up after one retry rather than looping", async () => {
    const { source } = fakeAudioSource();
    await expect(
      streamNarration({
        routing: scriptedRouting(["error", "error"]),
        text: "A distant owl hoots.",
        audioSource: fakeAudioSource().source,
      }),
    ).rejects.toThrow(/provider blew up/);
    void source;
  });

  it("keeps two concurrent narrations independent", async () => {
    // The first implementation kept "has audio been heard" in module state, so
    // a scene-open line and a world event in flight together would decide each
    // other's retry. This pins that they cannot.
    const a = fakeAudioSource();
    const b = fakeAudioSource();
    const [silentRetries, heardRetries]: unknown[][] = [[], []];
    const silent = streamNarration({
      routing: scriptedRouting(["error", "ok"]),
      text: "one",
      audioSource: a.source,
      onRetry: (e) => silentRetries.push(e),
    });
    const heard = streamNarration({
      routing: scriptedRouting(["audio-then-error", "ok"]),
      text: "two",
      audioSource: b.source,
      onRetry: (e) => heardRetries.push(e),
    }).catch(() => "threw");

    await expect(silent).resolves.toBeUndefined(); // retried
    await expect(heard).resolves.toBe("threw"); // did not retry
    expect(silentRetries).toHaveLength(1);
    expect(heardRetries).toHaveLength(0);
  });
});
