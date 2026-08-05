import { afterEach, describe, expect, it } from "vitest";
import {
  buildLlmSessionCostEntry,
  buildEmbeddingSessionCostEntry,
  buildInfrastructureSessionCostEntry,
  buildSttSessionCostEntry,
  buildStreamingSttOperationId,
  buildTtsSessionCostEntry,
} from "./session-cost";

afterEach(() => {
  delete process.env.LIVEKIT_INFERENCE_PLAN;
  delete process.env.SESSION_COST_STT_USD_PER_MINUTE;
  delete process.env.SESSION_COST_LIVEKIT_SESSION_USD_PER_MINUTE;
  delete process.env.SESSION_COST_EMBEDDING_USD_PER_MILLION_TOKENS;
});

describe("session cost entries", () => {
  it("snapshots character model token pricing", () => {
    const entry = buildLlmSessionCostEntry({
      operationId: "turn-1:character_llm",
      category: "character_llm",
      provider: "cerebras",
      model: "gpt-oss-120b",
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });
    expect(entry.amountUsd).toBe(1.1);
    expect(entry.pricing.map((price) => price.rateUsd)).toEqual([0.35, 0.75]);
  });

  it("prices ElevenLabs Flash by synthesized characters", () => {
    const entry = buildTtsSessionCostEntry({
      operationId: "turn-1:tts:elevenlabs",
      provider: "elevenlabs",
      model: "eleven_flash_v2_5",
      characters: 1_000,
    });
    expect(entry.amountUsd).toBe(0.05);
  });

  it("prices LiveKit Nova-3 from processed audio duration", () => {
    const entry = buildSttSessionCostEntry({
      operationId: "stt:req-1",
      provider: "livekit/deepgram",
      model: "deepgram/nova-3",
      audioDurationMs: 60_000,
    });
    expect(entry.amountUsd).toBe(0.0048);
  });

  it("gives additive streaming STT usage windows distinct ledger identities", () => {
    expect(buildStreamingSttOperationId({ requestId: "stream-1", sequence: 1 })).toBe(
      "stt:stream-1:1",
    );
    expect(buildStreamingSttOperationId({ requestId: "stream-1", sequence: 2 })).toBe(
      "stt:stream-1:2",
    );
  });

  it("prices OpenAI retrieval embeddings from reported input tokens", () => {
    const entry = buildEmbeddingSessionCostEntry({
      operationId: "turn-1:embedding",
      provider: "openai",
      model: "text-embedding-3-small",
      inputTokens: 1_000_000,
    });
    expect(entry.amountUsd).toBe(0.02);
  });

  it("keeps unknown providers visible as unpriced work", () => {
    const entry = buildTtsSessionCostEntry({
      operationId: "turn-1:tts:pocket",
      provider: "pocket_tts",
      characters: 80,
    });
    expect(entry.amountUsd).toBeNull();
    expect(entry.note).toContain("No pricing configured");
  });

  it("keeps session infrastructure visible until a project rate is configured", () => {
    const entry = buildInfrastructureSessionCostEntry({
      operationId: "session-1:livekit",
      provider: "livekit",
      sessionDurationMs: 60_000,
    });
    expect(entry.amountUsd).toBeNull();
    expect(entry.category).toBe("infrastructure");
  });
});
