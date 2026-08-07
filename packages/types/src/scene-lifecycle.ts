export const SCENE_LIFECYCLE_TOPIC = "odyssey.lifecycle" as const;

/**
 * Explicit LiveKit dispatch name shared by token minting and the voice worker.
 * Keeping this stable prevents an older unnamed worker in the same LiveKit
 * project from silently handling a room with a stale scene runtime.
 */
export const LIVE_SCENE_AGENT_NAME = "kawabunga-live-scene-v1" as const;

export function resolveLiveSceneAgentName(value?: string): string {
  return value?.trim() || LIVE_SCENE_AGENT_NAME;
}

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
