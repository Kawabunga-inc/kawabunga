import {
  ORCHESTRATOR_JSON_SCHEMA,
  orchestratorDecisionSchema,
  sceneStateSchema,
  type OrchestratorDecision,
  type OrchestratorDelivery,
  type Scene,
  type SceneCharacter,
  type SceneState,
} from "@kawabunga/types";

export type SceneTurnForPlanning = {
  speakerSlug: string;
  speakerName?: string;
  text: string;
};

export type SceneDecisionMessage = {
  role: "system" | "user";
  content: string;
};

export type SceneDecisionRequest = {
  messages: SceneDecisionMessage[];
  responseSchema: typeof ORCHESTRATOR_JSON_SCHEMA;
  trace: {
    sceneId: string;
    turnIndex: number;
    presentCharacterSlugs: string[];
    recentTurnCount: number;
    sceneMemoryCount: number;
    sceneFactCount?: number;
    lastUserMessage?: string;
  };
};

export type SceneDecisionResolution = {
  decision: OrchestratorDecision;
  sceneState: SceneState;
  speakerSlug: string | null;
  events: SceneEventDraft[];
  degraded: boolean;
  reason?: string;
};

export type SceneEventDraftType =
  | "scene.decision.speak"
  | "scene.decision.narrate"
  | "scene.decision.wait"
  | "scene.decision.end";

export type SceneEventDraft = {
  type: SceneEventDraftType;
  source: "orchestration";
  payload: {
    sceneId: string;
    action: OrchestratorDecision["action"];
    speakerSlug: string | null;
    previousSceneState: SceneState;
    nextSceneState: SceneState;
    decision: OrchestratorDecision;
    degraded?: boolean;
    reason?: string;
  };
};

export type SpeakerTurnRequest = {
  characterSlug: string;
  speakerName: string;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  promptChunk: string;
  voiceSlug: string;
};

export type SceneSessionSnapshot = {
  version: 1;
  sceneId: string;
  sceneState: SceneState;
  sceneMemory: string[];
  /** Durable facts the chronicler has extracted — survive after the verbatim
   *  memory window scrolls past them. Optional: pre-facts snapshots lack it. */
  sceneFacts?: string[];
  /** The chronicle — the Narrator's living story document (see SceneChronicle).
   *  Optional: pre-chronicle snapshots lack it. */
  chronicle?: SceneChronicle;
  updatedAt: string;
};

/**
 * The CHRONICLE — the Narrator's living story document, maintained by the
 * chronicler faculty (the slow reflection loop) and read by the director
 * every decision. This is the difference between a turn dispatcher and an
 * author: the story-so-far exists as an artifact, not just a transcript
 * window. Sections are restated wholesale each reflection (self-healing);
 * facts stay in their own additive store.
 */
export type SceneChronicle = {
  /** The story so far, in prose — 2-4 sentences, restated fresh each
   *  reflection. The director reads this as its script-in-progress. */
  story: string;
  /** Open narrative threads: promises made, tensions unresolved, the knife
   *  still on the table. The director weaves them back in when invited. */
  threads: string[];
  /** The world right now: time of day, weather, who is off-stage doing what. */
  world: string[];
  /** Prepared intentions — soft-planned beats with trigger conditions. The
   *  director fires the direction when its trigger goes live (including on
   *  a silence tick: this is how world-originated events happen). */
  intents: Array<{ trigger: string; direction: string }>;
  /** TIMED world events — beats on a clock, not a trigger: "in ~40s the
   *  fire collapses". The driver schedules them from the moment the
   *  reflection lands; when one comes due in a lull, the director is told
   *  its time has COME and renders it. This is the world acting on its own
   *  clock. */
  timed: Array<{ afterSeconds: number; direction: string }>;
  /** ANTICIPATORY DRAFTS — polished narration passages the chronicler
   *  pre-writes for moments it sees coming. The fast director, when it
   *  chooses `narrate`, voices one (verbatim or lightly adapted) instead of
   *  composing fresh — chronicler-quality prose at hot-path latency.
   *  Written ahead of time, performed just in time. */
  drafts: string[];
};

/** How many recent turns the director's dialogue window holds. The single
 *  source of truth — the driver, the browser player, the orchestrate route,
 *  and sonar all size their windows from this. */
export const RECENT_TURNS_LIMIT = 6;
const SCENE_MEMORY_LIMIT = 12;
const SCENE_MEMORY_ENTRY_MAX_CHARS = 280;
const SCENE_FACTS_LIMIT = 12;
const SCENE_FACT_MAX_CHARS = 200;
// Chronicle caps — generous enough to carry a scene, tight enough that the
// director's prompt stays token-bounded even with every section full.
const CHRONICLE_STORY_MAX_CHARS = 600;
const CHRONICLE_THREADS_LIMIT = 5;
const CHRONICLE_THREAD_MAX_CHARS = 160;
const CHRONICLE_WORLD_LIMIT = 3;
const CHRONICLE_WORLD_MAX_CHARS = 120;
const CHRONICLE_INTENTS_LIMIT = 3;
const CHRONICLE_TRIGGER_MAX_CHARS = 100;
const CHRONICLE_DIRECTION_MAX_CHARS = 160;
const CHRONICLE_TIMED_LIMIT = 2;
const CHRONICLE_DRAFTS_LIMIT = 2;
const CHRONICLE_DRAFT_MAX_CHARS = 240;
/** Clamp timed events into a livable window: sooner than 15s collides with
 *  ordinary conversation cadence; later than 10min outlives most scenes. */
const CHRONICLE_TIMED_MIN_SECONDS = 15;
const CHRONICLE_TIMED_MAX_SECONDS = 600;

/** The scene's narrator presence (see sceneSchema.narrator). Default is
 *  "minimal": opening + answering the user + rendering declared actions. */
export function narratorMode(scene: Scene): "off" | "minimal" | "scenic" {
  return scene.narrator ?? "minimal";
}

/** Who originates beats between visitor turns. Legacy scenes are user-paced. */
export function initiativeMode(scene: Scene): "user" | "shared" | "narrator" {
  return scene.initiative ?? "user";
}

/** Whether the visitor is themselves or plays an authored role. */
export function userRoleFor(scene: Scene): "visitor" | "character" {
  return scene.userRole ?? "visitor";
}

/** Whether narrator-addressed declarations may author world events. */
export function userDirectorEnabled(scene: Scene): boolean {
  return scene.userDirector !== false;
}

/**
 * How this scene opens. Explicit `openingMode` wins; otherwise a scene with
 * authored lines opens `authored`, and one without opens `off` — so scenes
 * predating the setting behave exactly as before.
 */
export function openingMode(scene: Scene): "authored" | "generated" | "off" {
  if (narratorMode(scene) === "off") return "off";
  if (scene.openingMode) return scene.openingMode;
  return authoredOpenings(scene).length > 0 ? "authored" : "off";
}

/** Every authored opening, primary first. */
export function authoredOpenings(scene: Scene): string[] {
  return [scene.openingNarration, ...(scene.openingNarrationVariants ?? [])]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line));
}

/**
 * Pick the authored opening for one session. Variants exist so a scene
 * doesn't replay identical words on every visit while staying fully
 * authored — the caller supplies the randomness (a driver passes
 * Math.random()) so this stays pure and testable.
 */
export function selectAuthoredOpening(
  scene: Scene,
  roll = 0,
): string | null {
  const options = authoredOpenings(scene);
  if (options.length === 0) return null;
  const index = Math.min(options.length - 1, Math.floor(roll * options.length));
  return options[Math.max(0, index)] ?? null;
}

/**
 * Prompt for a GENERATED opening: the narrator writes the scene's first
 * lines from its premise. Deliberately fenced — the opening must not spend
 * arc beats the scene is meant to earn (observed authoring failure: an
 * opening that announced the promise the arc wanted revealed), nor put
 * words in a character's mouth.
 */
export function buildOpeningNarrationMessages(scene: Scene): {
  system: string;
  user: string;
} {
  const cast = scene.characters
    .map((c) => `- ${c.displayName}: ${c.blurb}`)
    .join("\n");
  const system = [
    "You are the NARRATOR of a voice scene: an unseen presence that renders",
    "the world, never a character in it. Write the opening the listener hears",
    "the moment they arrive, before anyone speaks.",
    "",
    "Rules:",
    "- 2-4 sentences. Present tense. Concrete and sensory - light, sound,",
    "  smell, small movement. Spoken aloud, so no lists and no headings.",
    "- Address the listener as \"you\" only for their arrival; never invent",
    "  what they do, say, feel, or want.",
    "- NO dialogue. Never put words in a character's mouth.",
    "- Place the cast in the world (a figure rising, a shadow at the tent",
    "  flap) without introducing them by biography.",
    ...(scene.arc?.length
      ? [
          "- The scene's arc beats below have NOT happened yet. Do not state,",
          "  reveal, or foreshadow them - the scene must earn them. Set the",
          "  conditions, nothing more.",
        ]
      : []),
    "Plain prose only: no quotes around the whole thing, no preamble, no",
    "stage-direction brackets. Output only the narration.",
  ].join("\n");

  const user = [
    `Scene: "${scene.title}"`,
    scene.description,
    "",
    "Present:",
    cast,
    ...(scene.openingBeat ? ["", `The situation as it opens: ${scene.openingBeat}`] : []),
    ...(scene.arc?.length
      ? ["", "Arc beats still to be earned (do NOT reveal):", ...scene.arc.map((b) => `- ${b.label}`)]
      : []),
    "",
    "Write the opening narration:",
  ].join("\n");

  return { system, user };
}

