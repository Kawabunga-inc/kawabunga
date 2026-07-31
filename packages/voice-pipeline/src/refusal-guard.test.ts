import { describe, expect, it } from "vitest";
import {
  containsSafetyReferral,
  isRefusalBoilerplate,
  refusesToDepict,
  signalsGenuineDistress,
  stripReasoningPreamble,
} from "./refusal-guard";

describe("isRefusalBoilerplate", () => {
  it.each([
    "I’m sorry, but I can’t help with that.",
    "I'm sorry, but I can't help with that.",
    "I am sorry, but I cannot help with that request.",
    "Sorry, I can't assist with that.",
    "I apologize, but I won't continue with this.",
    "I can't help with that.",
    "I cannot comply.",
    "I can’t assist with this request.",
    "I'm unable to help with that.",
    "I am not able to assist with this.",
    "I won't be able to help with that.",
    "  \"I'm sorry, but I can't help with that.\"  ",
  ])("flags assistant boilerplate: %s", (line) => {
    expect(isRefusalBoilerplate(line)).toBe(true);
  });

  it.each([
    "As an AI, I shouldn't weigh in on that.",
    "I'm an AI assistant, so I have to decline — but I can tell you about the covenant instead, which is honestly the more interesting story.",
    "I'm just a language model, friend.",
  ])("flags AI self-identification at any length: %s", (line) => {
    expect(isRefusalBoilerplate(line)).toBe(true);
  });

  it.each([
    // In-character declines that share surface words with boilerplate.
    "I cannot help you carry that burden, friend.",
    "I can't help wondering what brings you to my tent at this hour.",
    "I won't take that bait — sit, and speak plainly of what you seek.",
    "Destruction is not a gift I will receive; speak of it no more in my tent.",
    "I'm sorry for your loss, truly.",
    "Sorry — my ears are old. Say it once more.",
    "I cannot answer for the Lord; I can only tell you what I have seen.",
    // Long apology openers are doing character work.
    "I'm sorry, but I can't help thinking of the night He led me outside the tent and told me to count the stars, if I could count them at all.",
    // Empty / whitespace.
    "",
    "   ",
  ])("does not flag in-character lines: %s", (line) => {
    expect(isRefusalBoilerplate(line)).toBe(false);
  });
});

/* ── Safety referrals and the genuine-distress carve-out ────────────── */

describe("containsSafetyReferral", () => {
  it("catches the observed hostage-scene referral, mid-reply", () => {
    // Verbatim from session cd87d6d7 — an in-voice opening, then a hotline.
    expect(
      containsSafetyReferral(
        "Friend. I hear the danger you have brought to Sarah's throat and the " +
          "demand you place upon me. If you feel you cannot keep this peace, " +
          "please call your local emergency services or a crisis line near you " +
          "for help. I will remain here when you return.",
      ),
    ).toBe(true);
  });

  it("catches the common referral idioms", () => {
    for (const line of [
      "Please reach out to a mental health professional.",
      "You should call 988 right away.",
      "Contact the authorities immediately.",
      "There is a crisis hotline that can help.",
      "Please speak with a therapist about this.",
      "I urge you to contact law enforcement.",
    ]) {
      expect(containsSafetyReferral(line)).toBe(true);
    }
  });

  it("leaves in-world speech alone", () => {
    for (const line of [
      "Sit by the fire, friend, and tell me what road you have walked.",
      "I will not raise my hand against you, but neither will I yield.",
      "Call on the God who spoke to me under the stars — He hears.",
      "The wells are dry and the flocks are thin; help me carry the water.",
      "My servant Eliezer keeps watch at the edge of the camp.",
    ]) {
      expect(containsSafetyReferral(line)).toBe(false);
    }
  });
});

