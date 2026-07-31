import {
  OpenAICompatibleChatProvider,
  type OpenAICompatibleProviderOptions,
} from "./openai-compatible-provider";

/**
 * Baseten Model APIs — OpenAI-compatible endpoint. All call machinery lives in
 * OpenAICompatibleChatProvider.
 *
 * The only host measured with lower TTFT than Cerebras on
 * gpt-oss-120b (0.28s vs 0.53s, Artificial Analysis) - the hot-path
 * TTFT challenger. Verify base URL + model ids against their docs on
 * first key; entries land in the registry after that check.
 */
export class BasetenChatProvider extends OpenAICompatibleChatProvider {
  constructor(opts?: OpenAICompatibleProviderOptions) {
    super(
      {
        id: "baseten",
        apiKeyEnvVar: "BASETEN_API_KEY",
        defaultBaseURL: "https://inference.baseten.co/v1",
      },
      opts,
    );
  }
}