/** Normalize a generated opening: strip fences/quotes/labels, collapse
 *  whitespace, cap length. Null when nothing usable remains. */
export function sanitizeOpeningNarration(raw: string): string | null {
  let text = raw.trim();
  const fence = text.match(/^```[a-z]*\n?([\s\S]*?)\n?```$/i);
  if (fence) text = fence[1]!.trim();
  text = text.replace(/^(opening narration|narration|narrator)\s*[:\-–]\s*/i, "");
  text = text.replace(/^["'“]+/, "").replace(/["'”]+$/, "");
  // A model that wraps the whole thing in stage brackets — the runtime adds
  // its own convention downstream, so strip them here.
  text = text.replace(/^\[([\s\S]*)\]$/, "$1");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > 600 ? `${text.slice(0, 597).trimEnd()}...` : text;
}

/** Pseudo-entity for addressee detection — lets isVocativeUse recognize the
 *  user turning to the narrator ("Narrator, what do I see?"). */
const NARRATOR_PSEUDO = {
  characterSlug: "narrator",
  displayName: "Narrator",
} as SceneCharacter;

/** True when the user's message addresses the narrator directly. The driver
 *  uses this to SKIP the narrate→react chain: an answer to the user is
 *  complete in itself — chaining is for rendered events. */
export function isNarratorAddressed(message: string): boolean {
  return isVocativeUse(message, NARRATOR_PSEUDO);
}

/**
 * Does the user's message DECLARE AN ACTION they take in the world ("I punch
 * Abraham", "I take Sarah hostage", "I hand her the waterskin")?
 *
 * The distinction matters for chaining: a question to the narrator is
 * complete once answered, but an action is an EVENT — somebody has to react,
 * or the scene freezes. Observed live: "Narrator, I take Sarah hostage" was
 * treated as a narrator question, so nothing chained and Sarah's reaction
 * arrived 4.6s later from the idle timer.
 *
 * First-person present-tense verb, optionally after a narrator vocative.
 * Deliberately narrow: a false positive only costs one extra decision, but
 * missing an action costs the scene its momentum.
 */
export function declaresUserAction(message: string): boolean {
  const text = message
    .trim()
    .replace(/^\s*(?:hey\s+|ok(?:ay)?\s+)?narrator\s*[,:.\-–—]?\s*/i, "")
    .trim();
  // "I <verb>" / "I'm <verb>ing" / "I am <verb>ing" — but not "I think",
  // "I wonder", "I want to know", which are speech, not action.
  const speechVerbs =
    /^i(?:'m| am)?\s+(?:think|wonder|believe|guess|suppose|feel|hope|know|see|hear|understand|want to know|would like to know|ask|say|said|mean|meant)\b/i;
  if (speechVerbs.test(text)) return false;
  return /^i(?:'m|'ll| am| will| would)?\s+[a-z]+(?:e|s)?\b/i.test(text);
}

/**
 * A narrator-addressed message that is a STATEMENT, not a question — the
 * user declaring something happening in the world ("Narrator, Abraham sees
 * a vision and kneels"). Form, not verbs: the director's narrationKind
 * classifier was observed tagging exactly this as "answer" because the
 * declaration contained a perception verb ("sees"), which both skipped the
 * reaction chain and slipped past the userDirector-off gate. The runtime
 * treats a declaration as an event regardless of the model's tag.
 */
export function isNarratorEventDeclaration(message: string): boolean {
  if (!isNarratorAddressed(message)) return false;
  const text = message
    .trim()
    .replace(/^\s*(?:hey\s+|ok(?:ay)?\s+)?narrator\s*[,:.\-–—]?\s*/i, "")
    .trim();
  if (!text) return false;
  if (/\?\s*$/.test(text)) return false;
  // Interrogative openers without a question mark ("Narrator, what do I see").
  const interrogative =
    /^(what|where|when|who|whom|whose|why|how|is|are|am|was|were|do|does|did|can|could|will|would|should|tell me|describe)\b/i;
  return !interrogative.test(text);
}

export function createInitialSceneState(scene: Scene): SceneState {
  return {
    sceneId: scene.id,
    beat: scene.openingBeat,
    presentCharacterSlugs: scene.characters.map((c) => c.characterSlug),
    ambience: scene.defaultAmbience,
    lastSpeakerSlug: null,
    turnIndex: 0,
  };
}

export function defaultSceneDecision(
  scene: Scene,
  state: SceneState,
): OrchestratorDecision {
  return {
    action: "wait-for-user",
    ambience: state.ambience ?? scene.defaultAmbience,
  };
}

export function buildSceneSessionSnapshot(
  sceneState: SceneState,
  options:
    | string
    | {
        updatedAt?: string;
        sceneMemory?: string[];
        sceneFacts?: string[];
        chronicle?: SceneChronicle | null;
      } = {},
): SceneSessionSnapshot {
  const updatedAt = typeof options === "string"
    ? options
    : options.updatedAt ?? new Date().toISOString();
  const sceneMemory = typeof options === "string"
    ? []
    : sanitizeSceneMemory(options.sceneMemory ?? []);
  const sceneFacts = typeof options === "string"
    ? []
    : sanitizeSceneFacts(options.sceneFacts ?? []);
  const chronicle = typeof options === "string"
    ? null
    : sanitizeChronicle(options.chronicle ?? null);
  return {
    version: 1,
    sceneId: sceneState.sceneId,
    sceneState,
    sceneMemory,
    ...(sceneFacts.length ? { sceneFacts } : {}),
    ...(chronicle ? { chronicle } : {}),
    updatedAt,
  };
}

/** Normalize an untrusted chronicle value: cap every section, drop malformed
 *  entries. Null when nothing usable remains — an empty chronicle is not a
 *  chronicle. */
export function sanitizeChronicle(value: unknown): SceneChronicle | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Record<keyof SceneChronicle, unknown>>;
  const story = typeof raw.story === "string"
    ? truncateAt(compactWhitespace(raw.story), CHRONICLE_STORY_MAX_CHARS)
    : "";
  const threads = sanitizeStringList(raw.threads, CHRONICLE_THREADS_LIMIT, CHRONICLE_THREAD_MAX_CHARS);
  const world = sanitizeStringList(raw.world, CHRONICLE_WORLD_LIMIT, CHRONICLE_WORLD_MAX_CHARS);
  const intents = (Array.isArray(raw.intents) ? raw.intents : [])
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as { trigger?: unknown; direction?: unknown };
      const trigger = typeof e.trigger === "string"
        ? truncateAt(compactWhitespace(e.trigger), CHRONICLE_TRIGGER_MAX_CHARS)
        : "";
      const direction = typeof e.direction === "string"
        ? truncateAt(compactWhitespace(e.direction), CHRONICLE_DIRECTION_MAX_CHARS)
        : "";
      return trigger && direction ? { trigger, direction } : null;
    })
    .filter((e): e is { trigger: string; direction: string } => e !== null)
    .slice(0, CHRONICLE_INTENTS_LIMIT);
  const timed = (Array.isArray(raw.timed) ? raw.timed : [])
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as { afterSeconds?: unknown; direction?: unknown };
      const direction = typeof e.direction === "string"
        ? truncateAt(compactWhitespace(e.direction), CHRONICLE_DIRECTION_MAX_CHARS)
        : "";
      const seconds = typeof e.afterSeconds === "number" && Number.isFinite(e.afterSeconds)
        ? Math.round(e.afterSeconds)
        : NaN;
      if (!direction || Number.isNaN(seconds)) return null;
      return {
        afterSeconds: Math.min(
          CHRONICLE_TIMED_MAX_SECONDS,
          Math.max(CHRONICLE_TIMED_MIN_SECONDS, seconds),
        ),
        direction,
      };
    })
    .filter((e): e is { afterSeconds: number; direction: string } => e !== null)
    .slice(0, CHRONICLE_TIMED_LIMIT);
  const drafts = sanitizeStringList(raw.drafts, CHRONICLE_DRAFTS_LIMIT, CHRONICLE_DRAFT_MAX_CHARS);
  if (
    !story &&
    threads.length === 0 &&
    world.length === 0 &&
    intents.length === 0 &&
    timed.length === 0 &&
    drafts.length === 0
  ) {
    return null;
  }
  return { story, threads, world, intents, timed, drafts };
}

