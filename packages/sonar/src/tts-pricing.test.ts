import { afterEach, describe, expect, it } from "vitest";
import { estimateTtsCostUsd } from "./tts-pricing";

const originalPocketRate =
  process.env.SESSION_COST_POCKET_TTS_USD_PER_MILLION_CHARACTERS;

afterEach(() => {
  if (originalPocketRate == null) {
    delete process.env.SESSION_COST_POCKET_TTS_USD_PER_MILLION_CHARACTERS;
  } else {
    process.env.SESSION_COST_POCKET_TTS_USD_PER_MILLION_CHARACTERS =
      originalPocketRate;
  }
});

describe("estimateTtsCostUsd", () => {
  it("keeps Pocket visibly unpriced until infrastructure is measured", () => {
    delete process.env.SESSION_COST_POCKET_TTS_USD_PER_MILLION_CHARACTERS;
    expect(estimateTtsCostUsd("pocket_tts", 1000)).toBeNull();
  });

  it("uses the dedicated Pocket infrastructure rate", () => {
    process.env.SESSION_COST_POCKET_TTS_USD_PER_MILLION_CHARACTERS = "20";
    expect(estimateTtsCostUsd("pocket_tts", 1000)).toBe(0.02);
  });

  it("retains hosted-provider estimates", () => {
    expect(estimateTtsCostUsd("elevenlabs", 1000)).toBe(0.1);
  });
});
