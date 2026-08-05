import { describe, expect, it } from "vitest";
import { encodePcm16Wav, makeAudioStorageKey, summarizePcm16 } from "./session-audio-storage";

describe("session audio storage", () => {
  it("encodes copied PCM frames as a valid mono WAV", () => {
    const wav = encodePcm16Wav([new Int16Array([0, 32767, -32768, 0])], 16_000);
    const view = Buffer.from(wav);
    expect(view.toString("ascii", 0, 4)).toBe("RIFF");
    expect(view.toString("ascii", 8, 12)).toBe("WAVE");
    expect(view.readUInt32LE(24)).toBe(16_000);
    expect(view.readUInt32LE(40)).toBe(8);
    expect(view.readInt16LE(46)).toBe(32767);
  });

  it("keeps storage keys session-scoped and summarizes signal energy", () => {
    expect(makeAudioStorageKey({
      sessionId: "session/unsafe",
      artifactId: "artifact",
      direction: "output",
      mimeType: "audio/wav",
    })).toBe("session_unsafe/output-artifact.wav");
    expect(summarizePcm16([new Int16Array([0, 16384, -16384])])).toMatchObject({
      peak: 0.5,
      samples: 3,
    });
  });
});
