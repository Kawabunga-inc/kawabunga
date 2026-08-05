import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const AUDIO_ROOT =
  process.env.WORLD_SESSION_AUDIO_DIR ??
  path.join(os.tmpdir(), "kawabunga-world-session-audio");

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function extensionForMime(mimeType: string) {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("mp4")) return "m4a";
  return "bin";
}

export function makeAudioStorageKey(input: {
  sessionId: string;
  artifactId: string;
  direction: string;
  mimeType: string;
}) {
  const ext = extensionForMime(input.mimeType);
  return path.join(
    safeSegment(input.sessionId),
    `${safeSegment(input.direction)}-${safeSegment(input.artifactId)}.${ext}`,
  );
}

function resolveStoragePath(storageKey: string) {
  const normalized = path.normalize(storageKey);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("Invalid audio storage key.");
  }
  return path.join(AUDIO_ROOT, normalized);
}

export async function writeSessionAudio(storageKey: string, bytes: Uint8Array) {
  const filePath = resolveStoragePath(storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
}

export async function readSessionAudio(storageKey: string) {
  return await readFile(resolveStoragePath(storageKey));
}

export function encodePcm16Wav(
  frames: readonly Int16Array[],
  sampleRate: number,
  channels = 1,
): Uint8Array {
  const samples = frames.reduce((total, frame) => total + frame.length, 0);
  const dataBytes = samples * Int16Array.BYTES_PER_ELEMENT;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * 2, 28);
  wav.writeUInt16LE(channels * 2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (const frame of frames) {
    const bytes = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
    bytes.copy(wav, offset);
    offset += bytes.byteLength;
  }
  return wav;
}

export function summarizePcm16(frames: readonly Int16Array[]) {
  let samples = 0;
  let peak = 0;
  let sumSquares = 0;
  for (const frame of frames) {
    for (const sample of frame) {
      const amplitude = Math.abs(sample);
      if (amplitude > peak) peak = amplitude;
      sumSquares += sample * sample;
      samples += 1;
    }
  }
  return {
    peak: peak / 32768,
    rms: samples ? Math.sqrt(sumSquares / samples) / 32768 : 0,
    samples,
  };
}
