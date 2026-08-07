import {
  OpenAICompatibleChatProvider,
  type OpenAICompatibleProviderOptions,
} from "./openai-compatible-provider";

/**
 * Groq — OpenAI-compatible endpoint at `/openai/v1`. All call machinery
 * lives in OpenAICompatibleChatProvider.
 *
 * Groq-specific caveat: the on_demand tier's TPM limits (6-12k/min) are
 * far below a character turn's appetite under any concurrency — batch
 * workloads (eval sweeps) throttle hard without a paid tier.
 */
export class GroqChatProvider extends OpenAICompatibleChatProvider {
  constructor(opts?: OpenAICompatibleProviderOptions) {
    super(
      {
        id: "groq",
        apiKeyEnvVar: "GROQ_API_KEY",
        defaultBaseURL: "https://api.groq.com/openai/v1",
      },
      opts,
    );
  }
}
