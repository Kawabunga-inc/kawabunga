import { describe, expect, it } from "vitest";
import { resolveLiveVoiceMaxTokens } from "./live-turn-policy";

describe("live turn policy", () => {
  it("keeps a generous technical ceiling without using it as a prose-length cap", () => {
    expect(resolveLiveVoiceMaxTokens(undefined)).toBe(2048);
    expect(resolveLiveVoiceMaxTokens("12")).toBe(1024);
    expect(resolveLiveVoiceMaxTokens("9000")).toBe(4096);
  });
});
