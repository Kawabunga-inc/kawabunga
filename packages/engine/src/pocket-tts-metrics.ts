export type PocketTtsLatencySummary = {
  samples: number;
  p50Ms: number | null;
  p95Ms: number | null;
  minMs: number | null;
  maxMs: number | null;
};

/**
 * Convert Pocket's allocated infrastructure spend into the same comparable
 * USD-per-million-character unit used by hosted TTS providers.
 */
export function pocketTtsEffectiveUsdPerMillionCharacters(input: {
  allocatedCostUsd: number;
  characters: number;
}): number | null {
  if (!Number.isFinite(input.allocatedCostUsd) || input.allocatedCostUsd < 0) return null;
  if (!Number.isFinite(input.characters) || input.characters <= 0) return null;
  return round((input.allocatedCostUsd / input.characters) * 1_000_000, 4);
}

/** Nearest-rank percentiles keep the result stable and easy to audit. */
export function summarizePocketTtsLatency(values: number[]): PocketTtsLatencySummary {
  const samples = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  if (samples.length === 0) {
    return { samples: 0, p50Ms: null, p95Ms: null, minMs: null, maxMs: null };
  }
  return {
    samples: samples.length,
    p50Ms: Math.round(percentile(samples, 0.5)),
    p95Ms: Math.round(percentile(samples, 0.95)),
    minMs: Math.round(samples[0]!),
    maxMs: Math.round(samples[samples.length - 1]!),
  };
}

function percentile(sorted: number[], quantile: number): number {
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return sorted[index]!;
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}
