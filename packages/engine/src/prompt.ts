/**
 * Browser-safe prompt-compiler barrel — importable as
 * `@kawabunga/engine/prompt`.
 *
 * The main engine barrel also exports server-only audio adapters (Node
 * modules, transformers) that must never reach client chunks. Client code
 * that only needs the pure L01–L04 compilers imports this subpath instead
 * of reaching into engine internals with deep relative paths.
 */
export {
  buildSystemPrompt,
  buildSystemPromptParts,
  buildVoiceSystemPrompt,
  buildVoiceSystemPromptParts,
} from "./character-system-prompt";
export { compileDirectiveXml } from "./directive-xml";
export { compileIdentityXml } from "./identity-xml";
export { compileVoiceXml } from "./voice-xml";
