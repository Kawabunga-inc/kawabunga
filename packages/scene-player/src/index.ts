// @kawabunga/scene-player — reusable live scene player.
//
// ⛔ FROZEN for voice: the browser-driven SSE scene loop is superseded by
// the LiveKit path (services/voice-agent SceneDriver behind
// NEXT_PUBLIC_VOICE_AGENT). See use-scene-player.ts for the rationale and
// ledger measurements. Kept as the flag-off escape hatch and a text/debug
// surface — no new scene features land here.
//
// The multi-character orchestration loop (useScenePlayer), the audio
// primitives (SceneAudioBus for multi-track scene playback, PcmPlayer for
// serial single-stream playback), and their supporting types. Consumed by
// the admin scenes sandbox + character sandbox today.

export { useScenePlayer } from "./use-scene-player";
export type {
  SceneTurn,
  ScenePhase,
  SceneRunnerTrace,
  UseSceneRunnerOptions,
  UseSceneRunnerResult,
  TracePayload,
  TraceContract,
} from "./use-scene-player";

export { SceneAudioBus } from "./scene-audio-bus";
export type { SceneAudioMetrics } from "./scene-audio-bus";
export {
  PcmPlayer,
  base64ToBytes,
  createAudioContext,
} from "./pcm-player";
