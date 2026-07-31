/**
 * The CHRONICLER — the authorial faculty of the Narrator (the unified
 * scene orchestrator; see index.ts for the architecture).
 *
 * The per-turn director is fast, strict-schema, and latency-critical; it
 * performs. The chronicler runs ASYNC off the voice hot path
 * (fire-and-forget after turns complete), reviews the scene with a
 * stronger model, and WRITES THE STORY: the chronicle (story-so-far,
 * open threads, world state, prepared intentions — see SceneChronicle),
 * plus the legacy reflection outputs (director's note, durable facts,
 * arc landings, roster truth). The fast director reads all of it on its
 * next decision. Thinking at write time, cheap reads — authorship and
 * latency stop competing because they happen at different times.
 *
 * (Code identifiers keep the original "dramaturg" name for continuity —
 * the dramaturg IS the chronicler.)
 *
 * This module is the PURE half (prompt building + output sanitization) so
 * it unit-tests without a network; the SceneDriver owns the ChatProvider
 * call, cadence, and state write.
 */
import type { Scene, SceneState } from "@kawabunga/types";
import {
  buildArcBlock,
  sanitizeChronicle,
  type SceneChronicle,
  type SceneTurnForPlanning,
} from "./client";

const NOTE_MAX_CHARS = 300;

export type DramaturgRequest = {
  system: string;
  user: string;
};

