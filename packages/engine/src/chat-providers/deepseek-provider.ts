import {
  OpenAICompatibleChatProvider,
  type OpenAICompatibleProviderOptions,
} from "./openai-compatible-provider";

/**
 * DeepSeek (first-party API) — OpenAI-compatible endpoint. All call machinery lives in
 * OpenAICompatibleChatProvider.
 *
 * The cost floor ($0.01-0.06/M class). Stable alias ids:
 * `deepseek-chat` (non-thinking) and `deepseek-reasoner` (thinking) -
 * verify against /models with a live key before adding registry
 * entries. Latency varies; bench before any hot-path use.
 */
export class DeepSeekChatProvider extends OpenAICompatibleChatProvider {
  constructor(opts?: OpenAICompatibleProviderOptions) {
    super(
      {
        id: "deepseek",
        apiKeyEnvVar: "DEEPSEEK_API_KEY",
        defaultBaseURL: "https://api.deepseek.com",
      },
      opts,
    );
  }
}
