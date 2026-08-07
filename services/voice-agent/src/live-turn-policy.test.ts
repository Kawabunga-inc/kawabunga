import { describe, expect, it } from "vitest";
import { narratorKeepsFloor, resolveLiveVoiceMaxTokens } from "./live-turn-policy";
import { isNarratorAddressed } from "@kawabunga/orchestration";

describe("live turn policy", () => {
  it("keeps a generous technical ceiling without using it as a prose-length cap", () => {
    expect(resolveLiveVoiceMaxTokens(undefined)).toBe(2048);
    expect(resolveLiveVoiceMaxTokens("12")).toBe(1024);
    expect(resolveLiveVoiceMaxTokens("9000")).toBe(4096);
  });
});

describe("narratorKeepsFloor", () => {
  it("never holds the floor when the narrator is not speaking", () => {
    expect(narratorKeepsFloor({ narrating: false, addressesNarrator: false })).toBe(false);
    // Even an explicit narrator address is an ordinary turn when nothing plays.
    expect(narratorKeepsFloor({ narrating: false, addressesNarrator: true })).toBe(false);
  });

  it("holds the floor against speech that is not addressed to it", () => {
    // The cough, the aside, the thinking-out-loud — none of these should cost
    // the scene a beat of narration.
    expect(narratorKeepsFloor({ narrating: true, addressesNarrator: false })).toBe(true);
  });

  it("yields the floor the moment the narrator is addressed", () => {
    // "Narrator, ..." is the visitor taking the helm — the one interruption
    // the narrator channel exists to accept.
    expect(narratorKeepsFloor({ narrating: true, addressesNarrator: true })).toBe(false);
  });
});

describe("narrator address detection drives the floor", () => {
  // The policy is only as good as what counts as an address, so pin the
  // pairing end to end rather than trusting the boolean in isolation.
  const held = (text: string) =>
    narratorKeepsFloor({ narrating: true, addressesNarrator: isNarratorAddressed(text) });

  it("yields to a narrator vocative", () => {
    expect(held("Narrator, several armed men come behind me.")).toBe(false);
    expect(held("wait — narrator")).toBe(false);
  });

  it("holds against ordinary speech, including a mere mention", () => {
    expect(held("Abraham, what do you mean by that?")).toBe(true);
    expect(held("sorry, go on")).toBe(true);
    // "narrator" buried mid-sentence is a mention, not an address.
    expect(held("I wondered what the narrator would say next")).toBe(true);
  });
});
