import {
  parseSceneLifecycleMessage,
  SCENE_LIFECYCLE_TOPIC,
  type SceneEndedLifecycleMessage,
} from "@kawabunga/types";

export function sceneEndedForSession(
  payload: Uint8Array,
  topic: string | undefined,
  sessionId: string,
): SceneEndedLifecycleMessage | null {
  if (topic !== SCENE_LIFECYCLE_TOPIC) return null;
  const message = parseSceneLifecycleMessage(payload);
  return message?.sessionId === sessionId ? message : null;
}
