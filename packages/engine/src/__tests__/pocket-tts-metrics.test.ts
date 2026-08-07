import { describe, expect, it } from "vitest";
import {
  pocketTtsEffectiveUsdPerMillionCharacters,
  summarizePocketTtsLatency,
} from "../pocket-tts-metrics";

describe("Pocket TTS metrics", () => {
  it("normalizes allocated infrastructure cost to USD per million characters", () => {
    expect(
      pocketTtsEffectiveUsdPerMillionCharacters({
        allocatedCostUsd: 40,
        characters: 2_000_000,
      }),
    ).toBe(20);
  });

  it("rejects missing usage and invalid costs", () => {
    expect(
      pocketTtsEffectiveUsdPerMillionCharacters({ allocatedCostUsd: 40, characters: 0 }),
    ).toBeNull();
    expect(
      pocketTtsEffectiveUsdPerMillionCharacters({ allocatedCostUsd: -1, characters: 100 }),
    ).toBeNull();
  });

  it("summarizes valid TTFA samples with nearest-rank percentiles", () => {
    expect(summarizePocketTtsLatency([300, 100, Number.NaN, 200, 500, 400])).toEqual({
      samples: 5,
      p50Ms: 300,
      p95Ms: 500,
      minMs: 100,
      maxMs: 500,
    });
  });
});
