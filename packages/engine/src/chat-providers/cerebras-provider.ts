import {
  OpenAICompatibleChatProvider,
  type OpenAICompatibleProviderOptions,
} from "./openai-compatible-provider";

/**
 * Cerebras — open-weights models (Llama, Qwen, GPT-OSS, GLM, ...) on
 * wafer-scale silicon with sub-200ms TTFT, behind an OpenAI-compatible
 * endpoint. All call machinery lives in OpenAICompatibleChatProvider.
 *
 * Cerebras-specific caveat: the voice-first lineup is also marked
 * `modes: ["chat"]` in the registry now, but character-coherence at
 * long-form chat is uneven — eval before adopting.
 */
export class CerebrasChatProvider extends OpenAICompatibleChatProvider {
  constructor(opts?: OpenAICompatibleProviderOptions) {
    super(
      {
        id: "cerebras",
        apiKeyEnvVar: "CEREBRAS_API_KEY",
        defaultBaseURL: "https://api.cerebras.ai/v1",
      },
      opts,
    );
  }
}
