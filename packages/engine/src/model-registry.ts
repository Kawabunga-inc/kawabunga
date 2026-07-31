/**
 * Single source of truth for the LLM models the engine knows about.
 * Consumed by:
 *   - apps/admin's chat route (model validation + provider routing)
 *   - apps/admin's voice route (model-id based provider streaming)
 *   - apps/admin's L04 Brain / Model editor (picker UI)
 *   - packages/evals' runner (cost estimation, provider routing)
 *
 * Pre-v2 the registry lived in apps/admin/src/lib/model-registry.ts with
 * only { id, label, provider, modes }. Pricing was duplicated as a
 * separate hardcoded table in packages/evals/src/runner.ts. This unified
 * registry collapses both into one record per model.
 *
 * Updating prices: vendor list prices in USD per 1M tokens, taken from
 * each provider's pricing page. Update when the vendor announces a change.
 * Cache pricing (`cacheRead` / `cacheWrite`) only applies to providers
 * that support prompt caching (Anthropic today; OpenAI added it in late
 * 2024 but we don't use it yet).
 */

export type ProviderId =
  | "anthropic"
  | "openai"
  | "cerebras"
  | "groq"
  | "xai"
  | "gemini"
  | "fireworks"
  | "deepseek"
  | "baseten";

/** Where this model can be used. */
export type ModelMode = "chat" | "voice";

/** USD per 1M tokens. */
export type ModelPricing = {
  input: number;
  output: number;
  /** Reads from prompt cache. Omit when provider doesn't cache. */
  cacheRead?: number;
  /** Writes (cold-start) to prompt cache. Omit when provider doesn't cache. */
  cacheWrite?: number;
};

export type ModelCapabilities = {
  /** Supports prompt-caching headers (Anthropic `cache_control`). */
  promptCache?: boolean;
  /** Supports server-side streaming completion. */
  streaming?: boolean;
  /** Supports tool / function calling. */
  tools?: boolean;
  /** Accepts image inputs alongside text. */
  vision?: boolean;
  /** Native JSON-schema structured output mode. */
  structuredOutput?: boolean;
  /** Exposes a `temperature` parameter. */
  temperature?: boolean;
  /** Exposes a `top_p` parameter. */
  topP?: boolean;
};

/**
 * Coarse latency bucket. Useful for UI filtering ("show me anything fast
 * enough for voice"). Not a hard SLO — actual TTFT depends on prompt size,
 * cache hits, region, and current load.
 *
 *   instant   ~< 200ms TTFT  (Cerebras, Groq)
 *   fast      ~< 1s   TTFT  (Haiku, GPT-5-nano)
 *   balanced  ~< 3s   TTFT  (Sonnet, GPT-5-mini)
 *   frontier  ~< 8s   TTFT  (Opus, GPT-5)
 */
export type LatencyTier = "instant" | "fast" | "balanced" | "frontier";

/**
 * Coarse quality bucket. Authoring guidance, not a benchmark claim.
 *   budget     — cheapest tier from each provider; fine for high-volume turns
 *   production — daily-driver tier; what most characters should run
 *   frontier   — most capable / most expensive; reserve for hardest probes
 */
export type QualityTier = "budget" | "production" | "frontier";

export type ModelOption = {
  id: string;
  /** Short display name shown in pickers (e.g. "Sonnet 4.5"). */
  label: string;
  /** One-sentence positioning shown beneath the label. */
  description?: string;
  provider: ProviderId;
  modes: ModelMode[];
  /** Total context window the model can consume (input tokens). */
  contextWindow: number;
  /** Soft ceiling on output tokens per call (provider-enforced or sensible default). */
  maxOutputTokens: number;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  latencyTier: LatencyTier;
  qualityTier: QualityTier;
  /** Mark non-GA models so the picker can flag them. */
  preview?: boolean;
  /** The id sent to the provider's API when it differs from the registry id.
   *  Lets two hosts serve the same upstream model without colliding in the
   *  id→provider map (e.g. registry "baseten/gpt-oss-120b" → wire
   *  "openai/gpt-oss-120b", which Groq's entry already claims). */
  providerModelId?: string;
};

/* ── The registry ───────────────────────────────────────────── */

