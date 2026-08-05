import { describe, expect, it } from "vitest";
import { parseSceneLifecycleMessage, SCENE_LIFECYCLE_TOPIC } from "@kawabunga/types";
import { sceneEndedForSession } from "./scene-lifecycle";

describe("scene lifecycle wire contract", () => {
  it("accepts the exact reliable scene-ended payload", () => {
    expect(SCENE_LIFECYCLE_TOPIC).toBe("odyssey.lifecycle");
    expect(parseSceneLifecycleMessage(new TextEncoder().encode(JSON.stringify({
      type: "scene-ended", sessionId: "session-1", reason: "director",
    })))).toEqual({ type: "scene-ended", sessionId: "session-1", reason: "director" });
    expect(parseSceneLifecycleMessage('{"type":"scene-ended","sessionId":"session-1","reason":"host"}'))
      .toEqual({ type: "scene-ended", sessionId: "session-1", reason: "host" });
  });

  it("rejects malformed, unknown, and incomplete lifecycle data", () => {
    expect(parseSceneLifecycleMessage("nope")).toBeNull();
    expect(parseSceneLifecycleMessage('{"type":"scene-ended","sessionId":"","reason":"host"}')).toBeNull();
    expect(parseSceneLifecycleMessage('{"type":"scene-ended","sessionId":"s","reason":"client"}')).toBeNull();
  });

  it("ends only the addressed session on the lifecycle topic", () => {
    const payload = new TextEncoder().encode(JSON.stringify({
      type: "scene-ended", sessionId: "session-1", reason: "director",
    }));
    expect(sceneEndedForSession(payload, "odyssey.transcript", "session-1")).toBeNull();
    expect(sceneEndedForSession(payload, SCENE_LIFECYCLE_TOPIC, "session-2")).toBeNull();
    expect(sceneEndedForSession(payload, SCENE_LIFECYCLE_TOPIC, "session-1")?.reason).toBe("director");
  });
});