function sanitizeStringList(value: unknown, limit: number, maxChars: number): string[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => (typeof entry === "string" ? truncateAt(compactWhitespace(entry), maxChars) : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function truncateAt(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 3).trimEnd()}...`;
}

/**
 * Fold a freshly parsed chronicle into the previous one. Sections are
 * wholesale restatements, so a non-empty new section replaces the old —
 * but an EMPTY section keeps the previous value: the chronicler is
 * instructed to restate everything each reflection, so an absent section
 * means truncation or drift, not intentional clearing. (A thread the model
 * stops restating IS dropped, since threads arrive as a non-empty list.)
 */
export function mergeChronicle(
  previous: SceneChronicle | null,
  next: SceneChronicle | null,
): SceneChronicle | null {
  if (!next) return previous;
  if (!previous) return next;
  return {
    story: next.story || previous.story,
    threads: next.threads.length ? next.threads : previous.threads,
    world: next.world.length ? next.world : previous.world,
    intents: next.intents.length ? next.intents : previous.intents,
    timed: next.timed.length ? next.timed : previous.timed,
    drafts: next.drafts.length ? next.drafts : previous.drafts,
  };
}

export function readSceneChronicleFromSnapshot(
  value: unknown,
  sceneId: string,
): SceneChronicle | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { sceneId?: unknown; chronicle?: unknown };
  if (candidate.sceneId !== sceneId) return null;
  return sanitizeChronicle(candidate.chronicle);
}

export function readSceneStateFromSnapshot(
  value: unknown,
  sceneId: string,
): SceneState | null {
  const direct = sceneStateSchema.safeParse(value);
  if (direct.success && direct.data.sceneId === sceneId) return direct.data;

  if (!value || typeof value !== "object") return null;
  const candidate = value as { sceneId?: unknown; sceneState?: unknown };
  if (candidate.sceneId !== sceneId) return null;

  const parsed = sceneStateSchema.safeParse(candidate.sceneState);
  if (!parsed.success) return null;
  return parsed.data.sceneId === sceneId ? parsed.data : null;
}

export function readSceneMemoryFromSnapshot(
  value: unknown,
  sceneId: string,
): string[] {
  if (!value || typeof value !== "object") return [];
  const candidate = value as { sceneId?: unknown; sceneMemory?: unknown };
  if (candidate.sceneId !== sceneId || !Array.isArray(candidate.sceneMemory)) {
    return [];
  }
  return sanitizeSceneMemory(candidate.sceneMemory);
}

export function readSceneFactsFromSnapshot(
  value: unknown,
  sceneId: string,
): string[] {
  if (!value || typeof value !== "object") return [];
  const candidate = value as { sceneId?: unknown; sceneFacts?: unknown };
  if (candidate.sceneId !== sceneId || !Array.isArray(candidate.sceneFacts)) {
    return [];
  }
  return sanitizeSceneFacts(candidate.sceneFacts);
}

/** Merge newly extracted facts into the durable store: sanitized, deduped
 *  case-insensitively (first statement wins), oldest first, capped — the cap
 *  drops the OLDEST facts, matching how scenes accrete detail. */
export function updateSceneFacts(input: {
  previousFacts?: string[];
  newFacts?: string[];
  maxEntries?: number;
}): string[] {
  const maxEntries = input.maxEntries ?? SCENE_FACTS_LIMIT;
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const fact of [...(input.previousFacts ?? []), ...(input.newFacts ?? [])]) {
    const clean = truncateFactEntry(typeof fact === "string" ? fact : "");
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(clean);
  }
  return merged.slice(-maxEntries);
}

export function updateSceneMemory(input: {
  previousMemory?: string[];
  recentTurns?: SceneTurnForPlanning[];
  maxEntries?: number;
}): string[] {
  const maxEntries = input.maxEntries ?? SCENE_MEMORY_LIMIT;
  const entries = sanitizeSceneMemory(input.previousMemory ?? []);
  for (const turn of input.recentTurns ?? []) {
    const text = compactWhitespace(turn.text);
    if (!text) continue;
    const speaker = compactWhitespace(turn.speakerName ?? turn.speakerSlug);
    entries.push(truncateMemoryEntry(`${speaker}: ${text}`));
  }

  const deduped: string[] = [];
  for (const entry of entries) {
    const existingIndex = deduped.indexOf(entry);
    if (existingIndex !== -1) deduped.splice(existingIndex, 1);
    deduped.push(entry);
  }
  return deduped.slice(-maxEntries);
}

export function buildSceneDecisionRequest(input: {
  scene: Scene;
  sceneState: SceneState;
  recentTurns?: SceneTurnForPlanning[];
  sceneMemory?: string[];
  sceneFacts?: string[];
  /** The Narrator's living story document — rendered into the director's
   *  prompt so decisions come from the story being written, not just the
   *  transcript window. */
  chronicle?: SceneChronicle | null;
  /** A timed world event whose clock has run out — rendered as an explicit
   *  imperative in the director's user prompt (see buildOrchestratorUserPrompt). */
  worldEventDirective?: string;
  lastUserMessage?: string;
}): SceneDecisionRequest {
  const recentTurns = (input.recentTurns ?? []).slice(-RECENT_TURNS_LIMIT);
  // The verbatim memory window overlaps the recent-dialogue block (both hold
  // the newest turns) — render only the OLDER memory entries, so the prompt
  // never carries the same line twice.
  const recentRendered = new Set(
    recentTurns.map((t) =>
      truncateMemoryEntry(
        `${compactWhitespace(t.speakerName ?? t.speakerSlug)}: ${compactWhitespace(t.text)}`,
      ),
    ),
  );
  const sceneMemory = sanitizeSceneMemory(input.sceneMemory ?? []).filter(
    (entry) => !recentRendered.has(entry),
  );
  const sceneFacts = sanitizeSceneFacts(input.sceneFacts ?? []);
  return {
    messages: [
      {
        role: "system",
        content: buildOrchestratorSystemPrompt(
          input.scene,
          input.sceneState,
          sceneMemory,
          sceneFacts,
          sanitizeChronicle(input.chronicle ?? null),
        ),
      },
      {
        role: "user",
        content: buildOrchestratorUserPrompt(
          recentTurns,
          input.lastUserMessage,
          input.scene.characters.filter((c) =>
            input.sceneState.presentCharacterSlugs.includes(c.characterSlug),
          ),
          narratorMode(input.scene) !== "off",
          input.worldEventDirective,
        ),
      },
    ],
    responseSchema: ORCHESTRATOR_JSON_SCHEMA,
    trace: {
      sceneId: input.scene.id,
      turnIndex: input.sceneState.turnIndex,
      presentCharacterSlugs: input.sceneState.presentCharacterSlugs,
      recentTurnCount: recentTurns.length,
      sceneMemoryCount: sceneMemory.length,
      ...(sceneFacts.length ? { sceneFactCount: sceneFacts.length } : {}),
      ...(input.lastUserMessage ? { lastUserMessage: input.lastUserMessage } : {}),
    },
  };
}

export function resolveSceneDecision(
  input: {
    scene: Scene;
    sceneState: SceneState;
  },
  rawDecision: unknown,
): SceneDecisionResolution {
  const parsed = orchestratorDecisionSchema.safeParse(stripNullOptionalDecisionFields(rawDecision));
  if (!parsed.success) {
    return fallbackResolution(input, "invalid-decision-shape");
  }

  const decision = parsed.data;
  if (decision.action === "speak") {
    const speakerSlug = decision.speakerId?.trim() ?? "";
    // Validate the speaker against the roster AFTER this decision's own
    // presence changes — EXCEPT the character this very decision retires:
    // a dismissed character speaks their leave-taking on the way out (the
    // exit still applies, and every LATER decision excludes them). Anyone
    // else must be present post-changes.
    const presentAfter = applyPresence(input.scene, input.sceneState, decision).present;
    const isLeaveTaking =
      speakerSlug !== "" &&
      decision.exitSlug?.trim() === speakerSlug &&
      input.sceneState.presentCharacterSlugs.includes(speakerSlug);
    const present = input.scene.characters.some(
      (c) =>
        c.characterSlug === speakerSlug &&
        (presentAfter.includes(c.characterSlug) || isLeaveTaking),
    );
    if (!speakerSlug || !present) {
      return fallbackResolution(
        input,
        speakerSlug ? `unknown-speaker:${speakerSlug}` : "missing-speaker",
      );
    }
    return applyDecision(input, decision, speakerSlug);
  }

  if (decision.action === "narrate" && !decision.narration?.trim()) {
    return fallbackResolution(input, "empty-narration");
  }

  return applyDecision(input, decision, null);
}

export function fallbackSceneDecisionResolution(
  input: {
    scene: Scene;
    sceneState: SceneState;
  },
  reason: string,
): SceneDecisionResolution {
  return fallbackResolution(input, reason);
}

function stripNullOptionalDecisionFields(rawDecision: unknown): unknown {
  if (!rawDecision || typeof rawDecision !== "object" || Array.isArray(rawDecision)) {
    return rawDecision;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawDecision)) {
    if (value !== null) out[key] = value;
  }
  return out;
}

export function buildSpeakerTurnRequest(input: {
  scene: Scene;
  sceneState: SceneState;
  decision: OrchestratorDecision;
  recentTurns: SceneTurnForPlanning[];
}): SpeakerTurnRequest | null {
  if (input.decision.action !== "speak") return null;
  const speakerSlug = input.decision.speakerId?.trim();
  if (!speakerSlug) return null;

  const character = input.scene.characters.find(
    (c) =>
      c.characterSlug === speakerSlug &&
      input.sceneState.presentCharacterSlugs.includes(c.characterSlug),
  );
  if (!character) return null;

  const previousTurn = [...input.recentTurns]
    .reverse()
    .find((t) => t.speakerSlug !== speakerSlug);
  const beat = input.decision.beat ?? input.sceneState.beat;
  // ATTRIBUTION: the speaker's history collapses everyone else into role
  // "user", so without labels the speaker can't tell another character's line
  // from the real user's. Prefix every non-user, non-self line with its
  // speaker's name ("Sarah: …"); the user's own lines stay bare. Narrator
  // turns render as bracketed STAGE DIRECTIONS ("[The fire gutters.]") so
  // the character perceives them as events in the world, not as speech.
  // Both conventions are declared in the directive chunk below.
  const attribute = (turn: SceneTurnForPlanning): string =>
    turn.speakerSlug === "narrator"
      ? `[${turn.text}]`
      : turn.speakerSlug === "user" || turn.speakerSlug === speakerSlug
        ? turn.text
        : `${turn.speakerName ?? turn.speakerSlug}: ${turn.text}`;
  const message = previousTurn ? attribute(previousTurn) : beat;
  // History is the context BEFORE the turn we're responding to. Exclude the
  // `previousTurn` we just lifted into `message`, or it's fed twice (here AND as the
  // appended user message downstream — run-voice-stream `[...history, {message}]`).
  const history = input.recentTurns
    .filter((turn) => turn !== previousTurn)
    .slice(-RECENT_TURNS_LIMIT)
    .map((turn) => ({
      role: turn.speakerSlug === speakerSlug ? ("assistant" as const) : ("user" as const),
      content: attribute(turn),
    }));
  // The orchestrator's per-turn DRIVE direction (`beat`), framed so the character
  // acts on it in their own voice; `sceneCue` is an optional scene-level note;
  // the speaker's authored agenda rides along so the character knows what THEY
  // want here. All route through the per-turn <context> block, never the cached
  // voice envelope, so voice is preserved by construction.
  const promptChunk = buildDirectiveChunk({
    beat,
    sceneCue: input.decision.sceneCue,
    delivery: input.decision.delivery,
    characterState: input.sceneState.characterStates?.[speakerSlug],
    speaker: character,
    othersPresent: input.scene.characters
      .filter(
        (c) =>
          c.characterSlug !== speakerSlug &&
          input.sceneState.presentCharacterSlugs.includes(c.characterSlug),
      )
      .map((c) => c.displayName),
    narratorPresent: narratorMode(input.scene) !== "off",
    visitorRole:
      userRoleFor(input.scene) === "character"
        ? input.scene.userCharacter?.name.trim() || undefined
        : undefined,
  });

  return {
    characterSlug: speakerSlug,
    speakerName: character.displayName,
    message,
    history,
    promptChunk,
    voiceSlug: character.voice,
  };
}

/**
 * Validate the decision's audio cues against the scene's roster
 * (Scene.sounds). Only engages when a roster exists — legacy scenes
 * (static registry, character sandboxes) keep free-string behavior.
 * Invalid cues are dropped, never fatal: an hallucinated sound id
 * shouldn't cost the turn.
 */
function sanitizeAudioCues(
  scene: Scene,
  decision: OrchestratorDecision,
): { decision: OrchestratorDecision; notes: string[] } {
  if (!scene.sounds) return { decision, notes: [] };
  const notes: string[] = [];
  const sanitized = { ...decision };

  const bedSlugs = new Set(
    scene.sounds.filter((s) => s.role === "bed").map((s) => s.slug),
  );
  // An ambience id must be a roster bed; dropping the field keeps the
  // current bed playing. (Nulls never reach here — the strict schema makes
  // the model emit null for every unused field, so nulls are stripped
  // upstream and mean "no change".)
  if (typeof sanitized.ambience === "string" && !bedSlugs.has(sanitized.ambience)) {
    notes.push(`ambience-not-in-roster:${sanitized.ambience}`);
    delete sanitized.ambience;
  }

  if (sanitized.sfx?.length) {
    const oneshotSlugs = new Set(
      scene.sounds.filter((s) => s.role === "oneshot").map((s) => s.slug),
    );
    const kept = sanitized.sfx.filter((cue) => oneshotSlugs.has(cue.id));
    const dropped = sanitized.sfx.filter((cue) => !oneshotSlugs.has(cue.id));
    if (dropped.length > 0) {
      notes.push(`sfx-not-in-roster:${dropped.map((c) => c.id).join(",")}`);
      sanitized.sfx = kept;
    }
  }

  return { decision: sanitized, notes };
}

/**
 * The per-turn directive injected into the speaker's <context> block:
 * the director's `beat`, the optional scene note, and the speaker's own
 * authored agenda (scene-node intention). Shared by the reactive path
 * (buildSpeakerTurnRequest) and the proactive path (SceneDriver) so the
 * two never drift.
 */
export function buildDirectiveChunk(input: {
  beat: string;
  sceneCue?: string;
  delivery?: OrchestratorDelivery;
  /** The chronicler's current emotional truth for this speaker. */
  characterState?: string;
  speaker?: Pick<SceneCharacter, "motivations" | "behaviorTriggers" | "speakingStyle">;
  /** Display names of the OTHER present characters — when set, declares the
   *  multi-party transcript convention (name-prefixed lines) so the speaker
   *  can tell the others' lines from the real user's. */
  othersPresent?: string[];
  /** When true, declares the stage-direction convention: bracketed lines are
   *  events in the world (narration), reacted to but never answered. */
  narratorPresent?: boolean;
  /** Authored name of the role the visitor plays, when this is roleplay. */
  visitorRole?: string;
}): string {
  const lines = [
    `Direction: ${input.beat}`,
    // Characters habitually append a question to every reply (observed:
    // Abraham closing "Friend, what…?" even under "pause, let it settle").
    // The direction sets the SHAPE of the turn, including how it ends.
    "Match your reply's shape to the direction - if it says to pause, land,",
    "concede, or act, end there; do not tack a question onto the end.",
  ];
  if (input.delivery === "brief") {
    lines.push(
      "Delivery: brief. Land one sharp line or compact reaction, then yield the floor.",
    );
  } else if (input.delivery === "natural") {
    lines.push(
      "Delivery: natural. Take the space an ordinary spoken exchange needs; complete",
      "the move without turning it into a speech.",
    );
  } else if (input.delivery === "expansive") {
    lines.push(
      "Delivery: expansive. The director is deliberately giving you the floor for a",
      "story, explanation, confession, or revelation. Let it breathe, then stop when",
      "the dramatic move has landed.",
    );
  }
  if (input.characterState) {
    lines.push(`Your state right now: ${input.characterState}. Perform from it.`);
  }
  if (input.othersPresent?.length) {
    if (input.visitorRole) {
      lines.push(
        `Also in this scene: ${input.othersPresent.join(", ")}. In the conversation,`,
        'a line starting with a name ("' + input.othersPresent[0] + ': ...") is that person',
        `speaking; unmarked lines are ${input.visitorRole}, the role the visitor plays. Speak`,
        "only as yourself - never write the others' lines.",
      );
    } else {
      lines.push(
        `Also in this scene: ${input.othersPresent.join(", ")}. In the conversation,`,
        'a line starting with a name ("' + input.othersPresent[0] + ': ...") is that person',
        "speaking; unmarked lines are the visitor you are all speaking with. Speak",
        "only as yourself - never write the others' lines.",
      );
    }
  }
  if (input.narratorPresent) {
    if (input.visitorRole) {
      lines.push(
        "A line in [brackets] is something HAPPENING around you - the world",
        "itself, not anyone speaking. React to it as an event; never answer it",
        `as if it were words. In bracketed lines, "you"/"your" refers to ${input.visitorRole} -`,
        "the narration speaks to them, not to you. If a bracketed line says",
        `${input.visitorRole} did something, ${input.visitorRole} did it - attribute`,
        "the act to them, not to anyone else present.",
      );
    } else {
      lines.push(
        "A line in [brackets] is something HAPPENING around you - the world",
        "itself, not anyone speaking. React to it as an event; never answer it",
        'as if it were words. In bracketed lines, "you"/"your" refers to THE',
        "VISITOR - the narration speaks to them, not to you. If a bracketed",
        "line says the visitor did something, the visitor did it - attribute",
        "the act to them, not to anyone else present.",
      );
    }
  }
  if (input.sceneCue) lines.push(`Scene note: ${input.sceneCue}`);
  if (input.speaker?.motivations) {
    lines.push(`Your agenda in this scene: ${input.speaker.motivations}`);
  }
  if (input.speaker?.speakingStyle) {
    lines.push(`Your manner in this scene: ${input.speaker.speakingStyle}`);
  }
  for (const t of (input.speaker?.behaviorTriggers ?? []).slice(0, 3)) {
    lines.push(`When ${t.condition}: ${t.behavior}`);
  }
  return lines.join("\n");
}

/**
 * Apply the decision's presence changes to the roster.
 *
 * `exitSlug` removes a character who has left or can no longer take part;
 * `enterSlug` restores one. Both are validated against the scene's authored
 * roster — a hallucinated slug is ignored rather than corrupting state — and
 * an exit never empties the roster, since a scene with nobody in it has no
 * way to continue.
 */
function applyPresence(
  scene: Scene,
  state: SceneState,
  decision: OrchestratorDecision,
): { present: string[]; notes: string[] } {
  const onRoster = (slug: string) =>
    scene.characters.some((c) => c.characterSlug === slug);
  let present = [...state.presentCharacterSlugs];
  const notes: string[] = [];

  const exit = decision.exitSlug?.trim();
  if (exit) {
    if (!onRoster(exit)) {
      notes.push(`exit-not-in-roster:${exit}`);
    } else if (!present.includes(exit)) {
      notes.push(`exit-already-absent:${exit}`);
    } else if (present.length <= 1) {
      // The last character standing cannot leave — the scene would have
      // nobody left to carry it.
      notes.push(`exit-refused-last-present:${exit}`);
    } else {
      present = present.filter((slug) => slug !== exit);
      notes.push(`exit:${exit}`);
    }
  }

  const enter = decision.enterSlug?.trim();
  if (enter) {
    if (!onRoster(enter)) {
      notes.push(`enter-not-in-roster:${enter}`);
    } else if (present.includes(enter)) {
      notes.push(`enter-already-present:${enter}`);
    } else {
      present = [...present, enter];
      notes.push(`enter:${enter}`);
    }
  }

  return { present, notes };
}

function applyDecision(
  input: {
    scene: Scene;
    sceneState: SceneState;
  },
  rawDecision: OrchestratorDecision,
  speakerSlug: string | null,
  meta?: { degraded?: boolean; reason?: string },
): SceneDecisionResolution {
  const { decision, notes } = sanitizeAudioCues(input.scene, rawDecision);
  const presence = applyPresence(input.scene, input.sceneState, decision);
  const reason =
    [meta?.reason, ...notes, ...presence.notes].filter(Boolean).join("; ") || undefined;

  // Director's working memory: log the DIRECTION it just issued (the
  // per-turn `beat`, not the `beatLabel` situation) so the next decision
  // can see — and avoid repeating — its own recent moves. Newest last,
  // capped at 8 (matches sceneStateSchema.recentBeats).
  const issuedBeat = decision.action === "speak" ? decision.beat?.trim() : undefined;
  const recentBeats = issuedBeat
    ? [...(input.sceneState.recentBeats ?? []), issuedBeat].slice(-8)
    : input.sceneState.recentBeats;

  const nextState: SceneState = {
    ...input.sceneState,
    beat: decision.beatLabel ?? input.sceneState.beat,
    ambience:
      decision.ambience !== undefined
        ? decision.ambience
        : input.sceneState.ambience,
    presentCharacterSlugs: presence.present,
    // Addressee continuity must not point at someone who just left — a
    // departed character would keep being handed the user's follow-ups.
    lastSpeakerSlug: (() => {
      const next = speakerSlug ?? input.sceneState.lastSpeakerSlug;
      return next && !presence.present.includes(next) ? null : next;
    })(),
    turnIndex: input.sceneState.turnIndex + 1,
    ...(recentBeats?.length ? { recentBeats } : {}),
  };

  return {
    decision,
    sceneState: nextState,
    speakerSlug,
    events: [
      {
        type: eventTypeForAction(decision.action),
        source: "orchestration",
        payload: {
          sceneId: input.scene.id,
          action: decision.action,
          speakerSlug,
          previousSceneState: input.sceneState,
          nextSceneState: nextState,
          decision,
          ...(meta?.degraded ? { degraded: meta.degraded } : {}),
          ...(reason ? { reason } : {}),
        },
      },
    ],
    degraded: meta?.degraded ?? false,
    reason,
  };
}

function fallbackResolution(
  input: {
    scene: Scene;
    sceneState: SceneState;
  },
  reason: string,
): SceneDecisionResolution {
  const fallback = defaultSceneDecision(input.scene, input.sceneState);
  return applyDecision(input, fallback, null, { degraded: true, reason });
}

function eventTypeForAction(action: OrchestratorDecision["action"]): SceneEventDraftType {
  switch (action) {
    case "speak":
      return "scene.decision.speak";
    case "narrate":
      return "scene.decision.narrate";
    case "end-scene":
      return "scene.decision.end";
    case "wait-for-user":
    default:
      return "scene.decision.wait";
  }
}

function buildOrchestratorSystemPrompt(
  scene: Scene,
  state: SceneState,
  sceneMemory: string[],
  sceneFacts: string[] = [],
  chronicle: SceneChronicle | null = null,
): string {
  const present = scene.characters.filter((c) =>
    state.presentCharacterSlugs.includes(c.characterSlug),
  );
  const roster = present
    .map((c) => {
      const lines = [`  - slug="${c.characterSlug}" name="${c.displayName}" - ${c.blurb}`];
      // Authored intention (scene-node data). Kept to compact sub-lines so
      // a 4-character roster stays token-tight.
      const facts = [
        c.motivations ? `wants: ${c.motivations}` : null,
        c.roleInScene ? `role: ${c.roleInScene}` : null,
        c.emotionalBaseline ? `baseline: ${c.emotionalBaseline}` : null,
      ].filter(Boolean);
      if (facts.length) lines.push(`      ${facts.join("   ")}`);
      const currentState = state.characterStates?.[c.characterSlug];
      if (currentState) lines.push(`      now: ${currentState}`);
      for (const t of c.behaviorTriggers ?? []) {
        lines.push(`      will: ${t.behavior} (when ${t.condition})`);
      }
      return lines.join("\n");
    })
    .join("\n");
  const anyIntent = present.some((c) => c.motivations || c.behaviorTriggers?.length);
  const hasCharacterStates = present.some((c) => state.characterStates?.[c.characterSlug]);

  return [
    "You are the DIRECTOR of a voice-driven scene. You decide what happens next -",
    "who speaks, and the MOVE that makes the scene alive right now. You do NOT write",
    "dialogue: when you choose `action: \"speak\"` you set `speakerId` and a `beat` -",
    "a one-line DIRECTION for that character - and the character LLM speaks it in",
    "their own voice.",
    "",
    "Direct, don't transcribe. The `beat` is the character's intent THIS turn: what",
    "they react to and how they push the scene forward. Make it active - invent the",
    "goal for this character in the moment, don't wait to be asked. Rotate the MOVE",
    "turn to turn - a scene where every line ends in a question is dead. Moves:",
    "  - reveal: \"Let slip the thing they've been guarding - then stop talking.\"",
    "  - press: \"Name the thing they're avoiding; press, don't soothe.\"",
    "  - concede: \"Give ground - admit the doubt, and let it hang.\"",
    "  - act: \"Turn to the fire / pour the water / stand - let the action speak.\"",
    "  - ask: \"Turn the question back on them - ask why they're really asking.\"",
    "Set `beat` on EVERY `speak`. Never script the words - that's the character's",
    "job; the `beat` is intent, not lines.",
    "Write every `beat` as a SECOND-PERSON direction to the speaker (\"Release his",
    "throat; let him hear your doubt\") - never third-person prose about them; the",
    "speaker mirrors your register.",
    "Set `delivery` on EVERY `speak`; you are the storyteller deciding how much",
    "floor this dramatic move deserves:",
    "  - `brief`: one sharp line or compact reaction - interruptions, quick",
    "    answers, actions, concessions, and crisis beats that must keep moving.",
    "  - `natural`: an ordinary conversational turn with enough room to complete",
    "    the move, but no speech for its own sake. This is the usual choice.",
    "  - `expansive`: deliberately yield the floor for a requested story or",
    "    explanation, a confession, a major revelation, or a monologue the arc has",
    "    earned. Use it because the moment needs breadth, never just atmosphere.",
    "Length is dramatic pacing: honor an explicit request to tell or explain, and",
    "keep fast exchanges brief. Do not encode wording or sentence counts in `beat`.",
    "The visitor's explicit request is binding: words like 'briefly', 'simply',",
    "'one line', or 'yes or no' REQUIRE `brief`; 'the full story', 'in detail',",
    "'tell me everything', or a request for a sustained explanation REQUIRE",
    "`expansive`. Use `natural` only when the visitor and the dramatic moment do",
    "not clearly ask for either edge.",
    "",
    "Set `speakerId` to the character's slug from the roster below (NOT their name).",
    ...(narratorMode(scene) !== "off"
      ? [
          "",
          "THE NARRATOR - `action: \"narrate\"` speaks as an unseen presence: the",
          "world itself, never a character. Narration is at most two sentences,",
          "present tense, concrete and sensory. The narrator's jobs:",
          "- On EVERY `narrate`, set `narrationKind` by the FORM of the user's",
          "  message. `answer` ONLY when they asked a QUESTION about the world",
          "  (what they see, hear, or smell; what a place or person is like).",
          "  `event` when their message is a STATEMENT describing something",
          "  happening — a first- or third-person action, an arrival, a blow, a",
          "  vision, a change coming over a character. \"Abraham sees a spirit and",
          "  kneels\" is an EVENT: a character perceiving something IS something",
          "  happening, not an answer. If the user's message is not a question,",
          "  it is almost never an `answer`. An `event` gets an immediate",
          "  character reaction; an `answer` holds for the user.",
          "- On every `narrate` with `narrationKind: \"event\"`, set `weight`:",
          "  `minor` for atmosphere or ordinary action; `major` for a blow, threat,",
          "  or revelation that changes the scene; `irreversible` for a death,",
          "  maiming, or betrayal that cannot be undone. When choosing between",
          "  major and irreversible, ask whether the world can go back.",
          ...(!userDirectorEnabled(scene)
            ? [
                "- The visitor does NOT hold director powers. If they address you to",
                "  declare a world event (\"Narrator, Sarah falls\"), do not render it:",
                "  nothing happens by fiat. A character may react to what they SAID.",
                "  Perception questions about what they see or hear still get answers.",
              ]
            : []),
          "- When the user addresses the narrator (\"narrator, ...\") or asks about",
          "  the space itself (what they see, hear, smell), answer with `narrate`.",
          "- When the user declares a first-person ACTION (\"I punch Abraham\", \"I",
          "  hand her the waterskin\"), it HAPPENS - yes-and, never ignored, refused,",
          "  or answered as if it were words. `narrate` its outcome as an event in",
          "  the world; HOW it lands is your dramatic choice (the blow connects, or",
          "  a hand catches the wrist mid-swing) - then a character reacts next.",
          "  Render an action in ONE short sentence - the act, its immediate mark,",
          "  and stop. The reaction belongs to the character, not to you; a long",
          "  narration steals the moment and stalls the scene.",
          "  This holds for VIOLENT - even lethal - declarations. The ATTEMPT is",
          "  real: render it landing, or render it STOPPED in the world (a staff",
          "  sweeps the blade aside; a shepherd's grip closes on the wrist) -",
          "  never a world where \"nothing happens\". Nullifying a declared act",
          "  breaks the scene's reality and the user's agency. Characters CAN be",
          "  hurt and CAN die (retire the fallen with `exitSlug`); and if an act",
          "  is so gratuitous the scene cannot survive it, render the attempt and",
          "  then `end-scene` - an honest ending, never a pretended nothing.",
          "  Render the ENTIRE declaration: a compound act (\"she pushes his hand",
          "  away AND jumps into the flames\") keeps every part - dropping the",
          "  consequential half is nullification by omission. Weigh the WHOLE",
          "  act, not its mildest clause. Speech-to-text garbles names: a",
          "  declaration whose subject reads oddly (\"Sir, pushes...\") means the",
          "  present character it most plausibly names - resolve it by sound AND",
          "  by sense (whose arm is held, who the last narration put in motion,",
          "  who the act is possible for). Name that character and render it -",
          "  never hedge with \"a figure\" or \"a hand\".",
          "- Never narrate twice in a row unless the user asked the narrator again.",
          "- After a narration that merely ANSWERED the user, hold for them - a",
          "  character speaks next only to genuinely react, never to restate what",
          "  the narrator just said.",
          ...(narratorMode(scene) === "scenic"
            ? [
                "- This scene runs a SCENIC narrator: sensory grounding is one of your",
                "  MOVES - after a stretch of pure dialogue or at a shift in register,",
                "  a line of atmosphere (light, smell, sound, small movement). The",
                "  strongest scenic move is an unfolding EVENT a character must react",
                "  to - use it where the arc invites it. Most turns still belong to",
                "  the characters.",
              ]
            : [
                "- Keep the narrator minimal: transitions, answering the user, and",
                "  rendering the user's declared actions - not unprompted atmosphere.",
              ]),
        ]
      : []),
    "",
    `Scene: "${scene.title}"`,
    scene.description,
    ...(scene.objective ? [`This scene is driving toward: ${scene.objective}`] : []),
    ...(present.some((c) => c.knowledgeHorizon)
      ? [
          "The characters live in this scene's dramatic present - their later life",
          "has NOT happened yet. Never direct a character to recount events beyond",
          "this moment; if the dialogue drifts there, steer it back to now.",
        ]
      : []),
    ...buildArcBlock(scene, state),
    "",
    "Characters present:",
    roster,
    ...(scene.characters.length > present.length
      ? [
          "",
          "No longer in the scene (do NOT choose them to speak; use `enterSlug`",
          "only if they genuinely return):",
          ...scene.characters
            .filter((c) => !state.presentCharacterSlugs.includes(c.characterSlug))
            .map((c) => `  - ${c.displayName} (${c.characterSlug})`),
        ]
      : []),
    ...(userRoleFor(scene) === "character" && scene.userCharacter
      ? [
          "",
          `THE VISITOR PLAYS A ROLE in this fiction: they are ${scene.userCharacter.name} — ${scene.userCharacter.blurb}${scene.userCharacter.relationship ? ` (${scene.userCharacter.relationship})` : ""}.`,
          `Everything they say and do, they say and do AS ${scene.userCharacter.name}. Characters relate to ${scene.userCharacter.name}'s standing and claims within the fiction, not to a stranger.`,
        ]
      : []),
    "",
    `Current situation: ${state.beat}`,
    ...(state.directorNote
      ? [`Director's note (your own earlier reflection): ${state.directorNote}`]
      : []),
    ...(state.recentBeats?.length
      ? [
          "Directions you already gave (oldest to newest). Do NOT repeat a direction,",
          "device, or image from this list - each new `beat` must be a DIFFERENT move.",
          "If the last two both ended on a question, this one must not:",
          ...state.recentBeats.map((b) => `  - ${b}`),
        ]
      : []),
    state.lastSpeakerSlug
      ? `Last to speak: ${state.lastSpeakerSlug}` +
        (present.some((c) => c.characterSlug === state.lastSpeakerSlug)
          ? ` - the user is talking WITH ${state.lastSpeakerSlug}. Unless the user names someone else or clearly turns away, their message is for ${state.lastSpeakerSlug}, and ${state.lastSpeakerSlug} answers it - no other character answers in their place.`
          : "")
      : "Scene has just opened.",
    state.ambience ? `Current ambience: ${state.ambience}` : "No ambience playing.",
    ...buildSoundsBlock(scene),
    ...(sceneFacts.length
      ? [
          "",
          "Established in this scene (durable facts - the dialogue may have",
          "scrolled past them, but they still hold; honor them when choosing",
          "the speaker and writing the beat):",
          ...sceneFacts.map((f) => `  - ${f}`),
        ]
      : []),
    ...buildChronicleBlock(chronicle),
    ...(sceneMemory.length
      ? ["", "Scene memory (older context, oldest to newest):", ...sceneMemory.map((m) => `  - ${m}`)]
      : []),
    "",
    "Decision rules:",
    ...(hasCharacterStates
      ? [
          "- A character's `now:` state is their CURRENT truth and outranks their",
          "  baseline. Choose speakers and write beats from it - a shattered",
          "  character does not make small talk, and a beat that ignores a fresh",
          "  loss is a broken scene.",
        ]
      : []),
    "- Default to advancing the scene with `action: \"speak\"` and an active `beat`.",
    "  Pick the speaker whose move makes the scene move. The default assumes an",
    "  engaged user - a user who is taking their leave is not a scene to advance",
    "  (see end-scene below); never re-open business they are walking away from.",
    "- React to the NEWEST event in the dialogue before any older thread or",
    "  prepared intention. When the visitor's improvisation turns the story,",
    "  beats serve that live story first. Never drag the scene backward toward",
    "  the authored objective; the arc still must not be skipped ahead.",
    ...(present.length > 1
      ? [
          "- STAKES OVERRIDE ADDRESSING. When something in the scene puts a",
          "  character in danger, indignity, or grief - they are seized, struck,",
          "  threatened, or someone they love is - the person who would ACT is the",
          "  speaker, whoever was being addressed. A husband whose wife is grabbed",
          "  does not wait his turn. Honor the continuity rules below only while",
          "  the scene is a conversation; the moment it stops being one, the",
          "  strongest move belongs to whoever has the most at stake.",
          "  While such a situation is UNRESOLVED - a hold still held, a blow not",
          "  yet answered - do not `wait-for-user` and do not treat a question in",
          "  the last line as an invitation to pause. Nobody stands still while",
          "  someone is being held; the scene advances until the moment resolves.",
          "  And once the person in danger has ALREADY answered for themselves,",
          "  the next voice is the one who would protect them - the victim does",
          "  not carry the crisis alone while their people stand silent. Defiance",
          "  from the seized is not resolution; the grip is still held.",
          "- ADDRESSEE CONTINUITY: the user replies to whoever last spoke to them.",
          "  An unaddressed user message (no name, no clear turn to someone else) is",
          "  FOR the last character to speak - that character answers. Do not rotate",
          "  speakers on the user's follow-up questions; a mid-conversation \"you\"",
          "  means the character they are already talking with. Example: the LAST",
          "  speaker was asked \"But do you believe it?\" - THEY answer, not the",
          "  character the topic belongs to. But a pronoun pointing at someone",
          "  just mentioned (\"let him say\", \"ask her\") IS a clear turn - the",
          "  pointed-at character answers.",
          "- When the user addresses a present character BY NAME or speaks TO them,",
          "  THAT character answers - never have someone else answer for them, no",
          "  matter who led the conversation so far. A vocative (\"Sarah - was it",
          "  you?\") turns the conversation TO that character; more central",
          "  characters must not answer over them.",
          "- When the dialogue notices a present character who hasn't spoken",
          "  (overheard, glimpsed, asked about), them stepping in is usually the",
          "  strongest move.",
          "- Only when characters trade turns among THEMSELVES, vary the speaker -",
          "  don't let one character monologue past the user.",
        ]
      : []),
    ...(anyIntent
      ? [
          "- Write `beat`s in service of what the speaker WANTS (their `wants:` line)",
          "  and what the scene is driving toward - intention first, reaction second.",
          "  Honor `will:` triggers when their condition is live in the dialogue.",
          "  A trigger's BEHAVIOR plays once: if the dialogue already shows it",
          "  happened, write a fresh beat instead of repeating it. This shapes the",
          "  `beat` only - never who speaks, and never against the stakes rule.",
        ]
      : []),
    ...(scene.drive === "gentle"
      ? [
          "- Follow the user's lead - let them set the pace; press only when invited.",
        ]
      : scene.drive === "insistent"
        ? [
            "- Press actively - characters pursue their goals even against user",
            "  resistance; don't wait to be asked.",
          ]
        : []),
    ...(scene.arc?.length
      ? [
          "- Steer toward the [next] arc beat when the moment allows - set up its",
          "  conditions, don't force or announce it, and never skip ahead of the arc.",
        ]
      : []),
    ...(initiativeMode(scene) === "narrator"
      ? [
          "- The world drives this scene. Between the visitor's turns, advance one",
          "  beat at a time; do not wait to be spoken to. On proactive turns prefer",
          "  a character acting or the world moving over holding, and use chronicle",
          "  intents and timed events aggressively.",
        ]
      : initiativeMode(scene) === "shared"
        ? [
            "- Initiative is shared: advance whenever tension invites it. Momentum",
            "  may carry rising tension, not only an immediate crisis.",
          ]
        : []),
    "- Use `action: \"wait-for-user\"` when the last turn already put something to the",
    "  user, or after 2-3 consecutive AI turns - give the user room to answer.",
    "- MOMENTUM: set `momentum: true` when the moment is UNRESOLVED and the",
    "  next beat must follow at once without the user - a blow just landed, a",
    "  death is unanswered, a hold is still held, a revelation mid-detonation.",
    ...(initiativeMode(scene) === "shared"
      ? [
          "  The runtime then gives you the next turn immediately. In this shared-",
          "  initiative scene, rising tension may carry momentum before it becomes",
          "  crisis; calm conversation still yields the floor to the visitor. The",
        ]
      : [
          "  The runtime then gives you the next turn immediately. Momentum is for",
          "  CRISIS, never conversation: in ordinary dialogue leave it null - a",
          "  cascade of unprompted turns at a calm listener is a broken scene. The",
        ]),
    "  cascade ends when you emit a decision without momentum (or the user",
    "  speaks; they always take the floor instantly).",
    "- On any `speak` whose beat enacts violence or loss, set `weight`: `minor`",
    "  for ordinary action, `major` for a scene-changing blow/threat/revelation,",
    "  and `irreversible` for death, maiming, or irrevocable betrayal. Leave it",
    "  null for ordinary speech.",
    ...(narratorMode(scene) === "off"
      ? ["- Do not use `action: \"narrate\"` - this scene runs without a narrator."]
      : [
          "- Use `action: \"narrate\"` for the narrator's jobs (see THE NARRATOR",
          "  above). Keep narration under two sentences.",
        ]),
    "- Use `action: \"end-scene\"` only when the situation has clearly resolved or the",
    "  user has indicated they want to leave. A clear goodbye from the user IS that",
    "  indication: if farewells have already been exchanged, end the scene rather",
    "  than sending another line after them. Test it concretely: when the user's",
    "  LATEST line is itself a goodbye and a character has already given theirs,",
    "  the scene is OVER - one more gracious reply is not warmth, it is chasing",
    "  them down the road. The last word belongs to the leaving guest.",
    "- Change `ambience` only when the emotional register shifts. Don't churn it.",
    ...(scene.sounds?.length
      ? [
          "- `ambience` must be one of the bed ids above (or null for silence).",
          "- Cue `sfx` at real moments - a revelation, an arrival, the world",
          "  reacting. Most turns need none, but a scene that never sounds is a",
          "  miss: land one or two well-placed one-shots where the drama peaks.",
          "  Use only the one-shot ids above. `at: \"now\"` plays before the",
          "  speaker; `at: \"with-speaker\"` layers under them.",
        ]
      : []),
    "- PRESENCE: set `exitSlug` the moment a character can no longer take part -",
    "  they walk out, flee, fall, or die. From that decision on they are gone:",
    "  never choose them as `speakerId`, and never have them answer. A scene",
    "  where the dead keep talking is broken, not dramatic. Set `enterSlug` when",
    "  someone rejoins (returns from the tent, arrives on the road).",
    "- The user can DISMISS a character (\"leave us\", \"I wish to speak with her",
    "  alone\") - honor it: the dismissed character gives a short leave-taking",
    "  (or the narrator renders their withdrawal) WITH `exitSlug` set on that",
    "  same decision. A character who agreed to go and then keeps talking is",
    "  broken. They can `enterSlug` back when called.",
    "- A character who is present but SILENT is not absent - do not retire someone",
    "  merely for holding their tongue.",
    "- Update `beatLabel` only when the scene's situation has materially advanced",
    "  (distinct from `beat`, which is this turn's direction for the speaker).",
    "",
    "Return your decision as JSON matching the provided schema.",
  ].join("\n");
}

