import { pricingFor } from "@kawabunga/engine";
import {
  SESSION_COST_LEDGER_VERSION,
  type SessionCostCategory,
  type SessionCostEntry,
  type SessionCostPricing,
  type SessionCostStatus,
} from "@kawabunga/types";

const PRICING_AS_OF = "2026-08-05";
const ELEVENLABS_PRICING_SOURCE = "https://elevenlabs.io/pricing/api";
const LIVEKIT_PRICING_SOURCE = "https://livekit.com/pricing/inference";
const OPENAI_EMBEDDING_PRICING_SOURCE =
  "https://developers.openai.com/api/docs/models/text-embedding-3-small";

export type SessionTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
};

export type SessionCostEstimate = {
  estimatedCostUsd: number;
  pricing: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  } | null;
};

export function estimateSessionTurnCost(
  modelId: string | null | undefined,
  usage: SessionTokenUsage,
): SessionCostEstimate {
  const pricing = modelId ? pricingFor(modelId) : null;
  if (!pricing) {
    return { estimatedCostUsd: 0, pricing: null };
  }

  const inputTokens = finiteTokenCount(usage.inputTokens);
  const outputTokens = finiteTokenCount(usage.outputTokens);
  const cacheReadTokens = finiteTokenCount(usage.cacheReadTokens);
  const cacheCreationTokens = finiteTokenCount(usage.cacheCreationTokens);

  const estimatedCostUsd =
    (inputTokens * pricing.input) / 1_000_000 +
    (outputTokens * pricing.output) / 1_000_000 +
    (cacheReadTokens * (pricing.cacheRead ?? 0)) / 1_000_000 +
    (cacheCreationTokens * (pricing.cacheWrite ?? 0)) / 1_000_000;

  return {
    estimatedCostUsd: roundCost(estimatedCostUsd),
    pricing,
  };
}

export function buildLlmSessionCostEntry(input: {
  operationId: string;
  category: Extract<SessionCostCategory, "character_llm" | "director_llm" | "chronicle_llm" | "memory_llm" | "opening_llm">;
  provider: string;
  model: string;
  status?: SessionCostStatus;
  usage: SessionTokenUsage;
  usageKnown?: boolean;
  note?: string;
}): SessionCostEntry {
  const cost = estimateSessionTurnCost(input.model, input.usage);
  const pricing: SessionCostPricing[] = cost.pricing
    ? [
        rate("million_input_tokens", cost.pricing.input, "model-registry"),
        rate("million_output_tokens", cost.pricing.output, "model-registry"),
        ...(cost.pricing.cacheRead != null
          ? [rate("million_cache_read_tokens", cost.pricing.cacheRead, "model-registry")]
          : []),
        ...(cost.pricing.cacheWrite != null
          ? [rate("million_cache_write_tokens", cost.pricing.cacheWrite, "model-registry")]
          : []),
      ]
    : [];
  return ledgerEntry({
    operationId: input.operationId,
    category: input.category,
    provider: input.provider,
    model: input.model,
    status: input.status ?? "succeeded",
    amountUsd: cost.pricing && input.usageKnown !== false ? cost.estimatedCostUsd : null,
    usage: {
      inputTokens: finiteTokenCount(input.usage.inputTokens),
      outputTokens: finiteTokenCount(input.usage.outputTokens),
      cacheReadTokens: finiteTokenCount(input.usage.cacheReadTokens),
      cacheCreationTokens: finiteTokenCount(input.usage.cacheCreationTokens),
    },
    pricing,
    note: input.note,
  });
}

export function buildTtsSessionCostEntry(input: {
  operationId: string;
  provider: string;
  model?: string | null;
  characters: number;
  audioDurationMs?: number;
  status?: SessionCostStatus;
  note?: string;
}): SessionCostEntry {
  const characters = finiteTokenCount(input.characters);
  const ratePerMillion = ttsRatePerMillionCharacters(input.provider, input.model);
  return ledgerEntry({
    operationId: input.operationId,
    category: "tts",
    provider: input.provider,
    model: input.model,
    status: input.status ?? "succeeded",
    amountUsd:
      ratePerMillion == null
        ? null
        : roundCost((characters * ratePerMillion.rateUsd) / 1_000_000),
    usage: {
      characters,
      audioDurationMs: finiteTokenCount(input.audioDurationMs),
    },
    pricing: ratePerMillion ? [ratePerMillion] : [],
    note: input.note ?? (ratePerMillion ? undefined : "No pricing configured for this TTS provider."),
  });
}

export function buildSttSessionCostEntry(input: {
  operationId: string;
  provider: string;
  model: string;
  audioDurationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  status?: SessionCostStatus;
}): SessionCostEntry {
  const durationMs = finiteTokenCount(input.audioDurationMs);
  const perMinute = sttRatePerMinute(input.provider, input.model);
  return ledgerEntry({
    operationId: input.operationId,
    category: "stt",
    provider: input.provider,
    model: input.model,
    status: input.status ?? "succeeded",
    amountUsd:
      perMinute == null
        ? null
        : roundCost((durationMs / 60_000) * perMinute.rateUsd),
    usage: {
      audioDurationMs: durationMs,
      inputTokens: finiteTokenCount(input.inputTokens),
      outputTokens: finiteTokenCount(input.outputTokens),
    },
    pricing: perMinute ? [perMinute] : [],
    note: perMinute ? undefined : "No pricing configured for this STT provider.",
  });
}

/** Streaming STT emits multiple additive usage records under one request id.
 *  The sequence is part of the ledger identity so aggregation never mistakes
 *  later audio windows for retries of the same charge. */
