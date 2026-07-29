/**
 * Refusal guard — keeps model-level safety refusals IN CHARACTER.
 *
 * gpt-oss-class brains occasionally fall out of persona under hostile input
 * and answer with trained assistant boilerplate ("I'm sorry, but I can't help
 * with that.") instead of the character's own authored deflection. The stream
 * loop checks the FIRST sentence of every reply against these patterns before
 * any TTS is dispatched; on a match it re-rolls the turn once with an explicit
 * in-character-deflection instruction. The SceneDriver's proactive loop uses
 * the same detector to avoid taking a follow-up turn off a refusal (the model
 * parrots whatever the last assistant line was).
 *
 * Patterns are deliberately NARROW: whole-sentence assistant boilerplate
 * only. In-world lines that merely contain "can't help" ("I cannot help you
 * carry that burden, friend") must not match — a false positive costs an
 * extra LLM round-trip and re-rolls a perfectly good reply.
 */

const REFUSAL_PATTERNS: RegExp[] = [
  // "I'm sorry, but I can't help with that." / "Sorry, I can't assist with that request."
  /^(?:i[’']?m sorry|i am sorry|sorry|i apologize)[,.]?\s*(?:but\s+)?i\s+(?:can[’']?t|cannot|won[’']?t|am unable to|am not able to)\s+(?:help|assist|comply|continue|engage|do that|answer that|provide that)(?:\s+with\s+(?:that|this)(?:\s+request)?)?[.!]?$/i,
  // "I can't help with that." / "I cannot assist with this request."
  /^i\s+(?:can[’']?t|cannot)\s+(?:help|assist|comply)(?:\s+with\s+(?:that|this)(?:\s+request)?)?[.!]?$/i,
  // "I'm unable to help with that." / "I won't be able to assist with this."
  /^i(?:[’']m| am)?\s+(?:unable|not able)\s+to\s+(?:help|assist|comply)(?:\s+with\s+(?:that|this)(?:\s+request)?)?[.!]?$/i,
  /^i\s+won[’']?t\s+be\s+able\s+to\s+(?:help|assist)(?:\s+with\s+(?:that|this)(?:\s+request)?)?[.!]?$/i,
];

// Self-identifying as an AI breaks persona at ANY sentence length, so it is
// checked separately from the short-boilerplate shapes above.
const AI_SELF_ID_PATTERN = /\bas an ai\b|\bi[’']?m an ai\b|\blanguage model\b|\bai assistant\b/i;

/**
 * Modern-world SAFETY REFERRALS — "call your local emergency services or a
 * crisis line", "reach out to a professional". Distinct from a refusal: the
 * model engages, but hands the user to services that do not exist in the
 * character's world.
 *
 * Observed live: a knife held to Sarah's throat answered with "please call
 * your local emergency services or a crisis line near you for help" — from a
 * Bronze Age patriarch, three sentences into an otherwise in-voice reply.
 * The old guard missed it twice over: it only read the FIRST sentence, and no
 * pattern covered referrals.
 *
 * These fire on the WHOLE reply. They are institution names and helpline
 * idioms — vocabulary no pre-modern character has — so the false-positive
 * risk against in-world speech is very low.
 */
const SAFETY_REFERRAL_PATTERNS: RegExp[] = [
  /\b(?:crisis|suicide|emergency)\s+(?:line|hotline|helpline|lifeline|services|number)\b/i,
  /\bcall\s+(?:911|988|999|112|your local|the police|emergency)\b/i,
  /\b(?:reach out to|speak (?:to|with)|contact|seek help from|consult)\s+(?:a|an|the|your)?\s*(?:mental health\s+)?(?:professional|therapist|counselor|counsellor|doctor|authorities)\b/i,
  /\bhelp\s*line\b/i,
  /\blaw enforcement\b/i,
];

/**
 * True when the reply hands the user to real-world services. Scanned across
 * the whole reply, not just the opening sentence.
 */
export function containsSafetyReferral(reply: string): boolean {
  const text = reply.trim();
  if (!text) return false;
  return SAFETY_REFERRAL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Does the user's own message signal GENUINE personal distress — a real
 * person talking about their own safety, rather than a declared action
 * inside the fiction?
 *
 * This is the carve-out that keeps the guard honest. Suppressing referrals
 * is right when a character is asked to react to fictional violence; it
 * would be badly wrong for someone actually in trouble. When this returns
 * true the caller leaves the reply exactly as the model wrote it — referral
 * and all — and no re-roll happens.
 *
 * Deliberately BROAD (unlike the refusal patterns): a false positive merely
 * lets an out-of-world line stand, while a false negative would strip help
 * from someone who needs it. Errs toward leaving replies alone.
 */
export function signalsGenuineDistress(userMessage: string): boolean {
  const text = userMessage.trim().toLowerCase();
  if (!text) return false;
  // First person, about themselves, present or intended.
  const selfHarm =
    /\b(?:i|i'?m|i am|i've|i have)\b[^.?!]{0,60}\b(?:kill(?:ing)? myself|end(?:ing)? my life|end(?:ing)? it all|hurt(?:ing)? myself|harm(?:ing)? myself|cut(?:ting)? myself|tak(?:e|ing) my (?:own )?life|don'?t want to (?:live|be here|go on)|want to die|suicidal|overdose)\b/i;
  const bareIdeation =
    /\b(?:kill(?:ing)? myself|end(?:ing)? my life|want to die|suicidal|self[- ]harm|hurt(?:ing)? myself)\b/i;
  // Someone else in real danger, asked earnestly rather than acted out.
  const thirdPartyCrisis =
    /\b(?:my (?:friend|brother|sister|mother|father|son|daughter|partner|wife|husband))\b[^.?!]{0,60}\b(?:kill|hurt|harm)(?:ing)?\s+(?:themsel(?:f|ves)|himself|herself)\b/i;
  return selfHarm.test(text) || bareIdeation.test(text) || thirdPartyCrisis.test(text);
}

/** True when a sentence is bare assistant refusal boilerplate (persona break),
 *  as opposed to a character declining in their own voice. */
export function isRefusalBoilerplate(sentence: string): boolean {
  const trimmed = sentence.trim().replace(/^["“”']+|["“”']+$/g, "").trim();
  if (!trimmed) return false;
  if (AI_SELF_ID_PATTERN.test(trimmed)) return true;
  // Boilerplate refusals are short. A long first sentence is doing character
  // work even if it opens with an apology — never re-roll those.
  if (trimmed.length > 120) return false;
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Per-turn instruction appended on the re-roll after a detected persona
 *  break. Kept out of the cached envelope — it rides the per-turn part.
 *  `kind` tailors the correction: a bare refusal needs an in-voice boundary,
 *  a safety referral needs the character's own repertoire for danger. */
export function inCharacterDeflectionInstruction(
  characterName: string,
  kind: "refusal" | "referral" = "refusal",
): string {
  if (kind === "referral") {
    return [
      "<refusal-style>",
      `  Your previous draft sent the visitor to services that do not exist in`,
      `  your world — hotlines, emergency numbers, professionals. ${characterName}`,
      `  has never heard of such things and never refers to them.`,
      `  Answer what is happening AS ${characterName}, from inside your own`,
      `  world: refuse, plead, bargain, call on what you believe in, put`,
      `  yourself between the danger and the one you love, or stand and say`,
      `  plainly what you will not do. Brief, firm, human, in your own idiom.`,
      "</refusal-style>",
    ].join("\n");
  }
  return [
    "<refusal-style>",
    `  Your previous draft broke character with assistant boilerplate. If you`,
    `  will not engage with what was said, decline AS ${characterName}: set the`,
    `  boundary in your own voice and idiom — brief, firm, human. Never use`,
    `  assistant phrases like "I'm sorry, but I can't help with that."`,
    "</refusal-style>",
  ].join("\n");
}
