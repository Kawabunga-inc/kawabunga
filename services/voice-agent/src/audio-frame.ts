import { AudioFrame } from "@livekit/rtc-node";

/** base64 Float32 LE PCM (one TTS chunk) → an Int16 mono AudioFrame for the room. */
export function toAudioFrame(pcmBase64: string, sampleRate: number): AudioFrame {
  const buf = Buffer.from(pcmBase64, "base64");
  // Copy into a fresh, 4-byte-aligned ArrayBuffer — Buffer pooling can hand back
  // an unaligned byteOffset, which would make the Float32Array view throw.
  const aligned = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const f32 = new Float32Array(aligned);
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i] ?? 0));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new AudioFrame(i16, sampleRate, 1, i16.length);
}
