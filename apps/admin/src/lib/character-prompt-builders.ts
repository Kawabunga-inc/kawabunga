/**
 * Browser-safe prompt compiler shim.
 *
 * Client harness editors need the pure XML/system-prompt helpers without the
 * @kawabunga/engine barrel's server-only audio adapters. The engine now
 * exposes a browser-safe subpath for exactly this — re-export it so existing
 * imports keep working (new code can import `@kawabunga/engine/prompt`
 * directly).
 */

export {
  buildSystemPrompt,
  buildSystemPromptParts,
  buildVoiceSystemPrompt,
  buildVoiceSystemPromptParts,
  compileDirectiveXml,
  compileIdentityXml,
  compileVoiceXml,
} from "@kawabunga/engine/prompt";