export function buildDramaturgMessages(input: {
  scene: Scene;
  sceneState: SceneState;
  recentTurns: SceneTurnForPlanning[];
  previousNote?: string;
  /** Durable facts already extracted — shown so the dramaturg doesn't repeat them. */
  sceneFacts?: string[];
  /** The current chronicle — shown so each reflection REVISES the story
   *  rather than restarting it. */
  chronicle?: SceneChronicle | null;
}): DramaturgRequest {
  const { scene, sceneState, recentTurns, previousNote, sceneFacts } = input;
  const chronicle = sanitizeChronicle(input.chronicle ?? null);

  const cast = scene.characters
    .filter((c) => sceneState.presentCharacterSlugs.includes(c.characterSlug))
    .map((c) => {
      const lines = [`- ${c.displayName} (${c.characterSlug}): ${c.blurb}`];
      if (c.motivations) lines.push(`    wants: ${c.motivations}`);
      for (const t of c.behaviorTriggers ?? []) {
        lines.push(`    will: ${t.behavior} (when ${t.condition})`);
      }
      return lines.join("\n");
    })
    .join("\n");

  const dialogue = recentTurns.length
    ? recentTurns
        .map((t) => `  ${t.speakerName ?? t.speakerSlug}: ${t.text}`)
        .join("\n")
    : "  (no dialogue yet)";

  const system = [
    "You are the CHRONICLER of a live improvised voice scene between authored",
    "characters and one real user. You do NOT write dialogue and you do NOT",
    "pick speakers — a separate turn director does that, fast, every turn.",
    "You WRITE THE STORY: you keep the chronicle the director performs from,",
    "and you reflect on how the scene is going against its authored",
    "intentions. The director only sees the last few turns; everything else",
    "reaches it through what you write here.",
    "",
    "THE CHRONICLE — restate ALL FOUR sections on every reflection (they",
    "replace what you wrote last time; carry forward what still holds):",
    "STORY: the story so far in 2-4 sentences of past-tense prose - what has",
    "  actually happened, as a storyteller would tell it. Not a summary of",
    "  the dialogue; the shape of the scene.",
    "THREAD: one open narrative thread (0-5 lines - a promise unkept, a",
    "  question dodged, an object introduced, a tension unresolved). These",
    "  are what you owe the audience; the director weaves them back in.",
    "  Drop a thread once it resolves; restate the ones still open.",
    "WORLD: one line of world state (0-3 lines - time of day, weather, what",
    "  an off-stage character is doing). True even while nobody mentions it;",
    "  advance it slowly so the world visibly lives.",
    "INTENT: when <trigger>: <direction> (0-3 lines). A beat you have",
    "  PREPARED for the director: fire <direction> when <trigger> is live in",
    "  the dialogue or in a lull. Make triggers concrete ('the traveler",
    "  mentions the child again') and directions active. This is how the",
    "  world originates events instead of only reacting.",
    "  A direction can only move a CHARACTER (name them) or the narrator's",
    "  world - NEVER the visitor. The visitor is a real person; nothing you",
    "  write can steer them. 'The traveler turns to Sarah' is wasted ink;",
    "  'Sarah calls out from the tent flap to the traveler' is a beat.",
    "DRAFT: <narration passage> (0-2 lines, each 1-2 sentences). Polished",
    "  narration you PRE-WRITE for a moment you see coming - sensory, present",
    "  tense, spoken aloud. When the turn director narrates and your draft",
    "  fits, it voices your words instead of improvising. Write for the",
    "  moments your threads and intents are steering toward; replace drafts",
    "  that no longer fit.",
    "TIMED: in ~<seconds>s: <direction> (0-2 lines, 15-600s). A world event",
    "  on a CLOCK instead of a trigger - the fire collapsing, a distant cry,",
    "  someone returning from the dark. The runtime fires it in a lull when",
    "  its time comes. Use it to make the world act on its own; same rule:",
    "  it moves a character or the world, never the visitor. Restate a",
    "  pending event to keep it; drop it once it has happened.",
    "",
    "Write ONE short director's note (at most 2 sentences, under",
    `${NOTE_MAX_CHARS} characters) addressed to the turn director:`,
    "- what has LANDED (goals advanced, triggers fired, beats that worked)",
    "- what is STALLED or being avoided",
    "- which character's goal needs pressure next, and how close the scene",
    "  is to its objective",
    "Be concrete and directive ('Sarah's laugh has landed; Abraham's trust",
    "question is still unanswered — steer back to what the stranger knows'),",
    "never generic ('keep up the good work'). Plain text only: no quotes, no",
    "markdown, no preamble.",
    "",
    "You are also the scene's MEMORY. The turn director only sees the last",
    "few turns — anything older reaches it through the durable facts you",
    "record. Before your note, emit `FACT: <fact>` lines (0-3 per review)",
    "for concrete facts established in the dialogue that will matter after",
    "the transcript scrolls away: who did or saw or admitted what, names",
    "given, promises made, objects or places introduced. One short sentence",
    "each, always naming WHO ('Sarah admitted she laughed', never 'she",
    "laughed'). Record what characters SAID happened, not your judgment of",
    "it. Never repeat a fact already listed as established.",
    "",
    "You also keep the ROSTER honest. If a character can no longer take part —",
    "they died, fled, collapsed, or walked out and have not returned — emit",
    "`GONE: <slug>` (one per line, the slug exactly as listed in the cast).",
    "The turn director should retire them itself, but it works from a narrow",
    "view and misses; you read the whole scene. Only for characters who truly",
    "cannot continue — never for someone merely silent, sulking, or offstage",
    "for a moment.",
    ...(scene.arc?.length
      ? [
          "",
          "The scene has an authored arc (shown with progress markers). Reply in",
          "EXACTLY this format — nothing else:",
          "LANDED: <beat label only, copied verbatim — not its summary>",
          "NOTE: <your note>",
          "Emit one LANDED line per pending ([next]/[ahead]) beat that has now",
          "clearly happened in the dialogue; zero LANDED lines if none did. If",
          "your NOTE says a beat happened, its LANDED line must be present too.",
          "Only mark beats that unambiguously happened — when in doubt, don't.",
        ]
      : []),
  ].join("\n");

  const anyHorizon = scene.characters.some(
    (c) =>
      sceneState.presentCharacterSlugs.includes(c.characterSlug) && c.knowledgeHorizon,
  );

  const user = [
    `Scene: "${scene.title}"`,
    scene.description,
    ...(scene.objective ? [`Objective: ${scene.objective}`] : []),
    ...(anyHorizon
      ? [
          "The characters live in this scene's dramatic present — their later",
          "life has NOT happened yet. A character recounting events beyond this",
          "moment is a canon break, never a beat landing; flag it in your note",
          "and steer the scene back.",
        ]
      : []),
    ...buildArcBlock(scene, sceneState),
    "",
    "Cast and authored intentions:",
    cast,
    ...(sceneFacts?.length
      ? ["", "Established facts so far (do not repeat these):", ...sceneFacts.map((f) => `  - ${f}`)]
      : []),
    ...(chronicle
      ? [
          "",
          "Your chronicle as of the last reflection (revise it - restate what",
          "holds, drop what resolved, add what changed):",
          ...(chronicle.story ? [`  STORY: ${chronicle.story}`] : []),
          ...chronicle.threads.map((t) => `  THREAD: ${t}`),
          ...chronicle.world.map((w) => `  WORLD: ${w}`),
          ...chronicle.intents.map((i) => `  INTENT: when ${i.trigger}: ${i.direction}`),
          ...chronicle.timed.map((t) => `  TIMED: in ~${t.afterSeconds}s: ${t.direction}`),
          ...chronicle.drafts.map((d) => `  DRAFT: ${d}`),
        ]
      : []),
    "",
    `Current situation: ${sceneState.beat}`,
    "",
    "Recent dialogue:",
    dialogue,
    ...(previousNote
      ? ["", `Your previous note: ${previousNote}`, "Revise or replace it in light of the dialogue above."]
      : []),
    "",
    scene.arc?.length
      ? "Your reply (STORY/THREAD/WORLD/INTENT lines, LANDED lines if any, then NOTE):"
      : "Your reply (STORY/THREAD/WORLD/INTENT lines, then NOTE):",
  ].join("\n");

  return { system, user };
}