export const MODEL_REGISTRY: ModelOption[] = [
  // ── Anthropic Claude 5 family ────────────────────────────────
  // Pricing per the Claude docs (2026-07). All three REJECT temperature/
  // top_p (400) — capabilities gate the params out in the providers. All
  // three run adaptive thinking BY DEFAULT, billed inside max_tokens: give
  // small-budget calls headroom, and treat them as chat/dramaturg tier,
  // not voice hot path.
  {
    id: "claude-fable-5",
    label: "Fable 5",
    description:
      "Anthropic's most capable model. Always-on thinking; requires 30-day data retention. Quality-ceiling experiments only.",
    provider: "anthropic",
    modes: ["chat"],
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    pricing: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
    capabilities: {
      promptCache: true, streaming: true, tools: true, vision: true,
      structuredOutput: true, temperature: false, topP: false,
    },
    latencyTier: "frontier",
    qualityTier: "frontier",
  },
  {
    id: "claude-opus-5",
    label: "Opus 5",
    description: "Current Opus. Step-change over 4.x at a third of Opus 4.5's price.",
    provider: "anthropic",
    modes: ["chat"],
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    pricing: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    capabilities: {
      promptCache: true, streaming: true, tools: true, vision: true,
      structuredOutput: true, temperature: false, topP: false,
    },
    latencyTier: "frontier",
    qualityTier: "frontier",
  },
  {
    id: "claude-sonnet-5",
    label: "Sonnet 5",
    description:
      "Near-Opus quality at Sonnet cost. Intro pricing $2/$10 through 2026-08-31 (listed at $3/$15).",
    provider: "anthropic",
    modes: ["chat"],
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    capabilities: {
      promptCache: true, streaming: true, tools: true, vision: true,
      structuredOutput: true, temperature: false, topP: false,
    },
    latencyTier: "balanced",
    qualityTier: "production",
  },

  // ── Anthropic Claude 4-series ────────────────────────────────
  {
    id: "claude-opus-4-5",
    label: "Opus 4.5",
    description: "Anthropic's flagship. Best in-character coherence, slowest TTFT.",
    provider: "anthropic",
    modes: ["chat", "voice"],
    contextWindow: 200_000,
    maxOutputTokens: 4096,
    pricing: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
    capabilities: {
      promptCache: true, streaming: true, tools: true, vision: true,
      structuredOutput: true, temperature: true, topP: true,
    },
    latencyTier: "frontier",
    qualityTier: "frontier",
  },
  {
    id: "claude-sonnet-4-5",
    label: "Sonnet 4.5",
    description: "The daily-driver. Closest to Opus on quality at 1/5 the cost.",
    provider: "anthropic",
    modes: ["chat", "voice"],
    contextWindow: 200_000,
    maxOutputTokens: 4096,
    pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    capabilities: {
      promptCache: true, streaming: true, tools: true, vision: true,
      structuredOutput: true, temperature: true, topP: true,
    },
    latencyTier: "balanced",
    qualityTier: "production",
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    description: "Fastest Anthropic model. Voice-grade TTFT, holds character well at short lengths.",
    provider: "anthropic",
    modes: ["chat", "voice"],
    contextWindow: 200_000,
    maxOutputTokens: 4096,
    pricing: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
    capabilities: {
      promptCache: true, streaming: true, tools: true, vision: true,
      structuredOutput: true, temperature: true, topP: true,
    },
    latencyTier: "fast",
    qualityTier: "budget",
  },

  // ── OpenAI GPT-5 series ──────────────────────────────────────
  // Pricing per OpenAI's GPT-5 launch (USD per 1M tokens).
  // Note on capabilities: GPT-5 models reject custom `temperature` and
  // `top_p` values — only the default (1.0) is accepted. We mark these
  // capabilities false so the chat route + OpenAI provider drop the
  // parameters before sending, and the L04 picker can disable the
  // matching sliders when one of these is selected.
  {
    id: "gpt-5",
    label: "GPT-5",
    description: "OpenAI's frontier. Strong instruction following + tool use; locks temperature to default.",
    provider: "openai",
    modes: ["chat"],
    contextWindow: 400_000,
    maxOutputTokens: 8192,
    pricing: { input: 1.25, output: 10 },
    capabilities: {
      promptCache: false, streaming: true, tools: true, vision: true,
      structuredOutput: true, temperature: false, topP: false,
    },
    latencyTier: "frontier",
    qualityTier: "frontier",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    description: "Cost/quality balance. Comparable to Sonnet 4.5 at less than 1/10 the input cost.",
    provider: "openai",
    modes: ["chat"],
    contextWindow: 400_000,
    maxOutputTokens: 8192,
    pricing: { input: 0.25, output: 2 },
    capabilities: {
      promptCache: false, streaming: true, tools: true, vision: true,
      structuredOutput: true, temperature: false, topP: false,
    },
    latencyTier: "balanced",
    qualityTier: "production",
  },
  {
    id: "gpt-5-nano",
    label: "GPT-5 Nano",
    description: "Cheapest GPT-5 tier. Voice-grade TTFT possible.",
    provider: "openai",
    modes: ["chat"],
    contextWindow: 400_000,
    maxOutputTokens: 8192,
    pricing: { input: 0.05, output: 0.4 },
    capabilities: {
      promptCache: false, streaming: true, tools: true, vision: true,
      structuredOutput: true, temperature: false, topP: false,
    },
    latencyTier: "fast",
    qualityTier: "budget",
  },

  // ── Cerebras — open-weights, sub-200ms TTFT ──────────────────
  // All accept "chat" mode now (OpenAI-compatible HTTP, wired through
  // CerebrasChatProvider). Author beware: long-form chat quality is
  // model-dependent — evaluate each one before adopting in production.
  // Note: Cerebras retired several models from its public endpoints. As of
  // 2026-06-12 the live /v1/models list offers only gpt-oss-120b and
  // zai-glm-4.7. Removed entries (both now return 404):
  //   - llama3.1-8b (deprecated 2026-05-27; no current Cerebras 8B replaces it)
  //   - qwen-3-235b-a22b-instruct-2507 (was DEFAULT_VOICE_MODEL; repointed to gpt-oss-120b)
  {
    id: "gpt-oss-120b",
    label: "GPT-OSS 120B",
    description: "OpenAI's open-weights drop, served on Cerebras silicon.",
    provider: "cerebras",
    modes: ["chat", "voice"],
    contextWindow: 128_000,
    maxOutputTokens: 4096,
    pricing: { input: 0.25, output: 0.5 },
    capabilities: { promptCache: false, streaming: true, tools: false, vision: false, structuredOutput: false, temperature: true, topP: true },
    latencyTier: "instant",
    qualityTier: "production",
  },
  {
    id: "zai-glm-4.7",
    label: "GLM 4.7",
    description: "Zhipu's GLM. Multilingual — strong Chinese + English coverage.",
    provider: "cerebras",
    modes: ["chat", "voice"],
    contextWindow: 128_000,
    maxOutputTokens: 4096,
    pricing: { input: 0.5, output: 1 },
    capabilities: { promptCache: false, streaming: true, tools: false, vision: false, structuredOutput: false, temperature: true, topP: true },
    latencyTier: "instant",
    qualityTier: "production",
  },

  // ── Groq — OpenAI-compatible ultra-low-latency inference ─────
  // 2026-07-30: the free/on_demand tier TPM-blocks eval-sized prompts, so
  // the wider Groq catalog (gpt-oss-20b, Llama 3.x/4, Qwen3) was removed —
  // Fireworks/DeepSeek entries cover those models with working limits.
  // gpt-oss-120b stays: it is the director's Groq failover target and works
  // at director-sized prompts (and fully on a paid tier).
  {
    id: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B (Groq)",
    description: "OpenAI open-weight MoE on Groq. Strong voice latency with high-capability reasoning.",
    provider: "groq",
    modes: ["chat", "voice"],
    contextWindow: 131_072,
    maxOutputTokens: 65_536,
    pricing: { input: 0.15, output: 0.6, cacheRead: 0.075 },
    capabilities: {
      promptCache: true, streaming: true, tools: true, vision: false,
      structuredOutput: true, temperature: true, topP: true,
    },
    latencyTier: "instant",
    qualityTier: "production",
  },

  // ── xAI — OpenAI-compatible (api.x.ai/v1) ────────────────────
  // Ids verified against docs.x.ai 2026-07-30. xAI retires/aliases ids
  // aggressively (grok-3*, grok-4-fast now 404) — when adding entries,
  // confirm against GET /v1/models with a live key first. Long-context
  // requests (>200k tokens) bill at ~2× the rates below; our turns never
  // get near that. xAI prompt caching exists but isn't surfaced by our
  // OpenAI-compat provider — promptCache stays false until wired.
  {
    id: "grok-4.3",
    label: "Grok 4.3",
    description:
      "xAI's cost-efficient frontier model. TTFT unbenched — sweep before adopting for voice.",
    provider: "xai",
    modes: ["chat", "voice"],
    contextWindow: 1_000_000,
    maxOutputTokens: 16_384,
    pricing: { input: 1.25, output: 2.5 },
    capabilities: {
      promptCache: false, streaming: true, tools: true, vision: true,
      structuredOutput: false, temperature: true, topP: true,
    },
    latencyTier: "balanced",
    qualityTier: "frontier",
  },
  {
    id: "grok-4.5",
    label: "Grok 4.5",
    description: "xAI's flagship (July 2026). Quality-ceiling candidate — dramaturg tier, not voice.",
    provider: "xai",
    modes: ["chat"],
    contextWindow: 500_000,
    maxOutputTokens: 16_384,
    pricing: { input: 2, output: 6 },
    capabilities: {
      promptCache: false, streaming: true, tools: true, vision: true,
      structuredOutput: false, temperature: true, topP: true,
    },
    latencyTier: "balanced",
    qualityTier: "frontier",
  },
  {
    id: "grok-4.20-0309-non-reasoning",
    label: "Grok 4.20 (non-reasoning)",
    description:
      "xAI's non-reasoning 4.20 snapshot — no thinking phase, the xAI fast-lane candidate. Dated id; verify against /v1/models before relying on it.",
    provider: "xai",
    modes: ["chat", "voice"],
    contextWindow: 1_000_000,
    maxOutputTokens: 16_384,
    pricing: { input: 1.25, output: 2.5 },
    capabilities: {
      promptCache: false, streaming: true, tools: true, vision: true,
      structuredOutput: false, temperature: true, topP: true,
    },
    latencyTier: "fast",
    qualityTier: "production",
  },

  // ── DeepSeek — first-party API ───────────────────────────────
  // Live /models (2026-07-30): deepseek-v4-flash, deepseek-v4-pro (the old
  // deepseek-chat/reasoner aliases are GONE). Pricing from api-docs
  // (cache-hit input is ~50x cheaper — their cache is automatic server-side).
  // Thinking is ON by default on both; reasoningEffort may tune it.
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    description:
      "The cost floor: $0.14/$0.28. Thinking on by default — bench latency per effort before any hot-path use.",
    provider: "deepseek",
    modes: ["chat", "voice"],
    contextWindow: 1_000_000,
    maxOutputTokens: 16_384,
    pricing: { input: 0.14, output: 0.28, cacheRead: 0.0028 },
    capabilities: {
      promptCache: false, streaming: true, tools: true, vision: false,
      structuredOutput: false, temperature: true, topP: true,
    },
    latencyTier: "fast",
    qualityTier: "budget",
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    description: "DeepSeek's stronger tier at $0.435/$0.87 — still far below western frontier pricing.",
    provider: "deepseek",
    modes: ["chat"],
    contextWindow: 1_000_000,
    maxOutputTokens: 16_384,
    pricing: { input: 0.435, output: 0.87, cacheRead: 0.003625 },
    capabilities: {
      promptCache: false, streaming: true, tools: true, vision: false,
      structuredOutput: false, temperature: true, topP: true,
    },
    latencyTier: "balanced",
    qualityTier: "production",
  },

  // ── Baseten Model APIs ───────────────────────────────────────
  // Live /models (2026-07-30) also serves GLM-5.2(-Fast), Kimi K2.6/K2.7/K3,
  // DeepSeek-V4-Pro, Mercury-2 — unpriced here, add entries as needed.
  {
    id: "baseten/gpt-oss-120b",
    label: "GPT-OSS 120B (Baseten)",
    description:
      "Same model as the Cerebras default, on the host AA measures at the lowest TTFT anywhere (0.28s vs Cerebras 0.53s). The hot-path TTFT duel entry.",
    provider: "baseten",
    providerModelId: "openai/gpt-oss-120b",
    modes: ["chat", "voice"],
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    pricing: { input: 0.05, output: 0.3 },
    capabilities: {
      promptCache: false, streaming: true, tools: false, vision: false,
      structuredOutput: false, temperature: true, topP: true,
    },
    latencyTier: "instant",
    qualityTier: "production",
  },

  // ── Fireworks AI ─────────────────────────────────────────────
  // Live /models (2026-07-30) also serves kimi-k2p6/k2p7-code/k3, qwen3p7-plus
  // and fast "router" variants (glm-5p2-fast, kimi-k3-fast) — pricing not yet
  // confirmed for those; add entries once priced.
  {
    id: "accounts/fireworks/models/gpt-oss-120b",
    label: "GPT-OSS 120B (Fireworks)",
    description: "The cross-host control for gpt-oss serving (AA: 0.66s TTFT, 123 t/s).",
    provider: "fireworks",
    modes: ["chat", "voice"],
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    pricing: { input: 0.15, output: 0.6 },
    capabilities: {
      promptCache: false, streaming: true, tools: false, vision: false,
      structuredOutput: false, temperature: true, topP: true,
    },
    latencyTier: "fast",
    qualityTier: "production",
  },
  {
    id: "accounts/fireworks/models/glm-5p2",
    label: "GLM 5.2 (Fireworks)",
    description:
      "Zhipu's current open-weights flagship — successor to the GLM 4.7 we run on Cerebras. $1.40/$4.40.",
    provider: "fireworks",
    modes: ["chat"],
    contextWindow: 200_000,
    maxOutputTokens: 16_384,
    pricing: { input: 1.4, output: 4.4 },
    capabilities: {
      promptCache: false, streaming: true, tools: true, vision: false,
      structuredOutput: false, temperature: true, topP: true,
    },
    latencyTier: "balanced",
    qualityTier: "production",
  },

  // ── Google Gemini — OpenAI-compat endpoint ───────────────────
  // NOTE: gemini-2.5-flash-lite is listed on /models but 404s for new
  // accounts ("no longer available to new users", verified 2026-07-30) —
  // deliberately NOT registered despite its AA-best TTFT.
  // Ids verified against the live /v1beta/openai/models list 2026-07-30
  // (bare form, without the native API's "models/" prefix). Pricing from
  // ai.google.dev/gemini-api/docs/pricing (paid tier, text). Latency
  // tiers reflect vendor positioning (Flash ≈ 0.7s TTFT class), not our
  // own bench — sweep before adopting for voice.
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    description: "Google's fast/cheap Flash tier — the Gemini voice-lane candidate.",
    provider: "gemini",
    modes: ["chat", "voice"],
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    pricing: { input: 0.3, output: 2.5 },
    capabilities: {
      promptCache: false, streaming: true, tools: true, vision: true,
      structuredOutput: false, temperature: true, topP: true,
    },
    latencyTier: "fast",
    qualityTier: "budget",
  },
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    description: "Google's mainline Flash. Note the $9/M output rate — pricier out than in-class peers.",
    provider: "gemini",
    modes: ["chat", "voice"],
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    pricing: { input: 1.5, output: 9 },
    capabilities: {
      promptCache: false, streaming: true, tools: true, vision: true,
      structuredOutput: false, temperature: true, topP: true,
    },
    latencyTier: "balanced",
    qualityTier: "production",
  },
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    description: "Google's newest Flash (July 2026).",
    provider: "gemini",
    modes: ["chat"],
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    pricing: { input: 1.5, output: 7.5 },
    capabilities: {
      promptCache: false, streaming: true, tools: true, vision: true,
      structuredOutput: false, temperature: true, topP: true,
    },
    latencyTier: "balanced",
    qualityTier: "production",
  },
];

/* ── Defaults ──────────────────────────────────────────────── */

export const DEFAULT_CHAT_MODEL = "claude-sonnet-4-5";

/**
 * Default model for *voice* contexts. Cerebras gpt-oss-120b is instant-tier
 * TTFT and the strongest open-weights model still on Cerebras's public
 * endpoints. (Was qwen-3-235b-a22b-instruct-2507 until Cerebras retired it —
 * the old qwen id now 404s; gpt-oss-120b was the documented fallback.)
 */
export const DEFAULT_VOICE_MODEL = "gpt-oss-120b";

/* ── Lookup helpers ────────────────────────────────────────── */

export function modelMetaFor(id: string): ModelOption | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

export function providerFor(id: string, fallback: ProviderId = "anthropic"): ProviderId {
  return modelMetaFor(id)?.provider ?? fallback;
}

export function modelsFor(mode: ModelMode): ModelOption[] {
  return MODEL_REGISTRY.filter((m) => m.modes.includes(mode));
}

/** Returns the pricing record for a model, or null if unknown. */
export function pricingFor(id: string): ModelPricing | null {
  return modelMetaFor(id)?.pricing ?? null;
}