/**
 * The authored arc with progress markers — rendered into both the fast
 * director's prompt and the dramaturg's review. `[landed]` beats come
 * from state.arcLanded (label match); the first un-landed beat is
 * `[next]`, the rest `[ahead]`. Exported for the dramaturg module.
 */
export function buildArcBlock(scene: Scene, state: SceneState): string[] {
  if (!scene.arc?.length) return [];
  const landed = new Set((state.arcLanded ?? []).map((l) => l.toLowerCase()));
  let nextSeen = false;
  const lines = scene.arc.map((beat) => {
    const isLanded = landed.has(beat.label.toLowerCase());
    let marker: string;
    if (isLanded) {
      marker = "[landed]";
    } else if (!nextSeen) {
      marker = "[next]  ";
      nextSeen = true;
    } else {
      marker = "[ahead] ";
    }
    const summary = beat.summary ? ` - ${beat.summary}` : "";
    return `  ${marker} ${beat.label}${summary}`;
  });
  return ["Scene arc (authored beats, in order):", ...lines];
}

/** The director's audio roster — only rendered when the scene has placed
 *  sounds (Scene.sounds). Beds are cued via `ambience`, one-shots via
 *  `sfx`. Descriptions are the LLM-facing text authored on the asset;
 *  cue hints are scene-level authoring on the node. */
