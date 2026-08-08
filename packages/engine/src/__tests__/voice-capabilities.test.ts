import { describe, expect, it } from "vitest";
import {
  costTierFor,
  formatCreditRate,
  formatFirstAudio,
  formatModelLabel,
  speedTierFor,
  voiceCapability,
  sanitizeForTts,
  ttsTextCapability,
  deliverySpeed,
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
    // Speed is independently measurable even while cost remains unconfigured.
    expect(voiceCapability("pocket_tts").typicalFirstAudioMs).toBe(365);
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
    expect(speedTierFor(290)).toBe(2); // fish (measured)
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

describe("ttsTextCapability", () => {
  it("gives every voice we actually run the v2.5 dialect: no audio tags", () => {
    // The one that matters. Every ElevenLabs voice in the library today runs
    // eleven_flash_v2_5, which has no notion of [laughs] — it reads the
    // characters. Our own transcript convention wraps narration in brackets,
    // so this is one leak away, not hypothetical.
    expect(ttsTextCapability("elevenlabs", "eleven_flash_v2_5").audioTags).toBe(false);
    expect(ttsTextCapability("elevenlabs").audioTags).toBe(false);
    expect(ttsTextCapability("cartesia", "sonic-2").audioTags).toBe(false);
    expect(ttsTextCapability("fish_audio", "s2.1-pro").audioTags).toBe(false);
  });

  it("recognises v3 as the only audio-tag dialect, and that it dropped breaks", () => {
    const v3 = ttsTextCapability("elevenlabs", "eleven_v3");
    expect(v3.audioTags).toBe(true);
    expect(v3.ipaSlashes).toBe(true);
    // v3 does not support SSML break tags — claiming otherwise would emit
    // markup it reads as text.
    expect(v3.breakTags).toBe(false);
  });

  it("does not confuse eleven_flash_v2 with eleven_flash_v2_5", () => {
    // Phoneme tags are documented for flash_v2 ONLY. A prefix match here would
    // emit <phoneme> to v2_5, which reads it as text.
    expect(ttsTextCapability("elevenlabs", "eleven_flash_v2").phonemeTags).toBe(true);
    expect(ttsTextCapability("elevenlabs", "eleven_flash_v2_5").phonemeTags).toBe(false);
  });

  it("defaults an unknown provider to plain prose", () => {
    // Plain prose is read correctly by every engine; the safe default is the
    // one that is never wrong, only ever less expressive.
    const unknown = ttsTextCapability("some_new_provider");
    expect(unknown).toEqual({
      audioTags: false,
      breakTags: false,
      phonemeTags: false,
      ipaSlashes: false,
      speed: false,
    });
  });
});

describe("sanitizeForTts", () => {
  const v25 = ttsTextCapability("elevenlabs", "eleven_flash_v2_5");
  const v3 = ttsTextCapability("elevenlabs", "eleven_v3");

  it("strips bracket spans a model would otherwise read aloud", () => {
    expect(sanitizeForTts("[whispers] I never knew it could be this way.", v25)).toBe(
      "I never knew it could be this way.",
    );
    expect(sanitizeForTts("Thank you all. [applause] What was that?", v25)).toBe(
      "Thank you all. What was that?",
    );
  });

  it("leaves them intact for a model that performs them", () => {
    expect(sanitizeForTts("[whispers] I never knew.", v3)).toBe("[whispers] I never knew.");
  });

  it("does not let an unclosed bracket swallow the line", () => {
    // A truncated generation can leave a bracket open; a greedy or multiline
    // pattern would delete everything after it.
    expect(sanitizeForTts("[sighs it was a long day", v25)).toBe("[sighs it was a long day");
  });

  it("leaves ordinary prose untouched", () => {
    const line = "Evening comes slow to Mamre. The camp quiets.";
    expect(sanitizeForTts(line, v25)).toBe(line);
  });
});

describe("deliverySpeed", () => {
  const elevenlabs = ttsTextCapability("elevenlabs", "eleven_flash_v2_5");
  const noSpeed = ttsTextCapability("fish_audio");

  it("makes a weighty line breathe and a clipped one land", () => {
    expect(deliverySpeed("expansive", elevenlabs)).toBe(0.95);
    expect(deliverySpeed("brief", elevenlabs)).toBe(1.05);
  });

  it("sends nothing for the ordinary case", () => {
    // `natural` IS the provider default, so the common turn's payload stays
    // byte-identical to what ships today rather than gaining a redundant field.
    expect(deliverySpeed("natural", elevenlabs)).toBeNull();
    expect(deliverySpeed(null, elevenlabs)).toBeNull();
    expect(deliverySpeed(undefined, elevenlabs)).toBeNull();
  });

  it("sends nothing to a provider with no speed control", () => {
    // An unsupported field is a request the provider may reject outright, so
    // silence beats a default.
    expect(deliverySpeed("expansive", noSpeed)).toBeNull();
    expect(deliverySpeed("brief", noSpeed)).toBeNull();
  });

  it("ignores a delivery it does not recognise", () => {
    expect(deliverySpeed("whispered", elevenlabs)).toBeNull();
  });

  it("stays well inside the documented 0.7-1.2 range", () => {
    // ElevenLabs warns that extremes degrade quality. The aim is that a line
    // breathes, not that it is audibly slowed.
    for (const d of ["brief", "natural", "expansive"]) {
      const speed = deliverySpeed(d, elevenlabs);
      if (speed !== null) {
        expect(speed).toBeGreaterThan(0.9);
        expect(speed).toBeLessThan(1.1);
      }
    }
  });
});
