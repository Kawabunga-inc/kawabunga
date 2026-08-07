import {
  OpenAICompatibleChatProvider,
  type OpenAICompatibleProviderOptions,
} from "./openai-compatible-provider";

/**
 * xAI (Grok) — OpenAI-compatible endpoint at `api.x.ai/v1`. All call
 * machinery lives in OpenAICompatibleChatProvider.
 *
 * xAI-specific caveats:
 *   - Model ids churn: xAI retires/aliases aggressively (grok-3*,
 *     grok-4-fast are gone). Verify against GET /v1/models before adding
 *     registry entries.
 *   - Long-context requests (>200k tokens) bill at ~2× list price; our
 *     turns never approach that.
 *   - xAI caches prompts server-side but this provider doesn't surface
 *     cache accounting (`cacheState: "off"`).
 */
export class XaiChatProvider extends OpenAICompatibleChatProvider {
  constructor(opts?: OpenAICompatibleProviderOptions) {
    super(
      {
        id: "xai",
        apiKeyEnvVar: "XAI_API_KEY",
        defaultBaseURL: "https://api.x.ai/v1",
      },
      opts,
    );
  }
}