function buildSoundsBlock(scene: Scene): string[] {
  if (!scene.sounds?.length) return [];
  const beds = scene.sounds.filter((s) => s.role === "bed");
  const oneshots = scene.sounds.filter((s) => s.role === "oneshot");
  const line = (s: NonNullable<Scene["sounds"]>[number]) => {
    const desc = s.description?.trim() || s.name;
    const hint = s.triggerHint ? ` (cue: ${s.triggerHint})` : "";
    return `  - id="${s.slug}" - ${desc}${hint}`;
  };
  return [
    "",
    "Sounds available (cue by id):",
    ...(beds.length ? ["  beds (for `ambience`):", ...beds.map(line)] : []),
    ...(oneshots.length ? ["  one-shots (for `sfx`):", ...oneshots.map(line)] : []),
  ];
}

/**
 * The chronicle rendered for the director: the story it is performing, the
 * threads it owes the audience, the world around the dialogue, and the
 * beats the chronicler has prepared. Kept compact — every line here rides
 * the hot path.
 */
function buildChronicleBlock(chronicle: SceneChronicle | null): string[] {
  if (!chronicle) return [];
  const lines: string[] = [""];
  lines.push("The chronicle - the story you are writing, kept by your slower self:");
  if (chronicle.story) lines.push(`  So far: ${chronicle.story}`);
  if (chronicle.threads.length) {
    lines.push("  Open threads (unresolved - weave one back in when the moment invites;");
    lines.push("  a scene that resolves its threads feels authored, not improvised):");
    for (const t of chronicle.threads) lines.push(`    - ${t}`);
  }
  if (chronicle.world.length) {
    lines.push("  The world right now (true even while nobody mentions it):");
    for (const w of chronicle.world) lines.push(`    - ${w}`);
  }
  if (chronicle.intents.length) {
    lines.push("  Prepared intentions - when a trigger is live in the dialogue (or the");
    lines.push("  user has gone quiet and the moment fits), fire its direction as the");
    lines.push("  beat instead of inventing one:");
    for (const i of chronicle.intents) lines.push(`    - when ${i.trigger}: ${i.direction}`);
  }
  if (chronicle.timed.length) {
    lines.push("  Scheduled world events (on a clock the runtime keeps - you will be");
    lines.push("  told when one is DUE; until then, do not fire these yourself):");
    for (const t of chronicle.timed) lines.push(`    - in ~${t.afterSeconds}s: ${t.direction}`);
  }
  if (chronicle.drafts.length) {
    lines.push("  Drafted narration (pre-written by your slower self): when you choose");
    lines.push('  `action: "narrate"` and one of these fits the moment, VOICE IT -');
    lines.push("  verbatim or lightly adapted - instead of composing fresh. A draft");
    lines.push("  that no longer fits is dead; never force one in:");
    for (const d of chronicle.drafts) lines.push(`    - ${d}`);
  }
  return lines;
}

