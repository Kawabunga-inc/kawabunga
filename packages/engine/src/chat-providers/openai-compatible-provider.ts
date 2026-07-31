import OpenAI from "openai";
import { modelMetaFor, type ProviderId } from "../model-registry";
import type {
  ChatProvider,
  ChatRequestOptions,
  ChatResponse,
  ChatStreamEvent,
  ChatSystemBlock,
} from "./types";

/**
 * Shared ChatProvider implementation for every host that speaks the OpenAI
 * Chat Completions dialect — Cerebras, Groq, xAI, and whichever
 * OpenAI-compatible host comes next. Adding one is a subclass naming its
 * id, key env var, and base URL (plus registry entries); the streaming
 * machinery, usage accounting, and capability-aware sampling live here
 * once. (Cerebras and Groq were byte-identical copies before this.)
 *
 * Deliberately NOT used for OpenAI itself: openai-provider.ts carries
 * OpenAI-specific behavior (reasoning-model param quirks) and stays
 * separate, as does Anthropic (different SDK, prompt caching).
 *
 * Shared behavior notes:
 *   - No prompt cache surfaced — `cacheState: "off"` always, even where
 *     the host caches internally (xAI). Wire per-host if it ever matters.
 *   - Tools / vision / structured output: model-dependent; the registry's
 *     capabilities field is the source of truth. Requests pass through
 *     regardless; the API errors back if a model can't do what was asked.
 *   - Some models lock `temperature` / `top_p`; capability-aware sampling
 *     drops the param up-front (mirrors the OpenAI provider's behavior).
 */
export type OpenAICompatibleProviderConfig = {
  /** Provider identity — must match the registry's `provider` field. */
  id: ProviderId;
  /** Env var holding the API key (e.g. "CEREBRAS_API_KEY"). */
  apiKeyEnvVar: string;
  /** Production base URL for the host's OpenAI-compatible endpoint. */
  defaultBaseURL: string;
};

export type OpenAICompatibleProviderOptions = {
  apiKey?: string;
  /** Override base URL — defaults to the host's production endpoint. */
  baseURL?: string;
  timeoutMs?: number;
  maxRetries?: number;
};

export class OpenAICompatibleChatProvider implements ChatProvider {
  readonly id: ProviderId;

  private readonly client: OpenAI;

  constructor(
    config: OpenAICompatibleProviderConfig,
    opts?: OpenAICompatibleProviderOptions,
  ) {
    this.id = config.id;
    const apiKey = opts?.apiKey ?? process.env[config.apiKeyEnvVar]?.trim();
    if (!apiKey) {
      throw new Error(
        `${config.apiKeyEnvVar} is required for the ${config.id} chat provider`,
      );
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: opts?.baseURL ?? config.defaultBaseURL,
      maxRetries: opts?.maxRetries ?? 0,
      timeout: opts?.timeoutMs ?? 170_000,
    });
  }

  async complete(opts: ChatRequestOptions): Promise<ChatResponse> {
    const t0 = Date.now();
    const messages = toChatMessages(opts.system, opts.messages);
    const knobs = compatibleSampling(opts);

    const resp = await this.client.chat.completions.create({
      model: wireModelId(opts.model),
      messages,
      max_completion_tokens: opts.maxTokens,
      ...knobs,
      ...reasoningKnob(opts),
    });

    const text = (resp.choices[0]?.message?.content ?? "").trim();
    const inputTokens = resp.usage?.prompt_tokens ?? 0;
    const outputTokens = resp.usage?.completion_tokens ?? 0;

    return {
      text,
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      cacheState: "off",
      model: opts.model,
      latencyMs: Date.now() - t0,
    };
  }

  async stream(
    opts: ChatRequestOptions,
    onEvent: (event: ChatStreamEvent) => void,
  ): Promise<void> {
    const messages = toChatMessages(opts.system, opts.messages);
    const knobs = compatibleSampling(opts);
    try {
      const stream = await this.client.chat.completions.create({
        model: wireModelId(opts.model),
        messages,
        max_completion_tokens: opts.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        ...knobs,
        ...reasoningKnob(opts),
      });

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        if (opts.signal?.aborted) {
          throw new Error("request aborted");
        }
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          onEvent({ type: "token", delta });
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? 0;
          outputTokens = chunk.usage.completion_tokens ?? 0;
        }
      }

      onEvent({
        type: "done",
        inputTokens,
        outputTokens,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        cacheState: "off",
        model: opts.model,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onEvent({ type: "error", message: msg });
    }
  }
}

/** xAI extends OpenAI's reasoning_effort enum with "none", so the value is
 *  cast past the SDK's narrower union. Only sent when the caller set it —
 *  models that don't take the param would 400 on an unconditional send. */
function reasoningKnob(
  opts: ChatRequestOptions,
): { reasoning_effort?: OpenAI.Chat.Completions.ChatCompletionCreateParams["reasoning_effort"] } {
  if (!opts.reasoningEffort) return {};
  return {
    reasoning_effort:
      opts.reasoningEffort as OpenAI.Chat.Completions.ChatCompletionCreateParams["reasoning_effort"],
  };
}

/** Registry id → the id the provider's API expects. Identity for all but
 *  cross-host duplicates (ModelOption.providerModelId). Reported usage keeps
 *  the REGISTRY id so pricing/traces stay keyed consistently. */
function wireModelId(modelId: string): string {
  return modelMetaFor(modelId)?.providerModelId ?? modelId;
}

function compatibleSampling(opts: ChatRequestOptions): { temperature?: number; top_p?: number } {
  const meta = modelMetaFor(opts.model);
  const out: { temperature?: number; top_p?: number } = {};
  const allowTemp = meta?.capabilities.temperature ?? true;
  const allowTopP = meta?.capabilities.topP ?? true;
  if (allowTemp && typeof opts.temperature === "number") out.temperature = opts.temperature;
  if (allowTopP && typeof opts.topP === "number") out.top_p = opts.topP;
  return out;
}

function toChatMessages(
  system: ChatSystemBlock[],
  messages: { role: "user" | "assistant"; content: string }[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  const systemText = system
    .filter((b) => b.text.trim().length > 0)
    .map((b) => b.text)
    .join("\n\n");
  if (systemText.length > 0) {
    out.push({ role: "system", content: systemText });
  }
  for (const m of messages) {
    out.push({ role: m.role, content: m.content });
  }
  return out;
}
