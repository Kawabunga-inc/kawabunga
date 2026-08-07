import { describe, expect, it, vi } from "vitest";
import { createSceneEndPublisher } from "./scene-lifecycle";

describe("voice-agent scene-ended publisher", () => {
  it("publishes exactly once, reliably, with the first end reason", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const end = createSceneEndPublisher({ sessionId: "session-1", publish });
    await end("director");
    await end("host");
    expect(publish).toHaveBeenCalledTimes(1);
    const [bytes, options] = publish.mock.calls[0]!;
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual({
      type: "scene-ended", sessionId: "session-1", reason: "director",
    });
    expect(options).toEqual({ reliable: true, topic: "odyssey.lifecycle" });
  });
});
