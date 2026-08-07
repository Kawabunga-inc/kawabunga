import {
  SCENE_LIFECYCLE_TOPIC,
  type SceneEndedLifecycleMessage,
} from "@kawabunga/types";

export function createSceneEndPublisher(input: {
  sessionId: string;
  publish(payload: Uint8Array, options: { reliable: true; topic: typeof SCENE_LIFECYCLE_TOPIC }): Promise<unknown> | undefined;
}) {
  const encoder = new TextEncoder();
  let published = false;
  return async (reason: SceneEndedLifecycleMessage["reason"]): Promise<void> => {
    if (published) return;
    published = true;
    const message: SceneEndedLifecycleMessage = {
      type: "scene-ended",
      sessionId: input.sessionId,
      reason,
    };
    await input.publish(encoder.encode(JSON.stringify(message)), {
      reliable: true,
      topic: SCENE_LIFECYCLE_TOPIC,
    });
  };
}