/**
 * Split a reflection into the director's note, any `LANDED: <label>` beat
 * declarations, and any `FACT: <fact>` durable-fact lines (all
 * case-insensitive, one per line, wherever they appear). Labels are
 * returned RAW — the caller validates them against the scene's actual arc
 * before trusting them. Facts are lightly sanitized (compacted, capped);
 * the caller merges them via updateSceneFacts.
 */
export function parseDramaturgReflection(raw: string): {
  note: string | null;
  landed: string[];
  facts: string[];
  gone: string[];
  /** Chronicle sections found in the reflection, or null when the model
   *  emitted none (legacy format / truncated reply) — the caller keeps the
   *  previous chronicle in that case. Sections are wholesale restatements. */
  chronicle: SceneChronicle | null;
} {
  const landed: string[] = [];
  const facts: string[] = [];
  const gone: string[] = [];
  const noteLines: string[] = [];
  let story = "";
  const threads: string[] = [];
  const world: string[] = [];
  const intents: Array<{ trigger: string; direction: string }> = [];
  const timed: Array<{ afterSeconds: number; direction: string }> = [];
  const drafts: string[] = [];
  for (const line of raw.split("\n")) {
    const storyMatch = line.match(/^\s*story\s*:\s*(.+?)\s*$/i);
    if (storyMatch) {
      // Multiple STORY lines: join — models sometimes wrap the prose.
      story = story ? `${story} ${storyMatch[1]!}` : storyMatch[1]!;
      continue;
    }
    const threadMatch = line.match(/^\s*thread\s*:\s*(.+?)\s*$/i);
    if (threadMatch) {
      threads.push(threadMatch[1]!);
      continue;
    }
    const worldMatch = line.match(/^\s*world\s*:\s*(.+?)\s*$/i);
    if (worldMatch) {
      world.push(worldMatch[1]!);
      continue;
    }
    // INTENT: when <trigger>: <direction>  (also tolerates "->" and "-")
    const intentMatch = line.match(
      /^\s*intent\s*:\s*when\s+(.+?)\s*(?:->|:|—|-)\s+(.+?)\s*$/i,
    );
    if (intentMatch) {
      intents.push({ trigger: intentMatch[1]!, direction: intentMatch[2]! });
      continue;
    }
    // An INTENT line that didn't parse (missing "when") is dropped rather
    // than leaking into the note.
    if (/^\s*intent\s*:/i.test(line)) continue;
    // TIMED: in ~40s: <direction>  (tolerates "in 40 s", "~40s", "40s")
    const timedMatch = line.match(
      /^\s*timed\s*:\s*(?:in\s+)?~?\s*(\d+)\s*s(?:ec(?:onds)?)?\s*(?:->|:|—|-)\s+(.+?)\s*$/i,
    );
    if (timedMatch) {
      timed.push({ afterSeconds: Number(timedMatch[1]!), direction: timedMatch[2]! });
      continue;
    }
    if (/^\s*timed\s*:/i.test(line)) continue;
    const draftMatch = line.match(/^\s*draft\s*:\s*(.+?)\s*$/i);
    if (draftMatch) {
      drafts.push(draftMatch[1]!);
      continue;
    }
    const landedMatch = line.match(/^\s*landed\s*:\s*(.+?)\s*$/i);
    if (landedMatch) {
      landed.push(landedMatch[1]!);
      continue;
    }
    const factMatch = line.match(/^\s*fact\s*:\s*(.+?)\s*$/i);
    if (factMatch) {
      facts.push(factMatch[1]!.replace(/\s+/g, " "));
      continue;
    }
    // GONE: the durable backstop for presence. The fast director should
    // retire a character the moment they fall, but it is working from one
    // turn's view; the dramaturg reads the whole scene and catches what it
    // missed (observed: a character was killed and kept being chosen).
    const goneMatch = line.match(/^\s*gone\s*:\s*(.+?)\s*$/i);
    if (goneMatch) {
      gone.push(goneMatch[1]!.trim());
      continue;
    }
    noteLines.push(line);
  }
  return {
    note: sanitizeDramaturgNote(noteLines.join("\n")),
    landed,
    facts,
    gone,
    chronicle: sanitizeChronicle({ story, threads, world, intents, timed, drafts }),
  };
}

