import { isStageDirection } from "./stage-direction";

export type PerformanceSegmentKind = "dialogue" | "stage" | "meta";

export type PerformanceSegment = {
  kind: PerformanceSegmentKind;
  text: string;
};

export type PerformanceVoiceRouter = {
  drain(
    kind: Exclude<PerformanceSegmentKind, "meta">,
    routes: { character: () => Promise<void>; narration: () => Promise<void> },
  ): Promise<void>;
  narrationDisabled(): boolean;
};

/**
 * Stateful per-turn voice selector. Once narration synthesis fails, the
 * current stage span and every later one use the character route. Keeping
 * this policy outside the stream machinery makes failure behavior fully
 * deterministic and adapter-independent.
 */
export function createPerformanceVoiceRouter(input: {
  narrationAvailable: boolean;
  onNarrationFailure?: (error: unknown) => void;
}): PerformanceVoiceRouter {
  let disabled = false;
  let reported = false;

  return {
    async drain(kind, routes) {
      if (kind === "dialogue" || !input.narrationAvailable || disabled) {
        await routes.character();
        return;
      }
      try {
        await routes.narration();
      } catch (error) {
        disabled = true;
        if (!reported) {
          reported = true;
          input.onNarrationFailure?.(error);
        }
        await routes.character();
      }
    },
    narrationDisabled: () => disabled,
  };
}

// Deliberately narrow. A false negative leaves the character voicing the line,
// while a false positive steals dialogue and gives it to the narrator.
const DESCRIPTIVE_VERB = [
  "rises?", "rose", "stands?", "stood", "sits?", "sat", "turns?", "turned",
  "looks?", "looked", "smiles?", "smiled", "frowns?", "frowned", "laughs?",
  "laughed", "weeps?", "wept", "cries?", "cried", "loosens?", "loosened",
  "releases?", "released", "tightens?", "tightened", "grips?", "gripped",
  "reaches?", "reached", "steps?", "stepped", "walks?", "walked", "moves?",
  "moved", "nods?", "nodded", "shakes?", "shook", "trembles?", "trembled",
  "winces?", "winced", "gasps?", "gasped", "breathes?", "breathed", "lowers?",
  "lowered", "raises?", "raised", "lifts?", "lifted", "drops?", "dropped",
  "kneels?", "knelt", "freezes?", "froze", "recoils?", "recoiled", "leans?",
  "leaned", "straightens?", "straightened", "folds?", "folded", "unfolds?",
  "unfolded", "opens?", "opened", "closes?", "closed", "stares?", "stared",
  "glances?", "glanced", "watches?", "watched", "wipes?", "wiped", "presses?",
  "pressed", "takes?", "took", "lets?", "draws?", "drew", "exhales?",
  "exhaled", "inhales?", "inhaled", "falls?", "fell", "pauses?", "paused",
].join("|");

const ADVERB = "(?:quietly|slowly|sharply|suddenly|softly|gently|briefly|silently|still)";

export function classifySegment(
  sentence: string,
  speakerName: string,
): PerformanceSegmentKind {
  const text = sentence.trim();
  if (isStageDirection(text)) return "meta";
  if (isAsteriskWrapped(text)) return "stage";
  if (stripSurroundingDialogueQuotes(text) !== text) return "dialogue";
  if (!text) return "dialogue";

  const escapedName = escapeRegExp(speakerName.trim());
  const verb = `(?:${DESCRIPTIVE_VERB})`;
  const adverbs = `(?:${ADVERB}\\s+){0,2}`;
  const word = "[A-Za-z][A-Za-z'’-]*";
  const pronounSubject = new RegExp(`^(?:he|she|they)\\s+${adverbs}${verb}\\b`, "i");
  const possessivePronounSubject = new RegExp(
    `^(?:his|her|their)\\s+(?:${word}\\s+){1,4}${adverbs}${verb}\\b`,
    "i",
  );
  const namedSubject = escapedName
    ? new RegExp(`^${escapedName}\\s+${adverbs}${verb}\\b`, "i")
    : null;
  const namedPossessiveSubject = escapedName
    ? new RegExp(
        `^${escapedName}(?:'s|’s)\\s+(?:${word}\\s+){1,4}${adverbs}${verb}\\b`,
        "i",
      )
    : null;

  return pronounSubject.test(text) ||
    possessivePronounSubject.test(text) ||
    namedSubject?.test(text) ||
    namedPossessiveSubject?.test(text)
    ? "stage"
    : "dialogue";
}

