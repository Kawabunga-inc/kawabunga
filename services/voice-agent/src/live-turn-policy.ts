// Technical runaway ceiling only. The scene director owns spoken length through
// OrchestratorDecision.delivery; reasoning models also spend hidden reasoning
// inside this budget, so it must not double as a prose-length control.
const DEFAULT_LIVE_VOICE_MAX_TOKENS = 2048;

export function resolveLiveVoiceMaxTokens(value = process.env.VOICE_AGENT_REPLY_MAX_TOKENS): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIVE_VOICE_MAX_TOKENS;
  return Math.max(1024, Math.min(4096, Math.round(parsed)));
}
