import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sessionTransportOf } from "./session-index-data";

describe("sessionTransportOf", () => {
  it("labels admin-live sessions as the real LiveKit transport", () => {
    expect(sessionTransportOf({ source: "admin-live" })).toBe("livekit");
  });
});
