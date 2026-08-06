import { describe, expect, it } from "vitest";
import {
  classifySegment,
  splitPerformanceSegments,
  stripSurroundingDialogueQuotes,
} from "./performance-segments";

describe("performance segments", () => {
  it("splits the observed Sarah narration from her quoted dialogue", () => {
    expect(splitPerformanceSegments(
      "She loosens her grip, Abraham's ragged gasp spilling into the night. 'Betrayed, Abraham—after all this?'",
      "Sarah",
    )).toEqual([
      {
        kind: "stage",
        text: "She loosens her grip, Abraham's ragged gasp spilling into the night.",
      },
      { kind: "dialogue", text: "Betrayed, Abraham—after all this?" },
    ]);
  });

  it("splits marked acting from spoken dialogue", () => {
    expect(splitPerformanceSegments("*She rises.* You dare?", "Sarah")).toEqual([
      { kind: "stage", text: "She rises." },
      { kind: "dialogue", text: "You dare?" },
    ]);
  });

  it("keeps whole bracketed directions as silent metadata", () => {
    expect(classifySegment("(No reply needed)", "Sarah")).toBe("meta");
    expect(splitPerformanceSegments("[a pause]", "Sarah")).toEqual([
      { kind: "meta", text: "[a pause]" },
    ]);
  });

  it("recognizes conservative named and pronoun action subjects", () => {
    expect(classifySegment("She loosens her grip.", "Sarah")).toBe("stage");
    expect(classifySegment("Sarah slowly rises.", "Sarah")).toBe("stage");
    expect(classifySegment("Abraham's hands tremble as he reaches for her.", "Abraham"))
      .toBe("stage");
  });

  it("defaults ambiguous third-person-shaped speech to dialogue", () => {
    expect(classifySegment("She knows the answer.", "Sarah")).toBe("dialogue");
    expect(classifySegment("Her answer is no.", "Sarah")).toBe("dialogue");
    expect(classifySegment("You know what she did.", "Sarah")).toBe("dialogue");
  });

  it("strips only fully surrounding dialogue quotes", () => {
    expect(stripSurroundingDialogueQuotes("“I remember.”")).toBe("I remember.");
    expect(stripSurroundingDialogueQuotes("'I remember!' ")).toBe("I remember!");
    expect(stripSurroundingDialogueQuotes("I said ‘enough.’")).toBe("I said ‘enough.’");
  });

  it("folds single-word emphasis asterisks into dialogue, keeps action verbs as stage", () => {
    // Observed live: Sonnet wrote "…bends toward *you*." — emphasis, not acting.
    expect(
      splitPerformanceSegments("or you'll find my blade bends toward *you*.", "Sarah"),
    ).toEqual([{ kind: "dialogue", text: "or you'll find my blade bends toward you." }]);
    // The emphasized word must stay inside ONE dialogue segment (prosody).
    expect(splitPerformanceSegments("*you*", "Sarah")).toEqual([
      { kind: "dialogue", text: "you" },
    ]);
    // A lone action verb is still acting.
    expect(splitPerformanceSegments("*nods*", "Sarah")).toEqual([
      { kind: "stage", text: "nods" },
    ]);
    // Multi-word spans keep the acting channel.
    expect(splitPerformanceSegments("*She rises.* You dare?", "Sarah")).toEqual([
      { kind: "stage", text: "She rises." },
      { kind: "dialogue", text: "You dare?" },
    ]);
  });

});