/** Models use asterisks for EMPHASIS as well as acting ("my blade bends
 * toward *you*"). A single-word span that is not a known action verb is
 * emphasis — fold it back into the sentence (asterisks stripped, so TTS
 * neither reads the markup nor hands one word to the narrator mid-sentence).
 * Observed live: Sonnet's "*you*" was routed to the narrator voice. */
const SINGLE_ACTION_VERB = new RegExp(`^(?:${DESCRIPTIVE_VERB})$`, "i");

function foldEmphasisSpans(text: string): string {
  return text.replace(/\*([^*\n]+)\*/g, (span, inner: string) => {
    const word = inner.trim();
    if (/\s/.test(word)) return span; // multi-word → keep as acting markup
    return SINGLE_ACTION_VERB.test(word) ? span : word;
  });
}

/** Split one completed LLM sentence/chunk into voiceable performance spans. */
export function splitPerformanceSegments(
  sentence: string,
  speakerName: string,
): PerformanceSegment[] {
  const text = foldEmphasisSpans(sentence.trim());
  if (!text) return [];
  if (isStageDirection(text)) return [{ kind: "meta", text }];

  // Fast path for the overwhelmingly common case. It avoids allocating a
  // scanner result unless markup or a likely third-person subject is present.
  if (!text.includes("*") && !mightContainStageProse(text, speakerName)) {
    return [{ kind: "dialogue", text: stripSurroundingDialogueQuotes(text) }];
  }

  const segments: PerformanceSegment[] = [];
  const markup = /\*([^*\n]+)\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = markup.exec(text))) {
    appendPlainSegments(segments, text.slice(cursor, match.index), speakerName);
    appendSegment(segments, { kind: "stage", text: match[1].trim() });
    cursor = match.index + match[0].length;
  }
  appendPlainSegments(segments, text.slice(cursor), speakerName);
  return segments;
}

function appendPlainSegments(
  output: PerformanceSegment[],
  value: string,
  speakerName: string,
): void {
  const text = value.trim();
  if (!text) return;

  const quoted = splitLeadingStageFromQuotedDialogue(text, speakerName);
  if (quoted) {
    appendSegment(output, quoted.stage);
    appendSegment(output, quoted.dialogue);
    return;
  }

  const kind = classifySegment(text, speakerName);
  appendSegment(output, {
    kind,
    text: kind === "dialogue" ? stripSurroundingDialogueQuotes(text) : text,
  });
}

function splitLeadingStageFromQuotedDialogue(
  text: string,
  speakerName: string,
): { stage: PerformanceSegment; dialogue: PerformanceSegment } | null {
  for (let index = 1; index < text.length; index += 1) {
    const opener = text[index];
    if (opener !== "'" && opener !== '"' && opener !== "“" && opener !== "‘") continue;
    const before = text.slice(0, index).trimEnd();
    if (!/[.!?:;—-]$/.test(before)) continue;
    const closer = opener === "“" ? "”" : opener === "‘" ? "’" : opener;
    let end = text.length - 1;
    while (end > index && /[.!?\s]/.test(text[end])) end -= 1;
    if (text[end] !== closer) continue;
    if (classifySegment(before, speakerName) !== "stage") continue;

    const dialogue = text.slice(index + 1, end).trim() + text.slice(end + 1).trim();
    return {
      stage: { kind: "stage", text: before },
      dialogue: { kind: "dialogue", text: dialogue.trim() },
    };
  }
  return null;
}

function appendSegment(output: PerformanceSegment[], segment: PerformanceSegment): void {
  if (!segment.text) return;
  output.push(segment);
}

function mightContainStageProse(text: string, speakerName: string): boolean {
  const firstWord = text.match(/^[A-Za-z][A-Za-z'’-]*/)?.[0]?.toLowerCase();
  if (firstWord === "he" || firstWord === "she" || firstWord === "they" ||
      firstWord === "his" || firstWord === "her" || firstWord === "their") return true;
  const name = speakerName.trim().toLowerCase();
  return Boolean(name && text.toLowerCase().startsWith(name));
}

function isAsteriskWrapped(text: string): boolean {
  return /^\*[^*\n]+\*$/.test(text);
}

export function stripSurroundingDialogueQuotes(text: string): string {
  const trimmed = text.trim();
  const pairs: Array<[string, string]> = [['"', '"'], ["'", "'"], ["“", "”"], ["‘", "’"]];
  for (const [open, close] of pairs) {
    if (!trimmed.startsWith(open)) continue;
    let end = trimmed.length - 1;
    while (end > 0 && /[.!?\s]/.test(trimmed[end])) end -= 1;
    if (trimmed[end] !== close) continue;
    return (trimmed.slice(1, end) + trimmed.slice(end + 1)).trim();
  }
  return trimmed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
