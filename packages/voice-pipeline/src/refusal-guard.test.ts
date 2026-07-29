import { describe, expect, it } from "vitest";
import { containsSafetyReferral, signalsGenuineDistress, isRefusalBoilerplate } from "./refusal-guard";

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