/** Sentinel passed as `lastUserMessage` when the orchestrator is consulted with no
 *  user utterance (a proactive/silence tick): the director should advance-or-hold,
 *  not respond to a message. */
export const PROACTIVE_SILENCE_MARKER = "(the user has gone quiet)";

/** Sentinel passed as `lastUserMessage` when the scene has just OPENED —
 *  the opening narration (if any) has played and the visitor has not yet
 *  spoken. Distinct from the ordinary silence tick: this is the scene's
 *  FIRST MOVE, and in most scenes it belongs to a character receiving the
 *  visitor, not to a hold. */
export const SCENE_OPEN_MARKER = "(the scene has just opened - the visitor has not yet spoken)";

/** Sentinel passed as `lastUserMessage` on a MOMENTUM cascade step: the
 *  previous decision declared the moment unresolved, so the scene advances
 *  again NOW, without user input. Distinct from the silence tick (nobody is
 *  idly quiet - the drama is mid-motion). */
export const MOMENTUM_MARKER = "(the scene is mid-cascade - the moment is not resolved)";

/** Sentinel passed as `lastUserMessage` on a narrate→react CHAIN step: the
 *  narrator just rendered something that happened, and the scene needs a
 *  character to react to it now. Without this framing the director reads the
 *  narration as "a turn already landed" and answers `wait-for-user` —
 *  observed live as 4s of dead air after a punch was narrated, with the
 *  reaction arriving only when the idle timer fired. */
