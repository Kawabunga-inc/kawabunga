import { describe, expect, it } from "vitest";
import {
  SESSION_COST_EVENT_TYPE,
  summarizeSessionCostEvents,
  type SessionCostEntry,
} from "./session-cost";

function entry(overrides: Partial<SessionCostEntry> = {}): SessionCostEntry {
  return {
    ledgerVersion: 1,
    operationId: "turn-1:character_llm",
    category: "character_llm",
    provider: "cerebras",
    model: "gpt-oss-120b",
    status: "succeeded",
    amountUsd: 0.0012,
    currency: "USD",
    estimated: true,
    usage: { inputTokens: 2_000, outputTokens: 500 },
    pricing: [],
    ...overrides,
  };
}

describe("summarizeSessionCostEvents", () => {
  it("sums every category in the session ledger", () => {
    const summary = summarizeSessionCostEvents([
      { type: SESSION_COST_EVENT_TYPE, payload: entry() },
      {
        type: SESSION_COST_EVENT_TYPE,
        payload: entry({
          operationId: "decision-1:director_llm",
          category: "director_llm",
          amountUsd: 0.0003,
        }),
      },
      {
        type: SESSION_COST_EVENT_TYPE,
        payload: entry({
          operationId: "stt:request-1",
          category: "stt",
          provider: "livekit/deepgram",
          amountUsd: 0.0008,
        }),
      },
    ]);

    expect(summary.amountUsd).toBe(0.0023);
    expect(summary.entries).toBe(3);
    expect(summary.categories.map((item) => item.category)).toEqual([
      "character_llm",
      "director_llm",
      "stt",
    ]);
  });

  it("deduplicates repeated operation ids and reports unpriced work", () => {
    const summary = summarizeSessionCostEvents([
      { type: SESSION_COST_EVENT_TYPE, payload: entry({ amountUsd: 0.001 }) },
      { type: SESSION_COST_EVENT_TYPE, payload: entry({ amountUsd: 0.002 }) },
      {
        type: SESSION_COST_EVENT_TYPE,
        payload: entry({
          operationId: "self-hosted-tts",
          category: "tts",
          provider: "pocket_tts",
          amountUsd: null,
        }),
      },
    ]);

    expect(summary.amountUsd).toBe(0.002);
    expect(summary.entries).toBe(2);
    expect(summary.unpricedEntries).toBe(1);
  });

  it("adds legacy streaming STT windows that share a request id", () => {
    const summary = summarizeSessionCostEvents([
      {
        id: "event-1",
        type: SESSION_COST_EVENT_TYPE,
        payload: entry({
          operationId: "stt:stream-1",
          category: "stt",
          amountUsd: 0.001,
        }),
      },
      {
        id: "event-2",
        type: SESSION_COST_EVENT_TYPE,
        payload: entry({
          operationId: "stt:stream-1",
          category: "stt",
          amountUsd: 0.002,
        }),
      },
    ]);

    expect(summary.amountUsd).toBe(0.003);
    expect(summary.entries).toBe(2);
  });
});
