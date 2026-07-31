import { modelMetaFor } from "@kawabunga/engine";
import type { SceneDecisionRequest } from "./client";
import type { OrchestratorDecision } from "@kawabunga/types";

// Orchestrator executor — resolves an OpenAI-compatible chat-completions client
// (Cerebras or Groq) that turns a SceneDecisionRequest into an OrchestratorDecision
// (who speaks next + beat). Lives in the orchestration package so BOTH the admin
// SSE route AND the LiveKit world-agent (services/voice-agent) can run the
// orchestrator in-process — no HTTP hop on the turn-driving path.

export type OrchestratorProvider = "cerebras" | "groq";

export type OrchestratorExecutor = {
  provider: OrchestratorProvider;
  model: string;
  execute(
    request: SceneDecisionRequest,
    opts?: { signal?: AbortSignal },
  ): Promise<OrchestratorDecision>;
};

export type OrchestratorExecutorResolution = {
  executor: OrchestratorExecutor | null;
  reason?: string;
};

export type OrchestratorExecutorConfig = {
  provider?: string | null;
  /** Registry model id override (env: ORCHESTRATOR_MODEL) — the director A/B
   *  knob. The registry supplies the provider, so one knob swaps both; it
   *  outranks ORCHESTRATOR_PROVIDER and the per-provider model vars. Invalid
   *  values are dropped with a one-time warning, never fatal. */
  model?: string | null;
  cerebrasApiKey?: string | null;
  cerebrasModel?: string | null;
  groqApiKey?: string | null;
  groqModel?: string | null;
  fetchImpl?: typeof fetch;
};

const CEREBRAS_ENDPOINT = "https://api.cerebras.ai/v1/chat/completions";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_MAX_COMPLETION_TOKENS = 1024;
// Director calls run 0.4–2s in practice; the timeout is a hung-provider
// backstop, not a latency budget. The turn loop blocks on this call, so a
// stalled fetch would otherwise stall the whole scene.
const DEFAULT_TIMEOUT_MS = 10_000;

export function resolveOrchestratorExecutor(
  config: OrchestratorExecutorConfig = {},
): OrchestratorExecutorResolution {
  const fetchImpl = config.fetchImpl ?? fetch;
  const provider = normalizeProvider(
    config.provider ?? process.env.ORCHESTRATOR_PROVIDER,
  );
  const cerebrasApiKey = normalizeString(
    config.cerebrasApiKey ?? process.env.CEREBRAS_API_KEY,
  );
  const groqApiKey = normalizeString(config.groqApiKey ?? process.env.GROQ_API_KEY);

  // Model override first: a valid ORCHESTRATOR_MODEL picks provider AND model
  // in one move. When its provider's key is missing, fall through to the
  // normal resolution below — a bad override must not take the director down.
  const override = resolveDirectorModelOverride(
    config.model ?? process.env.ORCHESTRATOR_MODEL,
  );
  if (override) {
    const resolution =
      override.provider === "cerebras"
        ? resolveCerebrasExecutor({ apiKey: cerebrasApiKey, model: override.id, fetchImpl })
        : resolveGroqExecutor({ apiKey: groqApiKey, model: override.id, fetchImpl });
    if (resolution.executor) return resolution;
    if (!warnedOverrideKeyMissing.has(override.id)) {
      warnedOverrideKeyMissing.add(override.id);
      console.warn(
        `[orchestrator] model override "${override.id}" needs a ${providerLabel(override.provider)} key (${resolution.reason}) — falling back to default resolution`,
      );
    }
  }

  if (provider === "cerebras") {
    return resolveCerebrasExecutor({
      apiKey: cerebrasApiKey,
      model: config.cerebrasModel ?? process.env.CEREBRAS_ORCHESTRATOR_MODEL,
      fetchImpl,
    });
  }

  if (provider === "groq") {
    return resolveGroqExecutor({
      apiKey: groqApiKey,
      model: config.groqModel ?? process.env.GROQ_ORCHESTRATOR_MODEL,
      fetchImpl,
    });
  }

  if (provider) {
    return {
      executor: null,
      reason: `Unsupported ORCHESTRATOR_PROVIDER: ${provider}`,
    };
  }

  if (cerebrasApiKey) {
    return resolveCerebrasExecutor({
      apiKey: cerebrasApiKey,
      model: config.cerebrasModel ?? process.env.CEREBRAS_ORCHESTRATOR_MODEL,
      fetchImpl,
    });
  }

  if (groqApiKey) {
    return resolveGroqExecutor({
      apiKey: groqApiKey,
      model: config.groqModel ?? process.env.GROQ_ORCHESTRATOR_MODEL,
      fetchImpl,
    });
  }

  return {
    executor: null,
    reason:
      "No orchestrator provider key configured. Set CEREBRAS_API_KEY or GROQ_API_KEY.",
  };
}

type DirectorModelOverride = { id: string; provider: OrchestratorProvider };

// Once-per-value memos: resolveOrchestratorExecutor runs on EVERY director
// decision (SceneDriver#decide, the orchestrate route), so an invalid override
// must warn once, not per turn. Bounded — env values are few.
const overrideMemo = new Map<string, DirectorModelOverride | null>();
const warnedOverrideKeyMissing = new Set<string>();

