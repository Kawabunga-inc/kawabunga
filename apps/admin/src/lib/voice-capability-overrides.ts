import "server-only";

import { voiceCapability, type VoiceCapability } from "@kawabunga/engine";

/**
 * Runtime provider metrics that should not be baked into the client bundle.
 * Pocket's ledger rate is an infrastructure allocation, so the same server
 * environment value drives both accounting and the comparison cards.
 */
export function voiceCapabilityOverrides(): Record<string, VoiceCapability> {
  const base = voiceCapability("pocket_tts");
  const effectiveCost = positiveNumber(
    process.env.SESSION_COST_POCKET_TTS_USD_PER_MILLION_CHARACTERS,
  );
  const typicalFirstAudioMs = positiveNumber(
    process.env.POCKET_TTS_TYPICAL_FIRST_AUDIO_MS,
  );
  const p95FirstAudioMs = positiveNumber(
    process.env.POCKET_TTS_FIRST_AUDIO_P95_MS,
  );

  const latencyNote = p95FirstAudioMs == null
    ? ""
    : ` Direct /speak p95 is ${Math.round(p95FirstAudioMs)}ms.`;
  const costNote = effectiveCost == null
    ? "Set the rolling audio-rt infrastructure allocation to price Pocket."
    : `Rolling effective infrastructure rate: $${effectiveCost}/M characters.`;

  return {
    pocket_tts: {
      ...base,
      creditsPerThousandChars: effectiveCost ?? base.creditsPerThousandChars,
      typicalFirstAudioMs: typicalFirstAudioMs ?? base.typicalFirstAudioMs,
      note: `${costNote}${latencyNote}`,
    },
  };
}

function positiveNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
