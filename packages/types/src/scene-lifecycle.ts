export const SCENE_LIFECYCLE_TOPIC = "odyssey.lifecycle" as const;

export type SceneEndedLifecycleMessage = {
  type: "scene-ended";
  sessionId: string;
  reason: "director" | "host";
};

export function parseSceneLifecycleMessage(
  value: Uint8Array | string,
): SceneEndedLifecycleMessage | null {
  try {
    const decoded = typeof value === "string" ? value : new TextDecoder().decode(value);
    const message = JSON.parse(decoded) as Record<string, unknown>;
    if (
      message.type !== "scene-ended" ||
      typeof message.sessionId !== "string" ||
      !message.sessionId ||
      (message.reason !== "director" && message.reason !== "host")
    ) {
      return null;
    }
    return {
      type: "scene-ended",
      sessionId: message.sessionId,
      reason: message.reason,
    };
  } catch {
    return null;
  }
}