/**
 * Validate a director model override against the model registry. The director
 * needs an OpenAI-compatible endpoint speaking strict `response_format:
 * json_schema`, which this executor only wires for Cerebras and Groq — a
 * registry model served elsewhere is dropped with a warning, as is an id the
 * registry doesn't know (it would 400/404 on every decision otherwise).
 *
 * Deliberately NOT gated on the registry's `structuredOutput` capability flag:
 * it under-reports response_format support (Cerebras gpt-oss-120b is flagged
 * false yet has run the strict-schema director in production since day one),
 * and a real incompatibility surfaces per-turn through the executor's own
 * error path, where the driver degrades gracefully.
 */
function resolveDirectorModelOverride(
  raw?: string | null,
): DirectorModelOverride | null {
  const id = normalizeString(raw);
  if (!id) return null;
  const memoized = overrideMemo.get(id);
  if (memoized !== undefined) return memoized;

  let resolved: DirectorModelOverride | null = null;
  const meta = modelMetaFor(id);
  if (!meta) {
    console.warn(
      `[orchestrator] ORCHESTRATOR_MODEL="${id}" is not in the model registry — override IGNORED (director keeps its default resolution)`,
    );
  } else if (meta.provider !== "cerebras" && meta.provider !== "groq") {
    console.warn(
      `[orchestrator] ORCHESTRATOR_MODEL="${id}" is served by "${meta.provider}", but the director only speaks the Cerebras/Groq strict-json_schema endpoints — override IGNORED`,
    );
  } else {
    console.log(`[orchestrator] director model override: ${id} (${meta.provider})`);
    resolved = { id, provider: meta.provider };
  }
  overrideMemo.set(id, resolved);
  return resolved;
}

function resolveCerebrasExecutor(opts: {
  apiKey: string | null;
  model?: string | null;
  fetchImpl: typeof fetch;
}): OrchestratorExecutorResolution {
  if (!opts.apiKey) {
    return { executor: null, reason: "CEREBRAS_API_KEY not configured" };
  }

  const model = normalizeString(opts.model) ?? DEFAULT_CEREBRAS_MODEL;
  return {
    executor: createOpenAiCompatibleExecutor({
      provider: "cerebras",
      endpoint: CEREBRAS_ENDPOINT,
      apiKey: opts.apiKey,
      model,
      fetchImpl: opts.fetchImpl,
    }),
  };
}

function resolveGroqExecutor(opts: {
  apiKey: string | null;
  model?: string | null;
  fetchImpl: typeof fetch;
}): OrchestratorExecutorResolution {
  if (!opts.apiKey) {
    return { executor: null, reason: "GROQ_API_KEY not configured" };
  }

  const model = normalizeString(opts.model) ?? DEFAULT_GROQ_MODEL;
  return {
    executor: createOpenAiCompatibleExecutor({
      provider: "groq",
      endpoint: GROQ_ENDPOINT,
      apiKey: opts.apiKey,
      model,
      fetchImpl: opts.fetchImpl,
    }),
  };
}

function createOpenAiCompatibleExecutor(opts: {
  provider: OrchestratorProvider;
  endpoint: string;
  apiKey: string;
  model: string;
  fetchImpl: typeof fetch;
}): OrchestratorExecutor {
  return {
    provider: opts.provider,
    model: opts.model,
    execute: (request, executeOpts) =>
      callOpenAiCompatibleOrchestrator({
        provider: opts.provider,
        endpoint: opts.endpoint,
        apiKey: opts.apiKey,
        model: opts.model,
        request,
        fetchImpl: opts.fetchImpl,
        signal: executeOpts?.signal,
      }),
  };
}

async function callOpenAiCompatibleOrchestrator(opts: {
  provider: OrchestratorProvider;
  endpoint: string;
  apiKey: string;
  model: string;
  request: SceneDecisionRequest;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}): Promise<OrchestratorDecision> {
  // Hung-provider backstop + caller cancellation (e.g. a superseded
  // speculation) in one signal.
  const timeout = AbortSignal.timeout(readTimeoutMs());
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const resp = await opts.fetchImpl(opts.endpoint, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.request.messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "orchestrator_decision",
          strict: true,
          schema: opts.request.responseSchema,
        },
      },
      max_completion_tokens: readMaxCompletionTokens(),
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(
      `${providerLabel(opts.provider)} ${resp.status}: ${detail.slice(0, 300) || "no body"}`,
    );
  }

  const payload = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`${providerLabel(opts.provider)} returned an empty completion.`);
  }

  try {
    return JSON.parse(content) as OrchestratorDecision;
  } catch (parseErr) {
    throw new Error(
      `Failed to parse orchestrator JSON: ${parseErr instanceof Error ? parseErr.message : parseErr}`,
    );
  }
}

function normalizeProvider(value?: string | null): OrchestratorProvider | string | null {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized === "cerebras" || normalized === "groq") return normalized;
  return normalized;
}

function normalizeString(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function providerLabel(provider: OrchestratorProvider): string {
  return provider === "groq" ? "Groq" : "Cerebras";
}

function readMaxCompletionTokens(): number {
  const raw = process.env.ORCHESTRATOR_MAX_COMPLETION_TOKENS?.trim();
  if (!raw) return DEFAULT_MAX_COMPLETION_TOKENS;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_COMPLETION_TOKENS;
  }
  return parsed;
}

function readTimeoutMs(): number {
  const raw = process.env.ORCHESTRATOR_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}
