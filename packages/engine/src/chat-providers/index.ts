import { providerFor } from "../model-registry";
import { AnthropicChatProvider } from "./anthropic-provider";
import { OpenAIChatProvider } from "./openai-provider";
import { CerebrasChatProvider } from "./cerebras-provider";
import { GroqChatProvider } from "./groq-provider";
import { XaiChatProvider } from "./xai-provider";
import { GeminiChatProvider } from "./gemini-provider";
import { FireworksChatProvider } from "./fireworks-provider";
import { DeepSeekChatProvider } from "./deepseek-provider";
import { BasetenChatProvider } from "./baseten-provider";
import type { ChatProvider } from "./types";

/**
 * Factory for chat providers. Instances are cached per process so the
 * underlying SDK clients (which keep sockets warm and respect their own
 * pooling) aren't re-created per request.
 *
 * Callers don't usually pick a provider directly — they pass the model
 * id and let `getChatProviderForModel()` resolve it via the registry.
 * That keeps "which SDK does GPT-5 use" in one place (the registry's
 * `provider` field).
 *
 * Cerebras and Groq both use OpenAI-compatible Chat Completions providers,
 * so low-latency voice models share the same provider-neutral interface as
 * Anthropic and OpenAI.
 */

const cache = new Map<string, ChatProvider>();

/** Provider ids that have a ChatProvider implementation. Update the union
 * + the switch below in lockstep when a new provider is wired. */
export type ChatCapableProvider =
  | "anthropic"
  | "openai"
  | "cerebras"
  | "groq"
  | "xai"
  | "gemini"
  | "fireworks"
  | "deepseek"
  | "baseten";

export function getChatProvider(provider: ChatCapableProvider): ChatProvider {
  const cached = cache.get(provider);
  if (cached) return cached;

  let instance: ChatProvider;
  switch (provider) {
    case "anthropic":
      instance = new AnthropicChatProvider();
      break;
    case "openai":
      instance = new OpenAIChatProvider();
      break;
    case "cerebras":
      instance = new CerebrasChatProvider();
      break;
    case "groq":
      instance = new GroqChatProvider();
      break;
    case "xai":
      instance = new XaiChatProvider();
      break;
    case "gemini":
      instance = new GeminiChatProvider();
      break;
    case "fireworks":
      instance = new FireworksChatProvider();
      break;
    case "deepseek":
      instance = new DeepSeekChatProvider();
      break;
    case "baseten":
      instance = new BasetenChatProvider();
      break;
    default:
      // Exhaustiveness — if we ever add another chat-capable provider
      // to the ChatCapableProvider union, this throws until it's wired.
      throw new Error(`unsupported chat provider: ${provider satisfies never}`);
  }
  cache.set(provider, instance);
  return instance;
}

/** Resolve a chat provider from a model id via the shared registry. */
export function getChatProviderForModel(modelId: string): ChatProvider {
  const provider = providerFor(modelId, "anthropic");
  if (
    provider !== "anthropic" &&
    provider !== "openai" &&
    provider !== "cerebras" &&
    provider !== "groq" &&
    provider !== "xai" &&
    provider !== "gemini" &&
    provider !== "fireworks" &&
    provider !== "deepseek" &&
    provider !== "baseten"
  ) {
    throw new Error(
      `model ${modelId} belongs to provider ${provider} which has no chat provider wired`,
    );
  }
  return getChatProvider(provider);
}

export type {
  ChatProvider,
  ChatRequestOptions,
  ChatResponse,
  ChatStreamEvent,
  ChatSystemBlock,
  ChatMessage,
} from "./types";
export { AnthropicChatProvider } from "./anthropic-provider";
export { OpenAIChatProvider } from "./openai-provider";
export { CerebrasChatProvider } from "./cerebras-provider";
export { GroqChatProvider } from "./groq-provider";
export { XaiChatProvider } from "./xai-provider";
export { GeminiChatProvider } from "./gemini-provider";
export { FireworksChatProvider } from "./fireworks-provider";
export { DeepSeekChatProvider } from "./deepseek-provider";
export { BasetenChatProvider } from "./baseten-provider";
export {
  OpenAICompatibleChatProvider,
  type OpenAICompatibleProviderConfig,
  type OpenAICompatibleProviderOptions,
} from "./openai-compatible-provider";
