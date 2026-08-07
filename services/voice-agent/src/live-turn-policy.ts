// Technical runaway ceiling only. The scene director owns spoken length through
// OrchestratorDecision.delivery; reasoning models also spend hidden reasoning
// inside this budget, so it must not double as a prose-length control.
const DEFAULT_LIVE_VOICE_MAX_TOKENS = 2048;

export function resolveLiveVoiceMaxTokens(value = process.env.VOICE_AGENT_REPLY_MAX_TOKENS): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIVE_VOICE_MAX_TOKENS;
  return Math.max(1024, Math.min(4096, Math.round(parsed)));
}

/**
 * Does the narrator keep the floor through this utterance?
 *
 * A character is a conversational partner and can be cut off mid-word. The
 * narrator is not: its line is a beat of the story, and nothing replays it.
 * Session a726ec1b lost its climax exactly this way — the armed-men narration
 * was cancelled at 158 characters billed and 0ms of audio, and the visitor
 * left 18 seconds later.
 *
 * So while the narrator speaks, only speech ADDRESSED to the narrator takes
 * the floor — that is the visitor taking the helm, which is what the narrator
 * channel is for. Everything else defers: held, then replayed once the line
 * lands. Deferring is not dropping; the visitor is answered a beat later
 * rather than ignored.
 *
 * The decision cannot be made when barge-in fires. VAD reports sound; the
 * words arrive ~700ms later at the endpoint. This runs on the transcript.
 */
export function narratorKeepsFloor(input: {
  narrating: boolean;
  addressesNarrator: boolean;
}): boolean {
  if (!input.narrating) return false;
  return !input.addressesNarrator;
}
