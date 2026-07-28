import type { Scene } from "@kawabunga/types";

/**
 * STT keyterms for a scene's roster.
 *
 * Character names are the backbone of speaker routing — the director's
 * by-name rule, the vocative/mention classifier, and addressee continuity
 * all key off them. So a name mangled in transcription doesn't just read
 * oddly, it silently breaks routing (observed live: "Abraham, are you
 * there?" arriving as "Married, are you there?", which sent Abraham off
 * talking about his marriage).
 *
 * Deepgram nova-3 accepts `keyterms` to bias recognition toward known
 * proper nouns. We seed it with the roster: each character's display name,
 * its individual word tokens (so "Melchizedek of Salem" also biases the
 * bare surname), the slug when it differs, and "Narrator" when the scene
 * has one — the user addresses it by name too.
 */

/** Deepgram caps keyterm count; stay well inside it and keep the list tight
 *  so the bias stays sharp rather than diffuse. */
const MAX_KEYTERMS = 50;

export function buildSceneKeyterms(
  scene: Pick<Scene, "characters" | "narrator">,
): string[] {
  const terms: string[] = [];

  for (const character of scene.characters) {
    const name = character.displayName?.trim();
    if (name) {
      terms.push(name);
      // Multi-word names: bias each meaningful token too, since users
      // address characters by one part ("Eliezer", not "Eliezer of Damascus").
      if (name.includes(" ")) {
        for (const token of name.split(/\s+/)) {
          if (token.length > 2) terms.push(token);
        }
      }
    }
    // The slug only helps when it reads as a word a person would say —
    // "abraham" yes, "abraham-v2" no.
    const slug = character.characterSlug?.trim();
    if (slug && /^[a-z]+$/i.test(slug)) terms.push(slug);
  }

  if (scene.narrator !== "off") terms.push("Narrator");

  // Dedupe case-insensitively, first spelling wins (display names come
  // first, so "Abraham" beats "abraham").
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const term of terms) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(term);
  }
  return deduped.slice(0, MAX_KEYTERMS);
}

/** Keyterm prompting is Deepgram-specific (nova-3). Other providers take
 *  their own shapes, so only opt in when we know the model accepts it. */
export function supportsKeyterms(model: string): boolean {
  return /^deepgram\/nova-3/i.test(model.trim());
}
