export const SESSION_COST_EVENT_TYPE = "session.cost.recorded";
export const SESSION_COST_LEDGER_VERSION = 1;

export type SessionCostCategory =
  | "character_llm"
  | "director_llm"
  | "chronicle_llm"
  | "memory_llm"
  | "opening_llm"
  | "stt"
  | "tts"
  | "embedding"
  | "infrastructure";

export type SessionCostStatus = "succeeded" | "failed" | "cancelled";

export type SessionCostUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  characters?: number;
  audioDurationMs?: number;
  requests?: number;
};

export type SessionCostPricing = {
  unit:
    | "million_input_tokens"
    | "million_output_tokens"
    | "million_cache_read_tokens"
    | "million_cache_write_tokens"
    | "million_characters"
    | "audio_minute"
    | "session_minute"
    | "request";
  rateUsd: number;
  source: string;
  asOf: string;
};

export type SessionCostEntry = {
  ledgerVersion: typeof SESSION_COST_LEDGER_VERSION;
  operationId: string;
  category: SessionCostCategory;
  provider: string;
  model?: string | null;
  status: SessionCostStatus;
  amountUsd: number | null;
  currency: "USD";
  estimated: true;
  usage: SessionCostUsage;
  pricing: SessionCostPricing[];
  note?: string;
};

export type SessionCostCategorySummary = {
  category: SessionCostCategory;
  amountUsd: number;
  entries: number;
  unpricedEntries: number;
};

export type SessionCostSummary = {
  amountUsd: number;
  entries: number;
  unpricedEntries: number;
  categories: SessionCostCategorySummary[];
  hasLedger: boolean;
};

type CostEventLike = { id?: string; type: string; payload: unknown };

const CATEGORY_ORDER: SessionCostCategory[] = [
  "character_llm",
  "director_llm",
  "chronicle_llm",
  "memory_llm",
  "opening_llm",
  "stt",
  "tts",
  "embedding",
  "infrastructure",
];

export function summarizeSessionCostEvents(events: CostEventLike[]): SessionCostSummary {
  const entriesByOperation = new Map<string, SessionCostEntry>();
  for (const [index, event] of events.entries()) {
    if (event.type !== SESSION_COST_EVENT_TYPE) continue;
    const entry = parseSessionCostEntry(event.payload);
    if (!entry) continue;
    // LiveKit streaming STT historically emitted additive audio windows under
    // one request id. Their persisted event ids distinguish real usage windows
    // while still deduplicating the same event if a feed supplies it twice.
    const key = entry.category === "stt"
      ? `${entry.operationId}:${event.id ?? index}`
      : entry.operationId;
    entriesByOperation.set(key, entry);
  }

  const byCategory = new Map<SessionCostCategory, SessionCostCategorySummary>();
  let amountUsd = 0;
  let unpricedEntries = 0;
  for (const entry of entriesByOperation.values()) {
    const category = byCategory.get(entry.category) ?? {
      category: entry.category,
      amountUsd: 0,
      entries: 0,
      unpricedEntries: 0,
    };
    category.entries += 1;
    if (entry.amountUsd == null) {
      category.unpricedEntries += 1;
      unpricedEntries += 1;
    } else {
      category.amountUsd += entry.amountUsd;
      amountUsd += entry.amountUsd;
    }
    byCategory.set(entry.category, category);
  }

  return {
    amountUsd: roundUsd(amountUsd),
    entries: entriesByOperation.size,
    unpricedEntries,
    categories: CATEGORY_ORDER.flatMap((category) => {
      const value = byCategory.get(category);
      return value ? [{ ...value, amountUsd: roundUsd(value.amountUsd) }] : [];
    }),
    hasLedger: entriesByOperation.size > 0,
  };
}

export function parseSessionCostEntry(value: unknown): SessionCostEntry | null {
  if (!isRecord(value)) return null;
  if (value.ledgerVersion !== SESSION_COST_LEDGER_VERSION) return null;
  if (typeof value.operationId !== "string" || !value.operationId) return null;
  if (!isSessionCostCategory(value.category)) return null;
  if (typeof value.provider !== "string" || !value.provider) return null;
  if (!isSessionCostStatus(value.status)) return null;
  if (value.amountUsd !== null && !isFiniteNonNegative(value.amountUsd)) return null;
  if (!isRecord(value.usage) || !Array.isArray(value.pricing)) return null;

  return value as SessionCostEntry;
}

export function sessionCostCategoryLabel(category: SessionCostCategory): string {
  switch (category) {
    case "character_llm": return "Character";
    case "director_llm": return "Director";
    case "chronicle_llm": return "Chronicle";
    case "memory_llm": return "Memory";
    case "opening_llm": return "Opening";
    case "stt": return "Speech in";
    case "tts": return "Speech out";
    case "embedding": return "Retrieval";
    case "infrastructure": return "Infrastructure";
  }
}

function isSessionCostCategory(value: unknown): value is SessionCostCategory {
  return typeof value === "string" && CATEGORY_ORDER.includes(value as SessionCostCategory);
}

function isSessionCostStatus(value: unknown): value is SessionCostStatus {
  return value === "succeeded" || value === "failed" || value === "cancelled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}
