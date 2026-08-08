/**
 * TTS cost estimation for Sonar runs. The voice-stream route only prices
 * LLM tokens (estimateSessionTurnCost), so without this a hosted-TTS run
 * reports the same cost as an unpriced self-hosted one — misleading when the
 * whole point of the TTS A/B is a cost/latency tradeoff.
 *
 * Rates are USD per 1,000 characters synthesized — ESTIMATES, since hosted
 * TTS is usually credit-based and the per-character dollar value depends on
 * your plan tier. Tune these to your actual contract; the goal here is
 * "non-zero and roughly right," not invoice-accurate.
 *
 * Sources (mid-2026, list/standard tier; cheaper at scale):
 *   - ElevenLabs Flash v2.5 ≈ $0.10/1k chars (credit-based, ~Pro tier)
 *   - OpenAI gpt-4o-mini-tts ≈ $0.015/1k chars
 *   - Cartesia Sonic ≈ $0.04/1k chars
 *   - Pocket TTS = configured infrastructure rate (dedicated Railway service)
 */
export const TTS_USD_PER_1K_CHARS: Record<string, number> = {
  elevenlabs: 0.1,
  openai: 0.015,
  cartesia: 0.04,
};

/**
 * Estimate the TTS cost of synthesizing `chars` characters with `provider`.
 * Returns null for an unknown provider (so it's visibly absent rather than
 * silently counted as free).
 */
export function estimateTtsCostUsd(
  provider: string | null,
  chars: number,
): number | null {
  if (!provider) return null;
  const rate =
    provider === "pocket_tts"
      ? pocketRatePerThousandCharacters()
      : TTS_USD_PER_1K_CHARS[provider];
  if (rate === undefined) return null;
  return Math.round((chars / 1000) * rate * 1e6) / 1e6;
}

function pocketRatePerThousandCharacters(): number | undefined {
  const raw =
    process.env.SESSION_COST_POCKET_TTS_USD_PER_MILLION_CHARACTERS?.trim();
  if (!raw) return undefined;
  const perMillion = Number(raw);
  return Number.isFinite(perMillion) && perMillion >= 0
    ? perMillion / 1000
    : undefined;
}
