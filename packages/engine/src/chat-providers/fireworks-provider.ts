import {
  OpenAICompatibleChatProvider,
  type OpenAICompatibleProviderOptions,
} from "./openai-compatible-provider";

/**
 * Fireworks AI — OpenAI-compatible endpoint. All call machinery lives in
 * OpenAICompatibleChatProvider.
 *
 * Serves the open-weights catalog (DeepSeek, Kimi, Qwen, Llama, GLM)
 * with real rate limits - the fix for the Groq on_demand TPM wall.
 * Model ids use the accounts/fireworks/models/<name> form - verify
 * against their live model list before adding registry entries.
 */
export class FireworksChatProvider extends OpenAICompatibleChatProvider {
  constructor(opts?: OpenAICompatibleProviderOptions) {
    super(
      {
        id: "fireworks",
        apiKeyEnvVar: "FIREWORKS_API_KEY",
        defaultBaseURL: "https://api.fireworks.ai/inference/v1",
      },
      opts,
    );
  }
}