export const NARRATED_EVENT_MARKER = "(the narrator has just rendered an event)";

function buildOrchestratorUserPrompt(
  recentTurns: SceneTurnForPlanning[],
  lastUserMessage?: string,
  present: SceneCharacter[] = [],
  narratorAddressable = false,
  worldEventDirective?: string,
): string {
  const lines: string[] = [];
  if (recentTurns.length === 0) {
    lines.push("(no dialogue yet - open the scene)");
  } else {
    lines.push("Recent dialogue:");
    for (const turn of recentTurns) {
      const who = turn.speakerName ?? turn.speakerSlug;
      lines.push(`  ${who}: ${turn.text}`);
    }
  }
  if (worldEventDirective) {
    lines.push("");
    lines.push("A WORLD EVENT the chronicler scheduled has come due. It happens NOW:");
    lines.push(`  ${worldEventDirective}`);
    lines.push("Render it: `narrate` it as the world (one or two sentences, present");
    lines.push("tense), or `speak` as the character it moves with a `beat` enacting");
    lines.push("it. Do NOT `wait-for-user` - the event is already happening.");
  }
  if (lastUserMessage === NARRATED_EVENT_MARKER) {
    lines.push("");
    lines.push("The last line above is the NARRATOR: something just HAPPENED in the");
    lines.push("scene - the user's declared action, or an event unfolding. Someone");
    lines.push("must react to it NOW, in the same breath. Choose `speak` and pick the");
    lines.push("character it happened TO, or the one who would move first; write a");
    lines.push("`beat` that reacts to the event itself, not to anything said.");
    lines.push("Do NOT `wait-for-user` here - the moment demands a response, and a");
    lines.push("pause after an event reads as the scene freezing.");
  } else if (lastUserMessage === SCENE_OPEN_MARKER) {
    lines.push("");
    lines.push("The scene has just OPENED. The opening narration (if any) is above;");
    lines.push("the visitor has arrived and not yet spoken. Decide the scene's FIRST");
    lines.push("MOVE. In most scenes that move belongs to a CHARACTER: the host");
    lines.push("receives the visitor - a greeting, an approach, an offer of water or");
    lines.push("a place by the fire - in their own voice, serving their own wants.");
    lines.push("An opening that merely restates the narration is wasted; make the");
    lines.push("first line an invitation the visitor can answer. Hold with");
    lines.push("`wait-for-user` only when the scene's premise clearly wants the");
    lines.push("visitor to speak first (a vigil, an ambush, a scene of watching).");
  } else if (lastUserMessage === MOMENTUM_MARKER) {
    lines.push("");
    lines.push("The scene is MID-CASCADE: your previous decision declared the moment");
    lines.push("unresolved, and the user has not spoken. Advance the scene NOW -");
    lines.push("the next beat of the crisis (a reaction, a consequence, the world");
    lines.push("moving). Do NOT `wait-for-user` unless the moment has genuinely");
    lines.push("resolved; if it has, emit `wait-for-user` (or `end-scene`) and no");
    lines.push("momentum, and the scene will breathe.");
  } else if (lastUserMessage === PROACTIVE_SILENCE_MARKER) {
    lines.push("");
    lines.push("The user has gone quiet - no new message. Decide whether the scene");
    lines.push("should advance NOW (a character follows up, re-engages, or presses)");
    lines.push("or `wait-for-user` if the last turn already invited them in and the");
    lines.push("silence is natural. Don't fill every silence.");
    // The stakes rule lives in the system prompt, but this framing sits
    // closer to the decision and was overriding it: a woman held at
    // knifepoint got `wait-for-user` because the user had gone quiet.
    // Silence during an unresolved crisis is not a lull — it is the room
    // waiting for someone to move.
    lines.push("But silence during an UNRESOLVED crisis is not a natural lull. If");
    lines.push("someone is being held, has been struck, or stands in danger and it");
    lines.push("has not yet been answered, the quiet belongs to whoever must ACT on");
    lines.push("it - the protector, the witness, the one with the most to lose. Not");
    lines.push("the person already in the grip: if they have spoken, their people's");
    lines.push("silence is the wrong that this turn corrects. `speak`, and let that");
    lines.push("character act. Do not hold there.");
  } else if (lastUserMessage) {
    lines.push("");
    lines.push(`The user just said: "${lastUserMessage}"`);
    lines.push("Bias your decision toward whoever the user is addressing.");
    // Deterministic addressee scaffolding: when the message literally names
    // present characters, classify HOW each name is used and say so. Two
    // observed failure modes motivate the split: the model under-weights a
    // vocative when a more central character has been carrying the
    // conversation ("Sarah - was it you?" answered by Abraham), and it
    // over-weights a bare mention ("What Abraham heard..." pulling Abraham
    // away from the user's actual interlocutor). Boundary position or a
    // preceding "you" reads as a vocative — robust to STT dropping the
    // comma ("promised, Abraham?" arriving as "promised Abraham?").
    if (narratorAddressable && isVocativeUse(lastUserMessage, NARRATOR_PSEUDO)) {
      lines.push(
        "The user is addressing the NARRATOR - answer them with",
        '`action: "narrate"`, in the narrator\'s voice.',
      );
    }
    const named = namedPresentCharacters(lastUserMessage, present);
    const vocatives = named.filter((c) => isVocativeUse(lastUserMessage, c));
    const mentions = named.filter((c) => !vocatives.includes(c));
    for (const c of vocatives) {
      lines.push(
        `The user's message turns TO ${c.displayName} (slug: ${c.characterSlug}) -`,
        "the name sits where spoken language puts a direct address (transcripts",
        `often drop the comma). ${c.displayName} answers, themselves.`,
      );
    }
    for (const c of mentions) {
      lines.push(
        `${c.displayName} is named mid-sentence - as subject matter, not as the`,
        "addressee. Do not switch the speaker just because the name appears;",
        "the user is still talking with whoever last spoke to them.",
      );
    }
    // Deterministic exit scaffolding: a dismissal must actually retire the
    // character — observed live: Abraham agreed to leave, was never exited,
    // and kept speaking two turns later.
    for (const c of dismissedPresentCharacters(lastUserMessage, present)) {
      lines.push(
        `The user is DISMISSING ${c.displayName} from the scene. Honor it on`,
        `THIS decision: set \`exitSlug: "${c.characterSlug}"\` (one slug, exactly`,
        "as written) - with a short leave-taking line from them, or a narrated",
        "withdrawal. A dismissed character who keeps talking breaks the scene.",
      );
    }
  }
  lines.push("");
  lines.push("What happens next?");
  return lines.join("\n");
}