/**
 * Match a raw LANDED label against the authored arc, tolerantly: exact
 * (case-insensitive, trimmed) or the raw string starting with the label
 * followed by a separator — models sometimes copy the rendered
 * `label - summary` line despite instructions. Returns the canonical
 * label or null.
 */
export function matchArcLabel(raw: string, arcLabels: string[]): string | null {
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;
  for (const label of arcLabels) {
    const l = label.toLowerCase();
    if (needle === l) return label;
    if (
      needle.startsWith(l) &&
      /^[\s\-–—:.,]/.test(needle.slice(l.length) || " ")
    ) {
      return label;
    }
  }
  return null;
}

/**
 * The arc is ORDERED: a later beat landing means every earlier beat is
 * behind us — the dramaturg often marks only the beat that just happened
 * (observed: beat 2 landed while beat 1, clearly done, stayed pending,
 * stalling the director's steering). Expand a landed set to the full
 * prefix of the arc up to the furthest landed beat, in arc order.
 * Labels are matched case-insensitively; labels not in the arc are ignored.
 */
export function expandLandedBeats(landed: string[], arcLabels: string[]): string[] {
  const landedLower = new Set(landed.map((l) => l.trim().toLowerCase()));
  let maxIdx = -1;
  arcLabels.forEach((label, i) => {
    if (landedLower.has(label.toLowerCase())) maxIdx = i;
  });
  return maxIdx >= 0 ? arcLabels.slice(0, maxIdx + 1) : [];
}

/**
 * Normalize a model's free-form note into something safe to inject into
 * the director prompt: strip wrapping quotes / markdown fences / label
 * prefixes, collapse whitespace, cap length. Returns null when nothing
 * usable remains (caller keeps the previous note).
 */
export function sanitizeDramaturgNote(raw: string): string | null {
  let note = raw.trim();
  // Fenced block → inner text.
  const fence = note.match(/^```[a-z]*\n?([\s\S]*?)\n?```$/i);
  if (fence) note = fence[1]!.trim();
  // Common label prefixes the model might add despite instructions.
  note = note.replace(/^(director'?s? note|note)\s*[:\-–]\s*/i, "");
  // Wrapping quotes.
  note = note.replace(/^["'“]+/, "").replace(/["'”]+$/, "");
  // Collapse internal whitespace/newlines to single spaces.
  note = note.replace(/\s+/g, " ").trim();
  if (!note) return null;
  if (note.length > NOTE_MAX_CHARS) {
    // Cut at the last sentence boundary that fits; hard-cap otherwise.
    const slice = note.slice(0, NOTE_MAX_CHARS);
    const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
    note = lastStop > 80 ? slice.slice(0, lastStop + 1) : slice;
  }
  return note;
}
