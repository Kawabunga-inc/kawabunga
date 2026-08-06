import { describe, expect, it } from "vitest";
import {
  costTierFor,
  formatCreditRate,
  formatFirstAudio,
  formatModelLabel,
  speedTierFor,
  voiceCapability,
} from "../voice-capabilities";

describe("voiceCapability", () => {
  it("prices the providers we actually run", () => {
    expect(voiceCapability("elevenlabs").creditsPerThousandChars).toBe(50);
    expect(voiceCapability("cartesia").creditsPerThousandChars).toBe(50);
    expect(voiceCapability("fish_audio").creditsPerThousandChars).toBe(15);
  });

  it("separates the ElevenLabs premium tier from flash/turbo", () => {
    expect(voiceCapability("elevenlabs", "eleven_flash_v2_5").creditsPerThousandChars).toBe(50);
    expect(voiceCapability("elevenlabs", "eleven_turbo_v2").creditsPerThousandChars).toBe(50);
    expect(voiceCapability("elevenlabs", "eleven_multilingual_v2").creditsPerThousandChars).toBe(
      100,
    );
  });

  it("reports nulls rather than inventing a rate", () => {
    // Self-hosted: the cost is infrastructure, not per character.
    expect(voiceCapability("pocket_tts").creditsPerThousandChars).toBeNull();
    expect(voiceCapability("openai").typicalFirstAudioMs).toBeNull();
    const unknown = voiceCapability("some_new_provider");
    expect(unknown.creditsPerThousandChars).toBeNull();
    expect(unknown.label).toBe("some_new_provider");
  });

  it("falls back to the provider default for an unrecognised model", () => {
    expect(voiceCapability("cartesia", "sonic-9000").creditsPerThousandChars).toBe(50);
  });
});

describe("tiering", () => {
  it("buckets cost so the cheap provider reads as cheap", () => {
    expect(costTierFor(15)).toBe(1); // fish
    expect(costTierFor(38)).toBe(2); // cartesia on a committed plan
    expect(costTierFor(50)).toBe(3); // elevenlabs flash / cartesia payg
    expect(costTierFor(100)).toBe(4); // elevenlabs premium
    expect(costTierFor(null)).toBeNull();
  });

  it("buckets speed so sub-100ms earns all four bolts", () => {
    expect(speedTierFor(40)).toBe(4); // cartesia
    expect(speedTierFor(180)).toBe(3); // elevenlabs flash
    expect(speedTierFor(220)).toBe(2); // fish
    expect(speedTierFor(600)).toBe(1);
    expect(speedTierFor(null)).toBeNull();
  });

  it("treats non-finite input as unknown, not as zero", () => {
    expect(costTierFor(Number.NaN)).toBeNull();
    expect(speedTierFor(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("formatting", () => {
  it("renders the exact rate beside the pips", () => {
    expect(formatCreditRate(50)).toBe("50 cr/1k");
    expect(formatCreditRate(37.375)).toBe("37.4 cr/1k");
    expect(formatCreditRate(null)).toBe("—");
  });

  it("renders latency beside the bolts", () => {
    expect(formatFirstAudio(40)).toBe("~40ms");
    expect(formatFirstAudio(null)).toBe("—");
  });
});

describe("formatModelLabel", () => {
  it("reads the model as a person would", () => {
    expect(formatModelLabel("eleven_flash_v2_5")).toBe("flash v2.5");
    expect(formatModelLabel("eleven_multilingual_v2")).toBe("multilingual v2");
  });

  it("leaves already-readable ids alone", () => {
    expect(formatModelLabel("sonic-2")).toBe("sonic-2");
    expect(formatModelLabel("s2.1-pro")).toBe("s2.1-pro");
  });

  it("renders an em dash rather than an empty cell", () => {
    expect(formatModelLabel(null)).toBe("\u2014");
    expect(formatModelLabel("  ")).toBe("\u2014");
  });
});