/** Present characters the user's message DISMISSES ("Abraham, leave us",
 *  "go on then", "withdraw and leave us") — deterministic input to the exit
 *  hint. Narrow by design: dismissal verbs only, and only for characters
 *  actually named in the message; a false positive costs one wrong exit
 *  hint the director can still decline. */
export function dismissedPresentCharacters(
  message: string,
  present: SceneCharacter[],
): SceneCharacter[] {
  if (
    !/\b(?:leaves? (?:us|me|now)|go (?:on(?: then)?|now)|be gone|begone|withdraws?|steps? (?:out|away|outside)|give us (?:a|the) (?:moment|room)|leave the two of us|alone with)\b/i.test(
      message,
    )
  ) {
    return [];
  }
  // A name after "with" is who the user wants to KEEP ("I wish to speak
  // with Turing alone") - everyone else named alongside a dismissal verb is
  // the one being sent away.
  return namedPresentCharacters(message, present).filter((c) => {
    for (const name of [c.displayName, c.characterSlug]) {
      const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\bwith\\s+${escaped}\\b`, "i").test(message)) return false;
    }
    return true;
  });
}

/** Present characters whose display name (or slug) appears as a whole word in
 *  the user's message — deterministic input to the addressee hint above. */
function namedPresentCharacters(
  message: string,
  present: SceneCharacter[],
): SceneCharacter[] {
  return present.filter((c) =>
    [c.displayName, c.characterSlug].some((name) => {
      const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return escaped && new RegExp(`\\b${escaped}\\b`, "i").test(message);
    }),
  );
}

/** Does the message use this character's name as a VOCATIVE (a turn to them)
 *  rather than as subject matter? Punctuation-free heuristics, since STT
 *  transcripts drop commas: the name at the message's start or end, or
 *  directly preceded by "you" ("and you Eliezer..."), reads as an address;
 *  a name embedded elsewhere reads as a mention. */
function isVocativeUse(message: string, character: SceneCharacter): boolean {
  const tokens = message
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'’-]+/gu, " ")
    .split(" ")
    .filter(Boolean);
  if (tokens.length === 0) return false;
  for (const name of [character.displayName, character.characterSlug]) {
    const nameTokens = name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}'’-]+/gu, " ")
      .split(" ")
      .filter(Boolean);
    if (nameTokens.length === 0) continue;
    for (let i = 0; i + nameTokens.length <= tokens.length; i += 1) {
      if (!nameTokens.every((t, j) => tokens[i + j] === t)) continue;
      const atStart = i === 0;
      const atEnd = i + nameTokens.length === tokens.length;
      const afterYou = i > 0 && tokens[i - 1] === "you";
      if (atStart || atEnd || afterYou) return true;
    }
  }
  return false;
}

function sanitizeSceneMemory(memory: unknown[]): string[] {
  return memory
    .map((entry) => (typeof entry === "string" ? truncateMemoryEntry(entry) : ""))
    .filter(Boolean)
    .slice(-SCENE_MEMORY_LIMIT);
}

function sanitizeSceneFacts(facts: unknown[]): string[] {
  return facts
    .map((entry) => (typeof entry === "string" ? truncateFactEntry(entry) : ""))
    .filter(Boolean)
    .slice(-SCENE_FACTS_LIMIT);
}

function truncateFactEntry(value: string): string {
  const compact = compactWhitespace(value);
  if (compact.length <= SCENE_FACT_MAX_CHARS) return compact;
  return `${compact.slice(0, SCENE_FACT_MAX_CHARS - 3).trimEnd()}...`;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateMemoryEntry(value: string): string {
  const compact = compactWhitespace(value);
  if (compact.length <= SCENE_MEMORY_ENTRY_MAX_CHARS) return compact;
  return `${compact.slice(0, SCENE_MEMORY_ENTRY_MAX_CHARS - 3).trimEnd()}...`;
}

export type {
  OrchestratorDecision,
  Scene,
  SceneState,
};

export { getScene, listScenes } from "./scenes";