export function buildStreamingSttOperationId(input: {
  requestId?: string | null;
  timestamp?: number | null;
  sequence: number;
}): string {
  const streamId = input.requestId?.trim() || input.timestamp || "stream";
  return `stt:${streamId}:${Math.max(1, Math.round(input.sequence))}`;
}

export function buildEmbeddingSessionCostEntry(input: {
  operationId: string;
  provider: string;
  model: string;
  inputTokens: number;
  requests?: number;
  status?: SessionCostStatus;
  usageKnown?: boolean;
  note?: string;
}): SessionCostEntry {
  const inputTokens = finiteTokenCount(input.inputTokens);
  const configured = readPositiveNumber(
    process.env.SESSION_COST_EMBEDDING_USD_PER_MILLION_TOKENS,
  );
  const isOpenAiSmall = input.provider === "openai" && input.model === "text-embedding-3-small";
  const price = configured ?? (isOpenAiSmall ? 0.02 : null);
  const pricing = price == null
    ? null
    : rate(
        "million_input_tokens",
        price,
        configured == null ? OPENAI_EMBEDDING_PRICING_SOURCE : "environment override",
      );
  return ledgerEntry({
    operationId: input.operationId,
    category: "embedding",
    provider: input.provider,
    model: input.model,
    status: input.status ?? "succeeded",
    amountUsd: pricing == null || input.usageKnown === false
      ? null
      : roundCost((inputTokens * pricing.rateUsd) / 1_000_000),
    usage: { inputTokens, requests: finiteTokenCount(input.requests ?? 1) },
    pricing: pricing ? [pricing] : [],
    note: input.note ?? (pricing ? undefined : "No pricing configured for this embedding model."),
  });
}

export function buildInfrastructureSessionCostEntry(input: {
  operationId: string;
  provider: string;
  sessionDurationMs: number;
  status?: SessionCostStatus;
  note?: string;
}): SessionCostEntry {
  const durationMs = finiteTokenCount(input.sessionDurationMs);
  const configured = readPositiveNumber(
    process.env.SESSION_COST_LIVEKIT_SESSION_USD_PER_MINUTE,
  );
  const pricing = configured == null
    ? null
    : rate("session_minute", configured, "environment override");
  return ledgerEntry({
    operationId: input.operationId,
    category: "infrastructure",
    provider: input.provider,
    model: null,
    status: input.status ?? "succeeded",
    amountUsd: pricing == null
      ? null
      : roundCost((durationMs / 60_000) * pricing.rateUsd),
    usage: { audioDurationMs: durationMs },
    pricing: pricing ? [pricing] : [],
    note: input.note ?? (pricing
      ? undefined
      : "LiveKit media/room allocation needs a project-specific session-minute rate."),
  });
}

export function resolveTtsModelId(
  provider: string,
  providerConfig?: Record<string, unknown> | null,
): string | null {
  const configured = providerConfig?.modelId;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  if (provider === "elevenlabs") {
    return process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5";
  }
  if (provider === "cartesia") {
    return process.env.CARTESIA_MODEL_ID?.trim() || "sonic-2";
  }
  return null;
}

function ledgerEntry(
  input: Omit<SessionCostEntry, "ledgerVersion" | "currency" | "estimated">,
): SessionCostEntry {
  return {
    ledgerVersion: SESSION_COST_LEDGER_VERSION,
    currency: "USD",
    estimated: true,
    ...input,
  };
}

function ttsRatePerMillionCharacters(
  provider: string,
  model?: string | null,
): SessionCostPricing | null {
  if (provider === "elevenlabs") {
    const flash = !model || model.includes("flash") || model.includes("turbo");
    const configured = readPositiveNumber(
      flash
        ? process.env.SESSION_COST_ELEVENLABS_FLASH_USD_PER_MILLION_CHARACTERS
        : process.env.SESSION_COST_ELEVENLABS_PREMIUM_USD_PER_MILLION_CHARACTERS,
    );
    return rate(
      "million_characters",
      configured ?? (flash ? 50 : 100),
      ELEVENLABS_PRICING_SOURCE,
    );
  }
  if (provider === "cartesia") {
    const configured = readPositiveNumber(
      process.env.SESSION_COST_CARTESIA_USD_PER_MILLION_CHARACTERS,
    );
    return configured == null
      ? null
      : rate("million_characters", configured, "environment override");
  }
  if (provider === "pocket_tts") {
    const configured = readPositiveNumber(
      process.env.SESSION_COST_POCKET_TTS_USD_PER_MILLION_CHARACTERS,
    );
    return configured == null
      ? null
      : rate("million_characters", configured, "environment override");
  }
  return null;
}

function sttRatePerMinute(provider: string, model: string): SessionCostPricing | null {
  const configured = readPositiveNumber(process.env.SESSION_COST_STT_USD_PER_MINUTE);
  if (configured != null) return rate("audio_minute", configured, "environment override");

  const normalized = `${provider}/${model}`.toLowerCase();
  if (!normalized.includes("deepgram") || !normalized.includes("nova-3")) return null;
  const multilingual = normalized.includes("multi");
  const scale = process.env.LIVEKIT_INFERENCE_PLAN?.trim().toLowerCase() === "scale";
  const rateUsd = multilingual ? (scale ? 0.005 : 0.0058) : (scale ? 0.0042 : 0.0048);
  return rate("audio_minute", rateUsd, LIVEKIT_PRICING_SOURCE);
}

function rate(
  unit: SessionCostPricing["unit"],
  rateUsd: number,
  source: string,
): SessionCostPricing {
  return { unit, rateUsd, source, asOf: PRICING_AS_OF };
}

function readPositiveNumber(value?: string): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function finiteTokenCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function roundCost(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}
