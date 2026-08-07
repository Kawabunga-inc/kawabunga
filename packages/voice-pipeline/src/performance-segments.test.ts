import { describe, expect, it } from "vitest";
import {
  classifySegment,
  splitPerformanceSegments,
  stripSurroundingDialogueQuotes,
  stageDirectionVoice,
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

describe("stageDirectionVoice", () => {
  // Every string below is a real stage direction taken from live session
  // transcripts, not invented for the test.
  it("gives third-person action to the narrator", () => {
    for (const text of [
      "steps into the firelight, hand outstretched",
      "Abraham lifts a jug and pours water into a basin",
      "He lifts his hand, the firelight catching his weathered face.",
      "She releases a short, incredulous laugh.",
      "A shiver climbs her spine before she can stop it",
    ]) {
      expect(stageDirectionVoice(text)).toBe("narration");
    }
  });

  it("gives first-person action back to the character", () => {
    // The narrator saying "I turn my gaze to the fire" is the defect: it
    // narrates as though it were Abraham.
    for (const text of [
      "I turn my gaze to the fire, the smoke rising like prayer.",
      "I let a startled laugh rise, then choke it.",
      "I stare at the ember-blackened spot where Sarah fell",
      "I'm shaking as I reach for the waterskin",
      "My hands tremble against the tent pole",
    ]) {
      expect(stageDirectionVoice(text)).toBe("character");
    }
  });

  it("does not mistake a word that merely starts with i", () => {
    // "Isaac", "in", "if" — a prefix match here would silently hand a whole
    // class of ordinary third-person action to the wrong voice.
    for (const text of [
      "Isaac steps back from the fire",
      "into the dark he goes, without looking back",
      "if he hears it, he gives no sign",
      "Miriam sets down the basin",
    ]) {
      expect(stageDirectionVoice(text)).toBe("narration");
    }
  });

  it("anchors on the opening subject, not a later one", () => {
    // A compound sentence whose SUBJECT is third person still belongs to the
    // narrator, even when an "I" appears further along.
    expect(
      stageDirectionVoice("the smoke rises like prayer, and I wait for an answer"),
    ).toBe("narration");
  });

  it("tolerates leading whitespace left by the splitter", () => {
    expect(stageDirectionVoice("   I turn away")).toBe("character");
    expect(stageDirectionVoice("   turns away")).toBe("narration");
  });
});
