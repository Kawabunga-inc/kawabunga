import {
  OpenAICompatibleChatProvider,
  type OpenAICompatibleProviderOptions,
} from "./openai-compatible-provider";

/**
 * Google Gemini via the Gemini API's OpenAI-compatibility endpoint. All
 * call machinery lives in OpenAICompatibleChatProvider.
 *
 * Gemini-specific caveats:
 *   - Model ids are the BARE form ("gemini-3.5-flash"), not the native
 *     API's "models/gemini-3.5-flash" — the compat endpoint accepts both,
 *     the registry standardizes on bare.
 *   - Implicit server-side caching exists but isn't surfaced here
 *     (`cacheState: "off"`).
 *   - The compat layer is a subset of the native API (no thinking budget,
 *     no native audio); switch to the native SDK if those ever matter.
 */
export class GeminiChatProvider extends OpenAICompatibleChatProvider {
  constructor(opts?: OpenAICompatibleProviderOptions) {
    super(
      {
        id: "gemini",
        apiKeyEnvVar: "GEMINI_API_KEY",
        defaultBaseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      },
      opts,
    );
  }
}
