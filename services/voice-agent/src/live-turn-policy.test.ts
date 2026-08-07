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

describe("narratorKeepsFloor — the opening is a preamble", () => {
  it("yields the opening to any speech, addressed or not", () => {
    // Openings are authored and unbounded in length. A visitor who speaks into
    // one has decided to begin; making them wait it out to be answered is the
    // opposite of responsive. Before this, a 40s opening meant a 40s wait.
    expect(
      narratorKeepsFloor({ narrating: true, opening: true, addressesNarrator: false }),
    ).toBe(false);
    expect(
      narratorKeepsFloor({ narrating: true, opening: true, addressesNarrator: true }),
    ).toBe(false);
  });

  it("still holds mid-scene narration against unaddressed speech", () => {
    // The distinction that matters: a consequence landing is a beat nothing
    // replays, so a cough must not cost it.
    expect(
      narratorKeepsFloor({ narrating: true, opening: false, addressesNarrator: false }),
    ).toBe(true);
  });

  it("treats an absent opening flag as mid-scene", () => {
    // Callers that predate the flag must keep the protective behaviour.
    expect(narratorKeepsFloor({ narrating: true, addressesNarrator: false })).toBe(true);
  });

  it("does not resurrect the floor when nothing is playing", () => {
    expect(
      narratorKeepsFloor({ narrating: false, opening: true, addressesNarrator: false }),
    ).toBe(false);
  });
});