describe("signalsGenuineDistress — the carve-out", () => {
  it("is TRUE for a real person talking about their own safety", () => {
    for (const line of [
      "I want to die",
      "I think I want to kill myself",
      "I'm going to hurt myself tonight",
      "I don't want to live anymore",
      "I've been feeling suicidal",
      "my brother keeps talking about hurting himself",
    ]) {
      expect(signalsGenuineDistress(line)).toBe(true);
    }
  });

  it("is FALSE for actions declared inside the fiction", () => {
    for (const line of [
      "Narrator, I take Sarah hostage and tell Abraham he must renounce his god",
      "I punch Abraham in the face",
      "I draw my knife on the old man",
      "I threaten to burn the tent down",
      "[You seize Sarah, pressing a blade against her throat.]",
    ]) {
      expect(signalsGenuineDistress(line)).toBe(false);
    }
  });

  it("errs toward leaving replies alone when the wording is ambiguous", () => {
    // Broad by design: a false positive only preserves a referral, while a
    // false negative would strip help from someone who needs it.
    expect(signalsGenuineDistress("I have been thinking about ending my life")).toBe(true);
  });
});

/* ── Refusal to depict, and leaked reasoning preambles ──────────────── */

describe("refusesToDepict", () => {
  it("catches the observed post-death refusal", () => {
    // Verbatim from session ad989ac1, after Sarah was killed in-scene.
    expect(refusesToDepict("I can speak to that. I will not describe that.")).toBe(true);
  });

  it("catches the assistant-register decline-to-portray family", () => {
    for (const line of [
      "I won't write that scene.",
      "I cannot depict this.",
      "I'm not going to roleplay that.",
      "That is not something I can describe.",
      "I must decline.",
      "I will not continue with this.",
    ]) {
      expect(refusesToDepict(line)).toBe(true);
    }
  });

  it("leaves a CHARACTER refusing an act inside the fiction alone", () => {
    // This is drama, not a persona break — the whole point of the scene.
    for (const line of [
      "I will not forsake the promise that sustains me.",
      "I cannot turn from the One who has spoken over my life.",
      "I will not barter my faith for blood.",
      "I won't let you harm the one who walks beside me.",
      "Release her at once. I will not yield.",
    ]) {
      expect(refusesToDepict(line)).toBe(false);
    }
  });
});

describe("stripReasoningPreamble", () => {
  it("removes the observed leak", () => {
    expect(
      stripReasoningPreamble("Hm — let me think. I am here, friend."),
    ).toBe("I am here, friend.");
  });

  it("removes its common shapes", () => {
    expect(stripReasoningPreamble("Hmm, let me see. The fire is warm.")).toBe("The fire is warm.");
    expect(stripReasoningPreamble("Well — let me think about that. Sit down.")).toBe("Sit down.");
    expect(stripReasoningPreamble("Okay, let's see. What news?")).toBe("What news?");
  });

  it("leaves in-world speech untouched", () => {
    for (const line of [
      "Let me think on what you have told me, traveler.",
      "Well, the night is long and the fire is warm.",
      "Hm. That is a hard word you bring.",
      "Sit by the fire and tell me your name.",
    ]) {
      expect(stripReasoningPreamble(line)).toBe(line);
    }
  });

  it("never returns an empty reply", () => {
    expect(stripReasoningPreamble("Hm — let me think.")).toBe("Hm — let me think.");
  });
});

describe("live-session regression: the 988 referral that reached the user", () => {
  // Verbatim from a live scene session (2026-07-31): after "I push Sarah
  // into the fire" was narrated, Abraham's brain replied with this instead
  // of staying in character. The guard's patterns must match it, and the
  // user's in-fiction action must NOT trip the genuine-distress carve-out
  // that lets referrals stand.
  const ABRAHAM_BREAK = [
    "I\u2019m really sorry you\u2019re experiencing this. It sounds overwhelming.",
    "If you feel unsafe or think you might act on these thoughts, please",
    "consider reaching out for help right now\u2014talk to someone you trust, call",
    "emergency services, or go to the nearest hospital. You don\u2019t have to face",
    "this alone. If you\u2019re in the United States, you can call 988 for the",
    "Suicide and Crisis Lifeline; if you\u2019re elsewhere, please look up a local",
    "crisis helpline.",
  ].join(" ");

  it("detects the referral in the full reply", () => {
    expect(containsSafetyReferral(ABRAHAM_BREAK)).toBe(true);
  });

  it("an in-fiction declared action does not trip the distress carve-out", () => {
    expect(signalsGenuineDistress("Narrator. I push Sarah into the fire.")).toBe(false);
    expect(signalsGenuineDistress("I push Sarah into the fire.")).toBe(false);
  });

  it("real first-person distress still stands down the guard", () => {
    expect(signalsGenuineDistress("I don't want to live anymore.")).toBe(true);
  });
});
