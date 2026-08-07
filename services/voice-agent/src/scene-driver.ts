import {
  getCharacterStore,
  getSceneStore,
  normalizeSoundDesign,
  soundDesignToSceneSounds,
  type CharacterRecord,
} from "@kawabunga/db";
import { getChatProviderForModel, modelMetaFor, type ChatProvider } from "@kawabunga/engine";
import {
  buildDirectiveChunk,
  buildOpeningNarrationMessages,
  buildDramaturgMessages,
  mergeChronicle,
  buildSceneDecisionRequest,
  buildSceneSessionSnapshot,
  buildSpeakerTurnRequest,
  createInitialSceneState,
  defaultSceneDecision,
  getScene,
  declaresUserAction,
  isNarratorAddressed,
  isNarratorEventDeclaration,
  initiativeMode,
  MOMENTUM_MARKER,
  NARRATED_EVENT_MARKER,
  PROACTIVE_SILENCE_MARKER,
  SCENE_OPEN_MARKER,
  RECENT_TURNS_LIMIT,
  expandLandedBeats,
  matchArcLabel,
  narratorMode,
  openingMode,
  parseDramaturgReflection,
  resolveOrchestratorExecutor,
  resolveSceneDecision,
  sanitizeOpeningNarration,
  selectAuthoredOpening,
  updateSceneFacts,
  updateSceneMemory,
  userDirectorEnabled,
  userRoleFor,
  buildDecisionJournalEntries,
  buildReflectionJournalEntry,
  buildProactiveSuppressedJournalEntry,
  buildWorldEventArmedJournalEntry,
  type OrchestratorExecutorResolution,
  type SceneChronicle,
  type SceneDecisionJournalExtras,
  type SceneProactiveSuppression,
  type SceneDecisionResolution,
  type SceneJournalSink,
  type SceneSessionSnapshot,
  type SceneTurnForPlanning,
} from "@kawabunga/orchestration";
import type {
  OrchestratorDecision,
  Scene,
  SceneState,
  SessionCostEntry,
  SfxCue,
} from "@kawabunga/types";
import { buildLlmSessionCostEntry, isRefusalBoilerplate } from "@kawabunga/voice-pipeline";

/** Don't speculate off a stray opener ("uh", "so") — wait for some real intent. */
const MIN_SPECULATE_CHARS = 8;
/** Enough accumulated words to identify intent before spending a director call. */
const MIN_SPECULATE_WORDS = 8;
/** Accept a speculation only if it was computed off ≥ this fraction of the final
 *  turn (and is a prefix of it) — so the speaker was chosen from ~the whole intent,
 *  not a short lead-in that happens to prefix-match. */
const SPECULATION_COVERAGE = 0.6;

/** Solo scenes get a latency-hidden director cue (Phase 3). =0 restores the 0ms
 *  single-character fastpath with no per-turn direction. */
const SOLO_CUE_ENABLED = process.env.VOICE_AGENT_SOLO_CUE !== "0";
/** On a solo FINAL-turn speculation MISS, pay the orchestrator inline for the cue
 *  (default off → serve the no-cue floor, zero added hot-path latency). */
const SOLO_CUE_ON_MISS = process.env.VOICE_AGENT_SOLO_CUE_ON_MISS === "1";

/** What the character "sees" as the latest message on a proactive turn — a state,
 *  not a request, so they continue in-voice rather than answer a meta-instruction.
 *  The actual direction rides in the promptChunk (the orchestrator's beat). */
const PROACTIVE_TURN_MESSAGE = "(The user has gone quiet.)";

/** The dramaturg — async reflection loop writing SceneState.directorNote (step 2
 *  of the intention architecture). Fire-and-forget after spoken turns; the fast
 *  director reads the note as its own earlier reflection. Kill-switch: =0. */
const DRAMATURG_ENABLED = process.env.VOICE_AGENT_DRAMATURG !== "0";
/** Fast structured model: Chronicle must settle promptly when a visitor leaves. */
const DEFAULT_DRAMATURG_MODEL = "gpt-oss-120b";
const DRAMATURG_MODEL = resolveDramaturgModel(process.env.VOICE_AGENT_DRAMATURG_MODEL);

/** A stronger brain can spend the narration playback window writing dramatic
 * reactions without adding perceived latency. Unlike the dramaturg, an unset
 * or invalid override means "use the character's normal brain". */
export function resolveReactionModel(raw: string | undefined): string | null {
  const id = raw?.trim();
  if (!id) return null;
  const meta = modelMetaFor(id);
  if (!meta) {
    console.warn(
      `[voice-agent] VOICE_AGENT_REACTION_MODEL="${id}" is not in the model registry — override IGNORED (hidden turns keep the default brain model)`,
    );
    return null;
  }
  console.log(`[voice-agent] reaction model override: ${id} (${meta.provider})`);
  return id;
}

/**
 * Validate the dramaturg model override against the model registry — the same
 * treatment as VOICE_AGENT_BRAIN_MODEL / ORCHESTRATOR_MODEL. This matters
 * because getChatProviderForModel silently routes an UNKNOWN id to its
 * Anthropic fallback: without this check a typo'd model wouldn't disable the
 * dramaturg (that path only fires on construction errors) — it would fail
 * every reflection at request time, warning once per tick, forever. Unknown
 * ids fall back to the default; a missing provider KEY is still handled
 * downstream (dramaturg disables for the session, warns once). Also covers
 * generated openings, which resolve through the same constant.
 */
export function resolveDramaturgModel(raw: string | undefined): string {
  const id = raw?.trim();
  if (!id) return DEFAULT_DRAMATURG_MODEL;
  const meta = modelMetaFor(id);
  if (!meta) {
    console.warn(
      `[dramaturg] VOICE_AGENT_DRAMATURG_MODEL="${id}" is not in the model registry — override IGNORED, using ${DEFAULT_DRAMATURG_MODEL}`,
    );
    return DEFAULT_DRAMATURG_MODEL;
  }
  if (id !== DEFAULT_DRAMATURG_MODEL) {
    console.log(`[dramaturg] model override: ${id} (${meta.provider})`);
  }
  return id;
}
/** Reflect every N completed spoken turns (1 = every turn). */
const DRAMATURG_EVERY = Math.max(1, Number(process.env.VOICE_AGENT_DRAMATURG_EVERY ?? 2));
const DRAMATURG_TIMEOUT_MS = Math.max(
  2_000,
  Number(process.env.VOICE_AGENT_DRAMATURG_TIMEOUT_MS ?? 10_000),
);
// gpt-oss counts hidden reasoning against this ceiling. A small cap can finish
// successfully with zero visible Chronicle text, so leave enough room for both
// reasoning and the structured reflection.
const DRAMATURG_MAX_TOKENS = Math.max(
  800,
  Math.min(3_200, Number(process.env.VOICE_AGENT_DRAMATURG_MAX_TOKENS ?? 2_400)),
);
/** Session-open budget for a generated opening — nobody is mid-conversation,
 *  but the listener is waiting for the scene to start. */
const OPENING_TIMEOUT_MS = 12_000;

/** Hard ceiling on driver-initiated beats after one user turn (the narrate
 *  chain + momentum continuations combined). The director ends a cascade by
 *  omitting `momentum`; this cap is the backstop against a runaway director.
 *  The user's voice supersedes a cascade instantly at every await. */
const CASCADE_MAX = Math.max(1, Number(process.env.VOICE_AGENT_CASCADE_MAX ?? 4));

/** Lowercase, collapse whitespace, drop trailing punctuation — for prefix matching
 *  a speculated partial against the final transcript. */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+$/g, "")
    .trim();
}

/** What the worker's `speak()` needs to voice one character's turn; resolves to the
 *  generated reply text (fed back into the scene's running transcript). */
export interface SceneSpeakInput {
  characterId: string;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** Orchestrator direction for this turn (sceneCue + beat). Omitted when there's
   *  nothing to inject (e.g. a sandbox solo turn before a director cue exists). */
  promptChunk?: string;
  /** Who's speaking — surfaced to the client so it can label the turn. */
  speaker: { slug: string; name: string };
  /** The speaker's scene-authored knowledge horizon — forwarded to
   *  runVoiceStream so the curator filters pages after this moment. */
  currentMoment?: { era: string; index: number };
  /** Observability only: director-side feature statuses (arc, speaker
   *  selection) — the pipeline can't see the scene definition, so the driver
   *  states them; they surface in the turn's `sceneFeatures` trace block. */
  sceneFeatures?: Record<string, string>;
  /** Request-level brain override for a latency-hidden turn. */
  model?: string;
  /** Hidden turns generate and synthesize into memory, then wait here before
   * publishing their first audio frame. The sink calls `onReady` once all
   * audio is buffered and `onAudioStart` immediately before flushing it. */
  audioGate?: {
    waitUntilOpen: Promise<void>;
    onReady: () => void;
    onAudioStart: () => void;
  };
}
export type SceneSpeakFn = (input: SceneSpeakInput, replyId: string) => Promise<string>;

/** What a drive() turn resolved to — the orchestrator's action, and whether a
 *  character actually spoke (so the caller can arm a follow-up or stop). */
export type SceneDriveOutcome = {
  action: OrchestratorDecision["action"];
  spoke: boolean;
  /** True when a newer drive/proactive turn superseded this one mid-flight —
   *  its decision was NOT applied and nothing was recorded. */
  superseded?: boolean;
};

/** Injectable collaborators — production defaults resolve from env + the DB;
 *  tests swap in fakes so the driver's turn machinery runs deterministically
 *  with no network, keys, or database. */
export type SceneDriverDeps = {
  /** Resolve the director executor (default: resolveOrchestratorExecutor from env). */
  resolveExecutor: () => OrchestratorExecutorResolution;
  /** Resolve a roster slug (or id) to its character record (default: character store). */
  resolveCharacter: (slugOrId: string) => Promise<CharacterRecord | null>;
  /** When set, the dramaturg uses this provider (and is force-enabled);
   *  default resolves DRAMATURG_MODEL via getChatProviderForModel. */
  dramaturgProvider?: ChatProvider;
  /** Validated request-level model for latency-hidden character turns. */
  reactionModel?: string | null;
};

const defaultDeps: SceneDriverDeps = {
  resolveExecutor: () => resolveOrchestratorExecutor(),
  resolveCharacter: async (slugOrId) =>
    (await getCharacterStore().getBySlug(slugOrId).catch(() => null)) ??
    (await getCharacterStore().getById(slugOrId).catch(() => null)),
  reactionModel: resolveReactionModel(process.env.VOICE_AGENT_REACTION_MODEL),
};

/** What #decide resolves to: the decision, plus the failure it papered over
 *  (executor error / timeout) so the caller can recover instead of waiting —
 *  and the call's provenance (latency, provider, model) for the journal. */
type DecideResult = {
  decision: OrchestratorDecision;
  failed?: string;
  latencyMs?: number;
  provider?: string;
  model?: string;
};

type ConsequenceContext = {
  summary: string;
  subjectSlug: string | null;
  affectedSlugs: string[];
};

const EXIT_INCAPACITATION_RE =
  /\b(?:die[sd]?|dead|death|kill(?:ed|s)?|slain|collapse[sd]?|unconscious|incapacitat(?:e|ed|ion)|maim(?:ed|s)?|mortally|struck down|cut down|falls? lifeless|no longer breath(?:es|ing)|breath stops?)\b/i;

function consequenceSummary(decision: OrchestratorDecision): string {
  const raw = decision.narration?.trim() || decision.beat?.trim() ||
    "an irreversible event changes the scene";
  return raw.replace(/\s+/g, " ").slice(0, 180);
}

function activatesConsequenceProtocol(decision: OrchestratorDecision): boolean {
  if (decision.weight === "irreversible") return true;
  if (!decision.exitSlug?.trim()) return false;
  if (decision.weight === "major") return true;
  if (decision.weight === "minor") return false;
  return EXIT_INCAPACITATION_RE.test(consequenceSummary(decision));
}

/**
 * The NARRATOR's runtime — drives a multi-character SCENE over a LiveKit room.
 * The Narrator is the unified orchestrator; this class hosts its three
 * faculties: the DIRECTOR (fast per-turn decisions), the CHRONICLER (async
 * story authorship — chronicle, facts, arc, notes), and the VOICE (the
 * narration channel via onNarrate). Each user turn it asks the
 * orchestrator who speaks next — IN-PROCESS (no HTTP hop): fastpath when the roster
 * is solo, Cerebras/Groq when it's a real choice — resolves that character, and
 * hands the worker a turn to voice via `runVoiceStream`. Holds the live SceneState +
 * running transcript in memory (B1: the loop doesn't persist to the DB yet).
 *
 * The single-character voice cell is the degenerate case of this (1-char fastpath);
 * a "world" is just a scene with a bigger roster.
 */
export class SceneDriver {
  readonly scene: Scene;
  #deps: SceneDriverDeps;
  #sceneState: SceneState;
  #recentTurns: SceneTurnForPlanning[] = [];
  #sceneMemory: string[] = [];
  // Durable facts the dramaturg has extracted — the scene's long-term memory,
  // surviving after the verbatim window scrolls past the turns that stated them.
  #sceneFacts: string[] = [];
  // The chronicle — the Narrator's living story document (story-so-far, open
  // threads, world state, prepared intentions). Written by the chronicler
  // reflection, read by the director on every decision.
  #chronicle: SceneChronicle | null = null;
  // TIMED world events, armed from the chronicle: dueAt anchors to the moment
  // the reflection landed. `fired` survives chronicle restatements (dedupe by
  // direction text) so a re-stated pending event doesn't re-arm after firing.
  #timedSchedule: Array<{ dueAt: number; direction: string; fired: boolean }> = [];
  // Notified when a reflection arms NEW timed events — the host uses it to
  // schedule a wake-up for the due time (see agent.ts).
  #onWorldEventsArmed: (() => void) | null = null;
  // B4: the in-flight speculative decision (orchestrated off a partial transcript
  // during the endpoint hold) + the text it was computed from, so drive() can
  // accept it when the final transcript matches and skip the orchestrate latency.
  // The controller cancels the provider call when the speculation goes stale.
  #speculation: {
    basedOnText: string;
    abort: AbortController;
    promise: Promise<DecideResult>;
  } | null = null;
  #speculationStartedForTurn = false;
  // Optional persistence hook — invoked with a fresh snapshot after every decision.
  #onState: ((snapshot: SceneSessionSnapshot) => void) | null = null;
  // The scene journal sink — receives typed entries for every decision,
  // reflection, and world-event arming (the session's flight recorder).
  // Fire-and-forget: never awaited, throws swallowed.
  #journal: SceneJournalSink | null = null;
  #cost: ((entry: SessionCostEntry) => void) | null = null;
  #onSfx: ((cues: SfxCue[]) => void) | null = null;
  // Voices a `narrate` decision. Optional — unset = narration is recorded in
  // the transcript (so the director keeps continuity) but not spoken.
  #onNarrate:
    | ((text: string, meta: { userText?: string }) => Promise<void> | void)
    | null = null;
  // Explicit capability rather than timing inference: text-only callbacks can
  // resolve asynchronously too, but provide no playback window to hide work in.
  #narrationHasRealtimePlayback = false;
  #warnedUnvoicedNarration = false;
  // Turn epoch — bumped at the start of every drive()/driveProactive(). An
  // in-flight turn that observes a newer epoch after an await is SUPERSEDED
  // (barge-in / a newer user turn): it must stop mutating driver state.
  #epoch = 0;
  // Roster characters resolve once per driver — the roster is fixed for the
  // scene's lifetime, so no per-turn DB round-trips.
  #characterCache = new Map<string, CharacterRecord | null>();
  // Dramaturg: completed-spoken-turn counter (cadence), single-flight guard, and a
  // once-only disable if the provider can't be constructed (e.g. missing key).
  #spokenTurns = 0;
  #reflecting = false;
  #dramaturgDisabled: boolean;
  // An irreversible event bypasses the ordinary reflection cadence after
  // the next spoken reaction. A monotonically increasing version prevents a
  // reflection that started before the event from overwriting its provisional
  // states when it lands late.
  #pendingConsequence: string | null = null;
  #consequenceVersion = 0;
  #consequenceReflectionDue = false;
  // The in-flight reflection (null when idle) — held so headless callers can
  // await it between turns (see settleReflection).
  #reflection: Promise<void> | null = null;

  private constructor(scene: Scene, deps?: Partial<SceneDriverDeps>) {
    this.scene = scene;
    this.#deps = { ...defaultDeps, ...deps };
    this.#sceneState = createInitialSceneState(scene);
    // An injected dramaturg provider force-enables reflection (tests);
    // otherwise the env kill-switch decides.
    this.#dramaturgDisabled = this.#deps.dramaturgProvider ? false : !DRAMATURG_ENABLED;
  }

  /** Construct a driver directly from a Scene struct — the test/simulator
   *  entry point (no registry or DB resolution). */
  static fromScene(scene: Scene, deps?: Partial<SceneDriverDeps>): SceneDriver {
    return new SceneDriver(scene, deps);
  }

  /** Resolve a scene id — hardcoded registry first, then the DB graph→roster bridge. */
  static async load(sceneId: string, deps?: Partial<SceneDriverDeps>): Promise<SceneDriver | null> {
    const scene =
      getScene(sceneId) ??
      (await getSceneStore()
        .resolveOrchestratorScene(sceneId)
        .catch(() => null));
    return scene ? new SceneDriver(scene, deps) : null;
  }

  /** A character session IS a scene — load (auto-provisioning on first use) the
   *  character's canonical SOLO scene: a real scenesTable row with a one-character
   *  node, so scene-authored features (knowledgeHorizon, arc, audio nodes) apply to
   *  character sessions through the exact same resolve path as any scene. Falls back
   *  to the legacy synthetic scene if provisioning/resolution fails — a DB hiccup
   *  must degrade observability, never take voice down. */
  static async fromCharacter(
    character: CharacterRecord,
    deps?: Partial<SceneDriverDeps>,
  ): Promise<SceneDriver> {
    try {
      const record = await getSceneStore().getOrCreateSoloScene(character.id);
      const scene = record
        ? await getSceneStore().resolveOrchestratorScene(record.id)
        : null;
      if (scene) return new SceneDriver(scene, deps);
      console.warn(
        `[voice-agent] solo scene for "${character.slug}" did not resolve — falling back to synthetic scene`,
      );
    } catch (err) {
      console.warn(
        `[voice-agent] solo scene provisioning failed for "${character.slug}" — falling back to synthetic scene`,
        err,
      );
    }
    return SceneDriver.syntheticFromCharacter(character, deps);
  }

  /** LEGACY floor: synthesize a one-actor scene (`character-sandbox:<slug>`) with no
   *  scene record behind it. Only used when the solo scene can't be provisioned or
   *  resolved (DB unavailable, character deleted mid-flight). The character's voice +
   *  brain are resolved by runVoiceStream from the id at speak time, so the scene
   *  `voice` field here is only a non-empty placeholder. */
  static syntheticFromCharacter(
    character: CharacterRecord,
    deps?: Partial<SceneDriverDeps>,
  ): SceneDriver {
    const slug = character.slug;
    const blurb = (character.summary ?? character.title).slice(0, 280);
    // sm-sound: the character's sandbox soundscape — the sound nodes placed
    // on the character canvas, mapped to the full director roster (beds +
    // one-shots) exactly like scene-placed audio nodes. character-store
    // normalizes legacy single-bed rows into `sounds`, so one shape here.
    // Scene-placed sounds win in real scenes structurally — fromCharacter
    // is only used when there IS no scene.
    const sounds = soundDesignToSceneSounds(character.soundDesign);
    // isDefault lives on the character entries, not the mapped roster.
    const entries = normalizeSoundDesign(character.soundDesign)?.sounds ?? [];
    const defaultBed =
      entries.find((s) => s.role === "bed" && s.isDefault) ??
      entries.find((s) => s.role === "bed") ??
      null;
    const scene: Scene = {
      id: `character-sandbox:${slug}`,
      title: character.title,
      description: (character.summary ?? character.title).slice(0, 600),
      characters: [
        {
          characterSlug: slug,
          displayName: character.title,
          voice: character.voiceId ?? slug,
          blurb,
        },
      ],
      openingBeat: "The user has just arrived.",
      defaultAmbience: defaultBed?.slug ?? null,
      ...(sounds.length > 0 ? { sounds } : {}),
    };
    return new SceneDriver(scene, deps);
  }

  /** Seed the running transcript with an opening character line (e.g. the greet)
   *  that had no preceding user turn — so the next turn's history includes it,
   *  WITHOUT recording the director instruction that prompted it as a user turn. */
  recordOpening(reply: string): void {
    const solo = this.#presentRoster()[0];
    if (!solo || !reply) return;
    this.#recentTurns.push({ speakerSlug: solo, text: reply });
    this.#trim();
  }

  /** Wire a callback invoked with a fresh scene snapshot after every decision, so the
   *  caller can persist it (fire-and-forget). Optional — unset = in-memory only. */
  onState(cb: (snapshot: SceneSessionSnapshot) => void): void {
    this.#onState = cb;
  }

  /** Wire the scene journal sink: receives a typed entry for every director
   *  decision, chronicler reflection, and timed-event arming. The host
   *  persists them to scene_session_events (fire-and-forget). Optional —
   *  unset = the session leaves no journal. */
  onJournal(cb: SceneJournalSink): void {
    this.#journal = cb;
  }

  /** Wire the durable cost ledger sink. */
  onCost(cb: (entry: SessionCostEntry) => void): void {
    this.#cost = cb;
  }

  /** Wire a callback invoked with the decision's (roster-validated) sfx cues,
   *  fired BEFORE the speaker's turn so `at:"now"` cues truly precede the voice.
   *  Optional — unset = sfx decisions are ignored (e.g. non-LiveKit hosts). */
  onSfx(cb: (cues: SfxCue[]) => void): void {
    this.#onSfx = cb;
  }

  /** Wire the narration sink: awaited with the narrator's literal text when the
   *  director chooses `action:"narrate"`. The narrator turn is recorded in the
   *  running transcript either way, so the director keeps continuity — without
   *  a sink the line is silent (logged once). */
  onNarrate(
    cb: (text: string, meta: { userText?: string }) => Promise<void> | void,
    options?: { realtimePlayback?: boolean },
  ): void {
    this.#onNarrate = cb;
    this.#narrationHasRealtimePlayback = options?.realtimePlayback === true;
  }

  /** Voice + record a narrate decision. `userText` is the utterance that
   *  prompted it (absent on proactive/chained narration) — recorded with the
   *  turn so the input that caused an event isn't lost from the session. */
  async #narrate(text: string, userText?: string): Promise<boolean> {
    this.#recentTurns.push({ speakerSlug: "narrator", speakerName: "Narrator", text });
    this.#trim();
    if (!this.#onNarrate) {
      if (!this.#warnedUnvoicedNarration) {
        this.#warnedUnvoicedNarration = true;
        console.warn(
          "[voice-agent] narrate decision with no narration sink — recorded in transcript, not voiced",
        );
      }
      return false;
    }
    try {
      await this.#onNarrate(text, { userText });
      return true;
    } catch (err) {
      console.warn(`[voice-agent] narration failed: ${(err as Error).message}`);
      return false;
    }
  }

  /** Start narration without awaiting its real-time sink. The completion
   * timestamp is shared with a hidden reaction so listener-visible gap can be
   * measured without inferring playback duration from text. */
  #beginNarration(text: string, userText?: string): {
    startedAt: number;
    done: Promise<{ voiced: boolean; endedAt: number }>;
  } {
    const startedAt = Date.now();
    return {
      startedAt,
      done: this.#narrate(text, userText).then((voiced) => ({
        voiced,
        endedAt: Date.now(),
      })),
    };
  }

  /** Resolve a roster slug to its character record, cached for the driver's
   *  lifetime (the roster is fixed; misses are cached too). */
  async #resolveCharacter(slugOrId: string): Promise<CharacterRecord | null> {
    if (this.#characterCache.has(slugOrId)) {
      return this.#characterCache.get(slugOrId) ?? null;
    }
    const record = await this.#deps.resolveCharacter(slugOrId).catch(() => null);
    this.#characterCache.set(slugOrId, record);
    return record;
  }

  #emitSfx(cues: SfxCue[] | undefined): void {
    if (!this.#onSfx || !cues?.length) return;
    try {
      this.#onSfx(cues);
    } catch {
      // best-effort — audio must never disrupt the turn
    }
  }

  /**
   * Record a proactive tick the runtime chose NOT to take. Every one of these
   * paths used to return silently, which made a scene that repeatedly yielded
   * the floor look identical to one whose narrator never woke up.
   */
  #journalSuppression(
    reason: SceneProactiveSuppression,
    opts?: { decisionSpent?: boolean; beatsUsed?: number },
  ): void {
    if (!this.#journal) return;
    try {
      this.#journal(
        buildProactiveSuppressedJournalEntry({
          sceneId: this.scene.id,
          reason,
          decisionSpent: opts?.decisionSpent ?? false,
          ...(opts?.beatsUsed !== undefined ? { beatsUsed: opts.beatsUsed } : {}),
        }),
      );
    } catch {
      // best-effort — never let instrumentation break a turn
    }
  }

  #emitJournal(entries: ReturnType<typeof buildDecisionJournalEntries>): void {
    if (!this.#journal) return;
    for (const entry of entries) {
      try {
        this.#journal(entry);
      } catch {
        // best-effort — the journal must never disrupt the turn
      }
    }
  }

  /** Journal one resolved decision with its runtime context. Called after
   *  the resolution's state has been applied, alongside #persistState. */
  #journalDecision(
    resolution: ReturnType<typeof resolveSceneDecision>,
    extras: SceneDecisionJournalExtras & { decide?: DecideResult },
  ): void {
    if (!this.#journal) return;
    const { decide, ...rest } = extras;
    this.#emitJournal(
      buildDecisionJournalEntries(resolution, {
        ...rest,
        ...(decide?.latencyMs !== undefined ? { latencyMs: decide.latencyMs } : {}),
        ...(decide?.provider ? { provider: decide.provider } : {}),
        ...(decide?.model ? { model: decide.model } : {}),
        ...(decide?.failed ? { failure: decide.failed } : {}),
      }),
    );
  }

  /**
   * The dramaturg tick — fire-and-forget after a spoken turn lands. Every
   * DRAMATURG_EVERY turns (single-flight), review the scene with a strong
   * model OFF the hot path and write a short director's note into
   * SceneState; the fast director reads it on its next decision. Failures
   * warn only — the scene loop must never feel this.
   */
  #maybeReflect(countSpokenTurn = true): void {
    if (this.#dramaturgDisabled) return;
    // Count every completed spoken turn — even ones landing while a reflection
    // is in flight — so the DRAMATURG_EVERY cadence doesn't stretch under load.
    if (countSpokenTurn) {
      this.#spokenTurns += 1;
      if (this.#pendingConsequence) this.#consequenceReflectionDue = true;
    }
    if (this.#reflecting) return;
    if (!this.#consequenceReflectionDue && this.#spokenTurns % DRAMATURG_EVERY !== 0) return;

    let provider: ChatProvider;
    try {
      provider = this.#deps.dramaturgProvider ?? getChatProviderForModel(DRAMATURG_MODEL);
    } catch (err) {
      // No key / unknown model — disable for the session, warn once.
      this.#dramaturgDisabled = true;
      console.warn(
        `[dramaturg] disabled: ${(err as Error).message} (model=${DRAMATURG_MODEL})`,
      );
      return;
    }

    this.#reflecting = true;
    const startedAt = Date.now();
    // Chronicle at request-build time — the journal's before-image. Safe:
    // only reflections write the chronicle, and reflections are single-flight.
    const chronicleBefore = this.#chronicle;
    const spokenTurnsAtFire = this.#spokenTurns;
    const consequenceVersionAtFire = this.#consequenceVersion;
    const pendingConsequence = this.#pendingConsequence;
    if (pendingConsequence) this.#pendingConsequence = null;
    this.#consequenceReflectionDue = false;
    const request = buildDramaturgMessages({
      scene: this.scene,
      sceneState: this.#sceneState,
      recentTurns: this.#recentTurns,
      previousNote: this.#sceneState.directorNote,
      sceneFacts: this.#sceneFacts,
      chronicle: this.#chronicle,
      ...(pendingConsequence ? { pendingConsequence } : {}),
    });
    const costOperationId = `chronicle:${crypto.randomUUID()}`;
    this.#reflection = provider
      .complete({
        model: DRAMATURG_MODEL,
        system: [{ type: "text", text: request.system }],
        messages: [{ role: "user", content: request.user }],
        // Chronicle sections + note; the chronicle is the bulk of the reply.
        maxTokens: DRAMATURG_MAX_TOKENS,
        signal: AbortSignal.timeout(DRAMATURG_TIMEOUT_MS),
      })
      .then((response) => {
        this.#cost?.(
          buildLlmSessionCostEntry({
            operationId: costOperationId,
            category: "chronicle_llm",
            provider: provider.id,
            model: response.model,
            usage: response,
          }),
        );
        const { note, landed, facts, gone, states, chronicle } =
          parseDramaturgReflection(response.text);
        // Validate landed labels against the authored arc (tolerant match →
        // canonical label), then expand: the arc is ordered, so a later beat
        // landing implies every earlier beat landed too (the dramaturg often
        // marks only the beat that just happened).
        const arcLabels = (this.scene.arc ?? []).map((b) => b.label);
        const already = new Set(
          (this.#sceneState.arcLanded ?? []).map((l) => l.toLowerCase()),
        );
        const validated = landed
          .map((raw) => matchArcLabel(raw, arcLabels))
          .filter((l): l is string => !!l);
        const mergedLanded = expandLandedBeats(
          [...(this.#sceneState.arcLanded ?? []), ...validated],
          arcLabels,
        );
        const newlyLanded = mergedLanded.filter((l) => !already.has(l.toLowerCase()));
        // Durable facts: merge into the store (deduped, capped) and log the new ones.
        const mergedFacts = updateSceneFacts({
          previousFacts: this.#sceneFacts,
          newFacts: facts,
        });
        const factsChanged =
          mergedFacts.length !== this.#sceneFacts.length ||
          mergedFacts.some((f, i) => f !== this.#sceneFacts[i]);
        // GONE: the roster backstop. Only slugs on the authored roster that
        // are still marked present, and never the last one standing — a
        // scene with an empty stage cannot continue.
        const departed = gone
          .map((raw) => raw.trim().toLowerCase())
          .filter((slug) =>
            this.scene.characters.some((c) => c.characterSlug.toLowerCase() === slug),
          );
        const stillPresent = this.#sceneState.presentCharacterSlugs.filter(
          (slug) => !departed.includes(slug.toLowerCase()),
        );
        const presenceChanged =
          stillPresent.length > 0 &&
          stillPresent.length !== this.#sceneState.presentCharacterSlugs.length;
        // STATE is a restated channel: lines present in this reply replace the
        // prior map, and omitted lines deliberately drop settled characters.
        // If a newer consequence armed while this call was in flight, its
        // provisional state wins and this older reflection's STATE is stale.
        const statesAreCurrent = consequenceVersionAtFire === this.#consequenceVersion;
        const stateEligibleSlugs = new Set(
          (presenceChanged ? stillPresent : this.#sceneState.presentCharacterSlugs).map(
            (slug) => slug.toLowerCase(),
          ),
        );
        const canonicalSlug = new Map(
          this.scene.characters.map((character) => [
            character.characterSlug.toLowerCase(),
            character.characterSlug,
          ]),
        );
        const reflectedStates: Record<string, string> = {};
        if (statesAreCurrent) {
          for (const entry of states) {
            const slug = canonicalSlug.get(entry.slug.toLowerCase());
            if (slug && stateEligibleSlugs.has(slug.toLowerCase())) {
              reflectedStates[slug] = entry.state;
            }
          }
        }
        const previousStates = this.#sceneState.characterStates ?? {};
        const nextStates = statesAreCurrent ? reflectedStates : previousStates;
        const statesChanged = statesAreCurrent
          ? [...new Set([...Object.keys(previousStates), ...Object.keys(nextStates)])]
              .filter((slug) => previousStates[slug] !== nextStates[slug])
              .map((slug) => ({ slug, state: nextStates[slug] ?? null }))
          : [];
        const mergedChronicle = mergeChronicle(this.#chronicle, chronicle);
        const chronicleChanged =
          JSON.stringify(mergedChronicle) !== JSON.stringify(this.#chronicle);
        // Journal the reflection — computed BEFORE the stores mutate so the
        // added-facts diff is against the pre-reflection store. Emitted on
        // the no-op path too: a reflection that changed nothing is signal.
        const factsAdded = mergedFacts.filter((f) => !this.#sceneFacts.includes(f));
        const journalReflection = () => {
          if (!this.#journal) return;
          try {
            this.#journal(
              buildReflectionJournalEntry({
                sceneId: this.scene.id,
                model: DRAMATURG_MODEL,
                latencyMs: Date.now() - startedAt,
                raw: response.text,
                note,
                factsAdded,
                landedAdded: newlyLanded,
                gone: departed,
                statesChanged,
                chronicleBefore,
                chronicleAfter: chronicleChanged ? mergedChronicle : chronicleBefore,
                spokenTurns: spokenTurnsAtFire,
              }),
            );
          } catch {
            // best-effort — the journal must never disrupt the reflection
          }
        };
        if (
          !note &&
          newlyLanded.length === 0 &&
          !factsChanged &&
          !presenceChanged &&
          statesChanged.length === 0 &&
          !chronicleChanged
        ) {
          journalReflection();
          return;
        }
        if (chronicleChanged && mergedChronicle) {
          this.#chronicle = mergedChronicle;
          if (mergedChronicle.story) {
            console.log(`[chronicler] story: ${mergedChronicle.story}`);
          }
          for (const i of mergedChronicle.intents) {
            console.log(`[chronicler] intent: when ${i.trigger}: ${i.direction}`);
          }
          this.#armTimedEvents(mergedChronicle, Date.now());
        }

        if (factsChanged) {
          for (const fact of mergedFacts.filter((f) => !this.#sceneFacts.includes(f))) {
            console.log(`[dramaturg] fact: ${fact}`);
          }
          this.#sceneFacts = mergedFacts;
        }
        for (const label of newlyLanded) {
          console.log(`[dramaturg] beat landed: ${label}`);
        }
        // Race-safe: decisions may have advanced #sceneState while we
        // reflected — we only write our own fields, onto whatever the
        // CURRENT state is.
        if (presenceChanged) {
          for (const slug of this.#sceneState.presentCharacterSlugs.filter(
            (p) => !stillPresent.includes(p),
          )) {
            console.log(`[dramaturg] no longer in the scene: ${slug}`);
          }
        }
        const nextSceneState: SceneState = {
          ...this.#sceneState,
          ...(note ? { directorNote: note } : {}),
          ...(mergedLanded.length ? { arcLanded: mergedLanded } : {}),
          ...(presenceChanged
            ? {
                presentCharacterSlugs: stillPresent,
                // Don't leave continuity pointing at someone who is gone.
                ...(this.#sceneState.lastSpeakerSlug &&
                !stillPresent.includes(this.#sceneState.lastSpeakerSlug)
                  ? { lastSpeakerSlug: null }
                  : {}),
              }
            : {}),
        };
        if (statesAreCurrent) {
          if (Object.keys(nextStates).length) nextSceneState.characterStates = nextStates;
          else delete nextSceneState.characterStates;
        }
        this.#sceneState = nextSceneState;
        this.#persistState();
        journalReflection();
        if (note) {
          console.log(`[dramaturg] note (${Date.now() - startedAt}ms): ${note}`);
        }
      })
      .catch((err) => {
        this.#cost?.(
          buildLlmSessionCostEntry({
            operationId: costOperationId,
            category: "chronicle_llm",
            provider: provider.id,
            model: DRAMATURG_MODEL,
            status: "failed",
            usage: {},
            usageKnown: false,
            note: (err as Error).message,
          }),
        );
        console.warn(`[dramaturg] reflection failed: ${(err as Error).message}`);
        if (this.#journal) {
          try {
            this.#journal(
              buildReflectionJournalEntry({
                sceneId: this.scene.id,
                model: DRAMATURG_MODEL,
                latencyMs: Date.now() - startedAt,
                note: null,
                factsAdded: [],
                landedAdded: [],
                gone: [],
                statesChanged: [],
                chronicleBefore,
                chronicleAfter: chronicleBefore,
                spokenTurns: spokenTurnsAtFire,
                error: (err as Error).message,
              }),
            );
          } catch {
            // best-effort
          }
        }
      })
      .finally(() => {
        this.#reflecting = false;
        this.#reflection = null;
        // A consequence reaction may have landed while an older reflection
        // was in flight. Start the queued off-cadence review now; no further
        // spoken turn should be required to metabolize the loss.
        if (this.#consequenceReflectionDue) {
          queueMicrotask(() => this.#maybeReflect(false));
        }
      });
  }

  /**
   * Await the in-flight dramaturg reflection, if any. Headless callers (the
   * scene simulator) use this between turns so notes and arc landings
   * deterministically influence the NEXT decision. Live voice never calls
   * it — real turns are slow enough that reflections land naturally.
   */
  async settleReflection(): Promise<void> {
    // A consequence can queue a forced reflection behind an older in-flight
    // cadence reflection. Drain both so simulators/tests observe the same
    // settled state a live session reaches naturally.
    while (this.#reflection) await this.#reflection;
  }

  /** Invalidate every active drive/cascade and cancel speculative director
   *  work. Used by the host when the visitor leaves the LiveKit room. */
  cancelActiveWork(): void {
    this.#epoch += 1;
    this.#speculation?.abort.abort();
    this.#speculation = null;
    this.#speculationStartedForTurn = false;
  }

  /** Scene-authored proactive cadence. The host's explicit env override still
   * wins; this is the default when no override is configured. */
  pacing(): { idleMs: number } {
    return { idleMs: initiativeMode(this.scene) === "narrator" ? 2_000 : 3_500 };
  }

  #persistState(): void {
    if (!this.#onState) return;
    try {
      this.#onState(
        buildSceneSessionSnapshot(this.#sceneState, {
          sceneMemory: this.#sceneMemory,
          sceneFacts: this.#sceneFacts,
          chronicle: this.#chronicle,
        }),
      );
    } catch {
      // best-effort — persistence must never disrupt the turn
    }
  }

  /**
   * B4: speculatively orchestrate off a partial transcript DURING the endpoint hold,
   * so the decision (speaker + director `beat`) is usually ready when the turn
   * completes. Fire-and-forget — drive() decides whether to accept it. Solo scenes
   * speculate too (to fetch a latency-hidden director cue) unless the solo cue is
   * disabled; no-op for a partial we're already speculating on.
   */
  speculate(partialText: string): void {
    const text = partialText.trim();
    if (text.length < MIN_SPECULATE_CHARS) return;
    if (text.split(/\s+/).filter(Boolean).length < MIN_SPECULATE_WORDS) return;
    if (!SOLO_CUE_ENABLED && this.#presentRoster().length <= 1) return;
    if (this.#speculationStartedForTurn) return;
    if (this.#speculation?.basedOnText === text) return;
    this.#speculationStartedForTurn = true;
    const abort = new AbortController();
    this.#speculation = {
      basedOnText: text,
      abort,
      promise: this.#decide(text, "speculate", abort.signal),
    };
  }

  /** One finished user turn → orchestrate → voice the chosen character (if any).
   *  `signal` (optional) is the turn's abort — once it fires, or a newer turn
   *  starts (epoch bump), this drive stops mutating driver state. */
  async drive(
    userText: string,
    speak: SceneSpeakFn,
    opts?: { signal?: AbortSignal },
  ): Promise<SceneDriveOutcome> {
    const epoch = ++this.#epoch;
    const superseded = () => epoch !== this.#epoch || opts?.signal?.aborted === true;
    const spec = this.#speculation;
    this.#speculation = null;
    this.#speculationStartedForTurn = false;

    this.#recentTurns.push({ speakerSlug: "user", text: userText });
    this.#trim();
    this.#sceneMemory = updateSceneMemory({
      previousMemory: this.#sceneMemory,
      recentTurns: this.#recentTurns,
    });

    // Use the speculation if it was computed off ~the same intent as the final turn;
    // its orchestrate ran under the hold, so the await is usually instant (the gap is
    // hidden). Otherwise pay the orchestrate on the final transcript.
    let rawDecision: OrchestratorDecision | null = null;
    let decideFailed: string | undefined;
    let decideResult: DecideResult | null = null;
    let speculation: NonNullable<SceneDecisionJournalExtras["speculation"]> = {
      outcome: "none",
    };
    if (spec && this.#acceptsSpeculation(spec.basedOnText, userText)) {
      const waitedAt = Date.now();
      const result = await spec.promise;
      if (!result.failed) {
        rawDecision = result.decision;
        decideResult = result;
        speculation = {
          outcome: "hit",
          basedOnText: spec.basedOnText,
          waitedMs: Date.now() - waitedAt,
        };
        console.log(
          `[voice-agent] speculative HIT (waited ${speculation.waitedMs}ms) → ${rawDecision.action} ${rawDecision.speakerId ?? ""}`.trimEnd(),
        );
      } else {
        console.log(
          `[voice-agent] speculative decision failed (${result.failed}) — orchestrating on final transcript`,
        );
      }
    } else if (spec) {
      spec.abort.abort(); // cancel the stale in-flight speculation
      speculation = { outcome: "miss", basedOnText: spec.basedOnText };
      console.log("[voice-agent] speculative MISS — orchestrating on final transcript");
    }
    if (!rawDecision) {
      const result = await this.#decide(userText);
      rawDecision = result.decision;
      decideFailed = result.failed;
      decideResult = result;
    }
    // A newer turn owns the scene now — applying this decision would clobber
    // its state (double turnIndex bump, stale beat) and interleave transcripts.
    if (superseded()) {
      console.log("[voice-agent] scene: turn superseded before decision applied");
      return { action: rawDecision.action, spoke: false, superseded: true };
    }
    let resolution = resolveSceneDecision(
      { scene: this.scene, sceneState: this.#sceneState },
      rawDecision,
    );
    // RECOVERY: the user just said something — a decision lost to an executor
    // failure or an invalid shape must not resolve to silence. Let the
    // character they were talking with (or the first present) answer plainly.
    let recovered: SceneDecisionJournalExtras["recovered"];
    if (
      (decideFailed || resolution.degraded) &&
      resolution.decision.action === "wait-for-user"
    ) {
      const fallback = this.#fallbackSpeaker();
      if (fallback) {
        console.warn(
          `[voice-agent] scene: decision degraded (${decideFailed ?? resolution.reason ?? "unknown"}) — recovering with speak:${fallback}`,
        );
        resolution = resolveSceneDecision(
          { scene: this.scene, sceneState: this.#sceneState },
          { action: "speak", speakerId: fallback },
        );
        recovered = "fallback-speaker";
      }
    }
    // Director powers gate only narrator-addressed third-person/world fiat.
    // The visitor's own first-person embodied actions remain real even when
    // this toggle is off. Deny on the message's FORM, not only the model's
    // narrationKind tag — the classifier was observed tagging a declaration
    // as "answer" (perception verbs), which let fiat through this gate.
    if (
      !userDirectorEnabled(this.scene) &&
      resolution.decision.action === "narrate" &&
      isNarratorAddressed(userText) &&
      !declaresUserAction(userText) &&
      (resolution.decision.narrationKind === "event" ||
        isNarratorEventDeclaration(userText))
    ) {
      const fallback = this.#fallbackSpeaker();
      if (fallback) {
        console.log(
          `[voice-agent] scene: narrator-addressed event denied — ${fallback} responds in character`,
        );
        resolution = resolveSceneDecision(
          { scene: this.scene, sceneState: this.#sceneState },
          { action: "speak", speakerId: fallback },
        );
        recovered = "director-denied";
      }
    }
    const armed = this.#armConsequenceProtocol(resolution);
    resolution = armed.resolution;
    const consequence = armed.consequence;
    this.#sceneState = resolution.sceneState;
    this.#persistState();
    this.#journalDecision(resolution, {
      trigger: "user-turn",
      userText,
      speculation,
      ...(recovered ? { recovered } : {}),
      decide: decideResult ?? undefined,
    });
    this.#emitSfx(resolution.decision.sfx);

    if (resolution.decision.action === "narrate" && resolution.decision.narration?.trim()) {
      // Prefer the director's semantic classification, but a narrator-
      // addressed DECLARATION chains regardless of the tag — the classifier
      // was observed tagging "Narrator, Abraham sees a vision…" as "answer"
      // (perception verbs), recreating the dead-air failure the chain exists
      // to prevent. Older/degraded model output has no narrationKind, so the
      // previous text heuristic remains the null fallback.
      const narrationKind = resolution.decision.narrationKind;
      const shouldChain =
        narrationKind === "event" ||
        isNarratorEventDeclaration(userText) ||
        (narrationKind == null &&
          !(isNarratorAddressed(userText) && !declaresUserAction(userText)));
      const playback = this.#beginNarration(resolution.decision.narration.trim(), userText);
      // Only a host that explicitly promises real-time playback has useful
      // work to hide. Text-only hosts retain the legacy await-then-chain order.
      if ((shouldChain || consequence) && this.#narrationHasRealtimePlayback) {
        const chained = await this.#chainNarratedEvent(
          speak,
          superseded,
          playback,
          consequence ?? undefined,
        );
        const { voiced } = await playback.done;
        return { ...chained, spoke: voiced || chained.spoke };
      }
      const { voiced } = await playback.done;
      if (superseded()) return { action: "narrate", spoke: voiced, superseded: true };
      if (!shouldChain && !consequence) {
        if (resolution.decision.momentum === true) {
          const cascade = await this.#momentumCascade(1, speak, superseded);
          return { action: "narrate", spoke: voiced || cascade.spoke };
        }
        return { action: "narrate", spoke: voiced };
      }
      const chained = await this.#chainNarratedEvent(
        speak,
        superseded,
        undefined,
        consequence ?? undefined,
      );
      return { ...chained, spoke: voiced || chained.spoke };
    }

    if (resolution.decision.action !== "speak" || !resolution.speakerSlug) {
      console.log(`[voice-agent] scene: ${resolution.decision.action} (no speaker)`);
      return { action: resolution.decision.action, spoke: false };
    }

    const spoke = await this.#speakTurn(
      resolution,
      speak,
      superseded,
      consequence ? { deferReflection: true } : undefined,
    );
    if (spoke === "superseded") return { action: "speak", spoke: false, superseded: true };
    if (consequence) {
      const chained = await this.#chainNarratedEvent(speak, superseded, undefined, consequence);
      return { ...chained, spoke: spoke || chained.spoke };
    }
    if (resolution.decision.momentum === true) {
      const cascade = await this.#momentumCascade(0, speak, superseded);
      return { action: "speak", spoke: spoke || cascade.spoke };
    }
    return { action: "speak", spoke };
  }

  /** Voice one resolved speak decision: resolve the character, build the turn
   *  request, run `speak`, and record the reply. Shared by the reactive path
   *  and the narrate→react chain. Returns whether a (non-empty) reply landed,
   *  or "superseded" when a newer turn took the scene mid-speak. */
  async #speakTurn(
    resolution: ReturnType<typeof resolveSceneDecision>,
    speak: SceneSpeakFn,
    superseded: () => boolean,
    options?: {
      sceneState?: SceneState;
      audioGate?: SceneSpeakInput["audioGate"];
      reactionModel?: string | null;
      deferReflection?: boolean;
    },
  ): Promise<boolean | "superseded"> {
    const generated = await this.#generateSpeakTurn(resolution, speak, options);
    if (!generated) return false;
    if (superseded()) return "superseded";
    this.#recordGeneratedTurn(generated, options?.deferReflection !== true);
    return Boolean(generated.replyText);
  }

  /** Build and generate one character turn without mutating transcript/state.
   * Pipelined reactions use this separation to keep speculative work private
   * until narration has ended and the epoch has been rechecked. */
  async #generateSpeakTurn(
    resolution: ReturnType<typeof resolveSceneDecision>,
    speak: SceneSpeakFn,
    options?: {
      sceneState?: SceneState;
      audioGate?: SceneSpeakInput["audioGate"];
      reactionModel?: string | null;
    },
  ): Promise<{
    replyText: string;
    speakerSlug: string;
    displayName: string;
  } | null> {
    if (!resolution.speakerSlug) return null;
    const character = await this.#resolveCharacter(resolution.speakerSlug);
    if (!character) {
      console.warn(
        `[voice-agent] scene: speaker "${resolution.speakerSlug}" did not resolve — skipping turn`,
      );
      return null;
    }

    const turn = buildSpeakerTurnRequest({
      scene: this.scene,
      sceneState: options?.sceneState ?? this.#sceneState,
      decision: resolution.decision,
      recentTurns: this.#recentTurns,
    });
    if (!turn) return null;

    const speakerCharacter = this.scene.characters.find(
      (c) => c.characterSlug === resolution.speakerSlug,
    );
    const displayName =
      speakerCharacter?.displayName ?? character.title ?? resolution.speakerSlug;

    console.log(`[voice-agent] scene: ${resolution.speakerSlug} speaks`);
    // Sandbox solo with no director direction → don't inject a stale "Direction: …"
    // line (preserves the pre-unification single-char floor, which sent no
    // promptChunk). Applies to the character's solo scene (scene.solo) and the
    // legacy synthetic fallback alike. Once the orchestrator supplies a per-turn
    // `beat`/`sceneCue`/`delivery`, it flows through to the character unchanged.
    const sandboxNoCue =
      (this.scene.solo === true || this.scene.id.startsWith("character-sandbox:")) &&
      !resolution.decision.beat &&
      !resolution.decision.sceneCue &&
      !resolution.decision.delivery;
    const replyText = await speak(
      {
        characterId: character.id,
        message: turn.message,
        history: turn.history,
        promptChunk: sandboxNoCue ? undefined : turn.promptChunk,
        speaker: { slug: resolution.speakerSlug, name: displayName },
        currentMoment: speakerCharacter?.knowledgeHorizon,
        sceneFeatures: {
          ...this.#featureStatus(),
          ...(options?.reactionModel
            ? { reactionModel: `active — ${options.reactionModel}` }
            : {}),
        },
        ...(options?.reactionModel ? { model: options.reactionModel } : {}),
        ...(options?.audioGate ? { audioGate: options.audioGate } : {}),
      },
      `s${Date.now()}`,
    );
    return { replyText, speakerSlug: resolution.speakerSlug, displayName };
  }

  #recordGeneratedTurn(generated: {
    replyText: string;
    speakerSlug: string;
    displayName: string;
  }, reflect = true): void {
    if (!generated.replyText) return;
    this.#recentTurns.push({
      speakerSlug: generated.speakerSlug,
      speakerName: generated.displayName,
      text: generated.replyText,
    });
    this.#trim();
    if (reflect) this.#maybeReflect();
  }

  /** Give one narrated event an immediate director-chosen reaction. Shared by
   *  user turns and due world events; deliberately never chains a second time. */
  async #chainNarratedEvent(
    speak: SceneSpeakFn,
    superseded: () => boolean,
    playback?: {
      startedAt: number;
      done: Promise<{ voiced: boolean; endedAt: number }>;
      worldEventDirective?: string;
    },
    consequence?: ConsequenceContext,
  ): Promise<SceneDriveOutcome> {
    const chain = await this.#decide(NARRATED_EVENT_MARKER, "chain");
    if (superseded()) return { action: "narrate", spoke: false, superseded: true };

    // A speculative director failure is never allowed to turn the playback
    // window into dead air. Let narration finish, then retry the exact legacy
    // sequential chain once. No failed speculative decision is journaled.
    if (playback && chain.failed) {
      await playback.done;
      if (superseded()) return { action: "narrate", spoke: false, superseded: true };
      console.warn(
        `[voice-agent] pipelined chain failed (${chain.failed}) — retrying sequentially`,
      );
      return this.#chainNarratedEvent(speak, superseded, undefined, consequence);
    }

    // A hold after an event is dead air. Guarantee a present reactor when one
    // exists, matching the user-turn recovery behavior.
    let chainDecision = chain.decision;
    let chainRecovered: SceneDecisionJournalExtras["recovered"];
    if (consequence) {
      const forced = this.#forceConsequenceDecision(chainDecision, consequence);
      chainDecision = forced.decision;
      chainRecovered = forced.recovered;
    } else if (chainDecision.action === "wait-for-user") {
      const reactor = this.#fallbackSpeaker();
      if (reactor) {
        console.log(
          `[voice-agent] scene: chain returned wait after an event — ${reactor} reacts instead`,
        );
        chainDecision = { action: "speak", speakerId: reactor };
        chainRecovered = "chain-reactor";
      }
    }
    const chainResolution = resolveSceneDecision(
      { scene: this.scene, sceneState: this.#sceneState },
      chainDecision,
    );

    if (
      playback &&
      chainResolution.decision.action === "speak" &&
      chainResolution.speakerSlug
    ) {
      const spoke = await this.#pipelinedSpeakTurn({
        resolution: chainResolution,
        decide: chain,
        recovered: chainRecovered,
        speak,
        superseded,
        playback,
        trigger: "chain",
        worldEventDirective: playback.worldEventDirective,
      });
      if (spoke === "superseded") {
        return { action: "speak", spoke: false, superseded: true };
      }
      if (consequence || chainResolution.decision.momentum === true) {
        const cascade = await this.#momentumCascade(1, speak, superseded);
        return { action: "speak", spoke: spoke || cascade.spoke };
      }
      return { action: "speak", spoke };
    }

    // The chain decision can itself narrate/end/hold. It cannot be generated
    // under the first narration, so preserve ordering by applying it only
    // after that playback completes.
    if (playback) {
      await playback.done;
      if (superseded()) return { action: "narrate", spoke: false, superseded: true };
    }
    this.#sceneState = chainResolution.sceneState;
    this.#persistState();
    this.#journalDecision(chainResolution, {
      trigger: "chain",
      cascadeDepth: 1,
      ...(chainRecovered ? { recovered: chainRecovered } : {}),
      decide: chain,
    });
    this.#emitSfx(chainResolution.decision.sfx);

    if (
      chainResolution.decision.action === "narrate" &&
      chainResolution.decision.narration?.trim()
    ) {
      const voiced = await this.#narrate(chainResolution.decision.narration.trim());
      if (superseded()) return { action: "narrate", spoke: voiced, superseded: true };
      if (consequence || chainResolution.decision.momentum === true) {
        const cascade = await this.#momentumCascade(1, speak, superseded);
        return { action: "narrate", spoke: voiced || cascade.spoke };
      }
      return { action: "narrate", spoke: voiced };
    }
    if (chainResolution.decision.action === "speak" && chainResolution.speakerSlug) {
      const spoke = await this.#speakTurn(chainResolution, speak, superseded);
      if (spoke === "superseded") {
        return { action: "speak", spoke: false, superseded: true };
      }
      if (consequence || chainResolution.decision.momentum === true) {
        const cascade = await this.#momentumCascade(1, speak, superseded);
        return { action: "speak", spoke: spoke || cascade.spoke };
      }
      return { action: "speak", spoke };
    }
    console.log(`[voice-agent] scene: narrate chain → ${chainResolution.decision.action}`);
    return { action: chainResolution.decision.action, spoke: false };
  }

  /** Generate + synthesize a resolved character turn while narration plays,
   * then atomically accept it and open its audio gate. The production sink
   * buffers PCM; simple/text-only fakes may ignore the gate and resolve, which
   * keeps tests and non-audio hosts sequential. */
  async #pipelinedSpeakTurn(args: {
    resolution: ReturnType<typeof resolveSceneDecision>;
    decide: DecideResult;
    recovered?: SceneDecisionJournalExtras["recovered"];
    speak: SceneSpeakFn;
    superseded: () => boolean;
    playback: {
      startedAt: number;
      done: Promise<{ voiced: boolean; endedAt: number }>;
    };
    trigger: "chain" | "scene-open";
    worldEventDirective?: string;
    deferReflection?: boolean;
  }): Promise<boolean | "superseded"> {
    let openGate!: () => void;
    const waitUntilOpen = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    let markReady!: () => void;
    let readyAt = 0;
    const ready = new Promise<void>((resolve) => {
      markReady = () => {
        if (readyAt) return;
        readyAt = Date.now();
        resolve();
      };
    });
    let markAudioStart!: () => void;
    let audioStartedAt = 0;
    const audioStarted = new Promise<void>((resolve) => {
      markAudioStart = () => {
        if (audioStartedAt) return;
        audioStartedAt = Date.now();
        resolve();
      };
    });
    const reactionModel = this.#deps.reactionModel ?? null;
    const generatedPromise = this.#generateSpeakTurn(args.resolution, args.speak, {
      sceneState: args.resolution.sceneState,
      reactionModel,
      audioGate: { waitUntilOpen, onReady: markReady, onAudioStart: markAudioStart },
    });
    // Text fakes and legacy sinks do not know about the gate. Treat their
    // completion as readiness so the driver never deadlocks.
    void generatedPromise.then(markReady, markReady);

    const [playbackResult] = await Promise.all([args.playback.done, ready]);
    if (args.superseded()) {
      openGate();
      await generatedPromise.catch(() => null);
      return "superseded";
    }

    // Commit decision state before audio can leave the buffer. This is the
    // acceptance point: before it, barge-in discards every speculative effect.
    const committedResolution = this.#preserveConcurrentCharacterStates(args.resolution);
    this.#sceneState = committedResolution.sceneState;
    this.#persistState();
    this.#emitSfx(args.resolution.decision.sfx);
    openGate();

    const generated = await generatedPromise.catch((err) => {
      console.warn(`[voice-agent] pipelined reaction failed: ${(err as Error).message}`);
      return null;
    });
    // A no-audio/legacy sink never fires onAudioStart; its completion is the
    // closest observable publication point.
    if (!audioStartedAt) markAudioStart();
    await audioStarted;

    this.#journalDecision(committedResolution, {
      trigger: args.trigger,
      ...(args.trigger === "chain" ? { cascadeDepth: 1 } : {}),
      ...(args.recovered ? { recovered: args.recovered } : {}),
      ...(args.worldEventDirective
        ? { worldEventDirective: args.worldEventDirective }
        : {}),
      narrationAudioMs: Math.max(0, playbackResult.endedAt - args.playback.startedAt),
      reactionReadyMs: Math.max(0, readyAt - args.playback.startedAt),
      gapMs: Math.max(0, audioStartedAt - playbackResult.endedAt),
      decide: args.decide,
    });

    if (args.superseded()) return "superseded";
    if (generated) this.#recordGeneratedTurn(generated, args.deferReflection !== true);
    return Boolean(generated?.replyText);
  }

  /**
   * The scene's opening narration, or null when it opens in silence.
   *
   * `authored` plays the authored line(s) — one of the variants per session,
   * so repeat visits aren't word-identical. `generated` has the narrator
   * write it fresh from the scene's premise (fenced so it can't spend an arc
   * beat), falling back to the authored line if the model is unavailable or
   * returns nothing usable — an opening should degrade, never break the
   * session. Resolved once at session open, off the turn hot path.
   */
  async resolveOpening(): Promise<string | null> {
    const mode = openingMode(this.scene);
    if (mode === "off") return null;
    const authored = selectAuthoredOpening(this.scene, Math.random());
    if (mode === "authored") return authored;

    let provider: ChatProvider;
    try {
      provider = this.#deps.dramaturgProvider ?? getChatProviderForModel(DRAMATURG_MODEL);
    } catch (err) {
      console.warn(
        `[voice-agent] generated opening unavailable (${(err as Error).message}) — using authored`,
      );
      return authored;
    }

    const request = buildOpeningNarrationMessages(this.scene);
    const costOperationId = `opening:${crypto.randomUUID()}`;
    try {
      const response = await provider.complete({
        model: DRAMATURG_MODEL,
        system: [{ type: "text", text: request.system }],
        messages: [{ role: "user", content: request.user }],
        maxTokens: 250,
        signal: AbortSignal.timeout(OPENING_TIMEOUT_MS),
      });
      this.#cost?.(
        buildLlmSessionCostEntry({
          operationId: costOperationId,
          category: "opening_llm",
          provider: provider.id,
          model: response.model,
          usage: response,
        }),
      );
      const text = sanitizeOpeningNarration(response.text);
      if (text) return text;
      console.warn("[voice-agent] generated opening was empty — using authored");
    } catch (err) {
      this.#cost?.(
        buildLlmSessionCostEntry({
          operationId: costOperationId,
          category: "opening_llm",
          provider: provider.id,
          model: DRAMATURG_MODEL,
          status: "failed",
          usage: {},
          usageKnown: false,
          note: (err as Error).message,
        }),
      );
      console.warn(
        `[voice-agent] generated opening failed (${(err as Error).message}) — using authored`,
      );
    }
    // FAIL LOUDLY: with no authored fallback the scene would open in silence,
    // indistinguishable from `openingMode: "off"` — the author asked for an
    // opening and got nothing, with nothing in the logs saying why (observed
    // live: a `generated` scene opened straight onto a character turn).
    if (!authored) {
      console.error(
        `[voice-agent] scene "${this.scene.id}": openingMode="generated" produced nothing and the scene has no authored opening to fall back on — opening in SILENCE. Set an opening narration as a fallback, or switch the mode to "off" if silence is intended.`,
      );
    }
    return authored;
  }

  /** Seed a character line into the running transcript without driving a
   *  turn — for callers that voiced a line themselves (a greet) and for
   *  tests that need a scene mid-flight. */
  recordTurn(speakerSlug: string, text: string, speakerName?: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const display =
      speakerName ??
      this.scene.characters.find((c) => c.characterSlug === speakerSlug)?.displayName;
    this.#recentTurns.push({
      speakerSlug,
      ...(display ? { speakerName: display } : {}),
      text: trimmed,
    });
    this.#trim();
  }

  /** Record an externally voiced narration (the authored opening) into the
   *  running transcript so the director and the characters know it was said. */
  recordNarration(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.#recentTurns.push({ speakerSlug: "narrator", speakerName: "Narrator", text: trimmed });
    this.#trim();
  }

  /**
   * Proactive director turn — fired with NO user utterance (a silence tick). The
   * director decides whether the scene advances (a character follows up / re-engages
   * / presses) or holds (`wait-for-user`). Latency is invisible — nobody is waiting.
   * The silence is NOT recorded as a user turn. Returns true iff a character spoke.
   */
  async driveProactive(
    speak: SceneSpeakFn,
    opts?: {
      signal?: AbortSignal;
      /** Opening narration already being played by the host. Only used for
       * the pre-user SCENE_OPEN turn; ordinary proactive turns stay eager. */
      openingPlayback?: {
        startedAt: number;
        done: Promise<{ voiced: boolean; endedAt: number }>;
      };
    },
  ): Promise<boolean> {
    const epoch = ++this.#epoch;
    const superseded = () => epoch !== this.#epoch || opts?.signal?.aborted === true;
    // Refusal echo guard: if the last spoken line was assistant boilerplate
    // that slipped past the pipeline's re-roll, a proactive turn tends to
    // parrot it verbatim (the model anchors on its own last line). Hold for
    // the user instead of doubling the persona break.
    const lastTurn = this.#recentTurns[this.#recentTurns.length - 1];
    if (lastTurn && lastTurn.speakerSlug !== "user" && isRefusalBoilerplate(lastTurn.text)) {
      console.log("[voice-agent] proactive: hold (last reply was refusal boilerplate)");
      this.#journalSuppression("refusal-echo");
      return false;
    }
    // A due TIMED world event upgrades this tick from "maybe fill the
    // silence" to "the world acts now": the director is told the event's
    // time has come and must render it. Consumed here; restored if a newer
    // turn supersedes us before the decision applies.
    const worldEvent = this.#consumeDueWorldEvent(Date.now());
    // Before the visitor's first word, a proactive tick is the scene's FIRST
    // MOVE (a character receives them), not a silence-filler — the generic
    // silence framing reads the opening narration as "already put something
    // to the user" and holds (observed live: three sessions, no greeting).
    const hasUserTurn = this.#recentTurns.some((t) => t.speakerSlug === "user");
    const marker = hasUserTurn ? PROACTIVE_SILENCE_MARKER : SCENE_OPEN_MARKER;
    // Proactive failures stay a hold — nobody is waiting, so silence is the
    // correct degraded behavior (unlike the reactive path's recovery).
    const decideResult = await this.#decide(marker, "proactive", undefined, {
      worldEventDirective: worldEvent?.direction,
    });
    const { decision } = decideResult;
    const trigger: SceneDecisionJournalExtras["trigger"] = worldEvent
      ? "world-event"
      : hasUserTurn
        ? "proactive"
        : "scene-open";
    // The user started talking (or a new turn began) while we deliberated —
    // the floor is theirs; don't apply the proactive decision. A consumed
    // world event is restored: its moment will come again on a later lull.
    if (superseded()) {
      if (worldEvent) worldEvent.fired = false;
      console.log("[voice-agent] proactive: superseded before decision applied");
      this.#journalSuppression("superseded", { decisionSpent: true });
      return false;
    }
    let resolution = resolveSceneDecision(
      { scene: this.scene, sceneState: this.#sceneState },
      decision,
    );
    // UNANSWERED EVENT: the narrator rendered something (a seizure, a blow)
    // and a present character still hasn't responded to it. Holding here is
    // the failure observed live — Sarah was seized, answered for herself, and
    // Abraham simply never moved across the rest of the scene. Give the
    // silent witness the turn instead of going quiet.
    if (resolution.decision.action === "wait-for-user" && worldEvent) {
      // The event is already happening — a hold here would silently drop it.
      // Narrate the direction itself: chronicler directions read as stage
      // prose ("a log collapses in sparks"), which is exactly narration.
      console.log(`[voice-agent] proactive: world event narrated directly - ${worldEvent.direction}`);
      this.#journalDecision(resolution, {
        trigger,
        worldEventDirective: worldEvent.direction,
        recovered: "world-event-narrated",
        decide: decideResult,
      });
      const playback = {
        ...this.#beginNarration(worldEvent.direction),
        worldEventDirective: worldEvent.direction,
      };
      const chained = this.#narrationHasRealtimePlayback
        ? await this.#chainNarratedEvent(speak, superseded, playback)
        : await (async () => {
            await playback.done;
            if (superseded()) {
              return { action: "narrate", spoke: false, superseded: true } as SceneDriveOutcome;
            }
            return this.#chainNarratedEvent(speak, superseded);
          })();
      const { voiced } = await playback.done;
      return voiced || chained.spoke;
    }
    let recovered: SceneDecisionJournalExtras["recovered"];
    if (resolution.decision.action === "wait-for-user") {
      const witness = this.#silentWitnessToEvent();
      if (witness) {
        console.log(
          `[voice-agent] proactive: unanswered event — ${witness} responds instead of holding`,
        );
        resolution = resolveSceneDecision(
          { scene: this.scene, sceneState: this.#sceneState },
          { action: "speak", speakerId: witness },
        );
        recovered = "silent-witness";
      }
    }
    const armed = this.#armConsequenceProtocol(resolution);
    resolution = armed.resolution;
    const consequence = armed.consequence;

    if (
      !hasUserTurn &&
      opts?.openingPlayback &&
      resolution.decision.action === "speak" &&
      resolution.speakerSlug
    ) {
      const spoke = await this.#pipelinedSpeakTurn({
        resolution,
        decide: decideResult,
        recovered,
        speak,
        superseded,
        playback: opts.openingPlayback,
        trigger: "scene-open",
        deferReflection: Boolean(consequence),
      });
      if (spoke === "superseded") return false;
      if (consequence) {
        const chained = await this.#chainNarratedEvent(speak, superseded, undefined, consequence);
        return spoke || chained.spoke;
      }
      if (resolution.decision.momentum === true) {
        const cascade = await this.#momentumCascade(1, speak, superseded);
        return spoke || cascade.spoke;
      }
      return spoke;
    }
    if (!hasUserTurn && opts?.openingPlayback) {
      await opts.openingPlayback.done;
      if (superseded()) return false;
    }
    this.#sceneState = resolution.sceneState;
    this.#persistState();
    this.#journalDecision(resolution, {
      trigger,
      ...(worldEvent ? { worldEventDirective: worldEvent.direction } : {}),
      ...(recovered ? { recovered } : {}),
      decide: decideResult,
    });
    this.#emitSfx(resolution.decision.sfx);

    if (resolution.decision.action === "narrate" && resolution.decision.narration?.trim()) {
      console.log("[voice-agent] proactive: narrator bridges");
      const playback = {
        ...this.#beginNarration(resolution.decision.narration.trim()),
        ...(worldEvent ? { worldEventDirective: worldEvent.direction } : {}),
      };
      if (worldEvent || consequence) {
        const chained = this.#narrationHasRealtimePlayback
          ? await this.#chainNarratedEvent(
              speak,
              superseded,
              playback,
              consequence ?? undefined,
            )
          : await (async () => {
              await playback.done;
              if (superseded()) {
                return { action: "narrate", spoke: false, superseded: true } as SceneDriveOutcome;
              }
              return this.#chainNarratedEvent(
                speak,
                superseded,
                undefined,
                consequence ?? undefined,
              );
            })();
        const { voiced } = await playback.done;
        return voiced || chained.spoke;
      }
      const { voiced } = await playback.done;
      if (superseded()) return voiced;
      if (resolution.decision.momentum === true) {
        const cascade = await this.#momentumCascade(1, speak, superseded);
        return voiced || cascade.spoke;
      }
      return voiced;
    }

    if (resolution.decision.action !== "speak" || !resolution.speakerSlug) {
      console.log(`[voice-agent] proactive: ${resolution.decision.action} (hold)`);
      return false;
    }

    const character = await this.#resolveCharacter(resolution.speakerSlug);
    if (!character) {
      console.warn(`[voice-agent] proactive: speaker "${resolution.speakerSlug}" did not resolve`);
      return false;
    }
    const speakerCharacter = this.scene.characters.find(
      (c) => c.characterSlug === resolution.speakerSlug,
    );
    const displayName =
      speakerCharacter?.displayName ?? character.title ?? resolution.speakerSlug;

    const beat = resolution.decision.beat ?? this.#sceneState.beat;
    const hasCue = Boolean(
      resolution.decision.beat ||
      resolution.decision.sceneCue ||
      resolution.decision.delivery ||
      this.#sceneState.characterStates?.[resolution.speakerSlug],
    );
    // Shared with the reactive path (buildSpeakerTurnRequest) so the
    // speaker's authored agenda — and the multi-party attribution
    // convention — ride along on proactive turns too.
    const directive = buildDirectiveChunk({
      beat,
      sceneCue: resolution.decision.sceneCue,
      delivery: resolution.decision.delivery,
      characterState: this.#sceneState.characterStates?.[resolution.speakerSlug],
      speaker: speakerCharacter,
      othersPresent: this.scene.characters
        .filter(
          (c) =>
            c.characterSlug !== resolution.speakerSlug &&
            this.#sceneState.presentCharacterSlugs.includes(c.characterSlug),
        )
        .map((c) => c.displayName),
      // Parity with the reactive path: proactive turns read the same
      // bracketed narration, so they need the same convention (and the
      // visitor-attribution rule) — this was missing alongside the
      // bracket mapping above.
      narratorPresent: narratorMode(this.scene) !== "off",
      visitorRole:
        userRoleFor(this.scene) === "character"
          ? this.scene.userCharacter?.name.trim() || undefined
          : undefined,
    });
    // Same attribution rule as buildSpeakerTurnRequest — INCLUDING the
    // narrator-bracket convention. The brackets are load-bearing beyond
    // perception: the refusal guard's full-reply hold detects "a narrated
    // event is in view" by bracketed history lines, and this mapping's
    // missing bracket case let a crisis-hotline referral reach the user
    // verbatim on a post-catastrophe proactive turn (observed live).
    const history = this.#recentTurns.slice(-RECENT_TURNS_LIMIT).map((turn) => ({
      role: turn.speakerSlug === resolution.speakerSlug ? ("assistant" as const) : ("user" as const),
      content:
        turn.speakerSlug === "narrator"
          ? `[${turn.text}]`
          : turn.speakerSlug === "user" || turn.speakerSlug === resolution.speakerSlug
            ? turn.text
            : `${turn.speakerName ?? turn.speakerSlug}: ${turn.text}`,
    }));

    console.log(`[voice-agent] proactive: ${resolution.speakerSlug} follows up`);
    const replyText = await speak(
      {
        characterId: character.id,
        message: PROACTIVE_TURN_MESSAGE,
        history,
        promptChunk: hasCue ? directive : undefined,
        speaker: { slug: resolution.speakerSlug, name: displayName },
        currentMoment: speakerCharacter?.knowledgeHorizon,
        sceneFeatures: this.#featureStatus(),
      },
      `p${Date.now()}`,
    );
    if (superseded()) return Boolean(replyText);
    if (replyText) {
      this.#recentTurns.push({
        speakerSlug: resolution.speakerSlug,
        speakerName: displayName,
        text: replyText,
      });
      this.#trim();
      if (!consequence) this.#maybeReflect();
    }
    if (consequence && !superseded()) {
      const chained = await this.#chainNarratedEvent(speak, superseded, undefined, consequence);
      return Boolean(replyText) || chained.spoke;
    }
    if (resolution.decision.momentum === true && !superseded()) {
      const cascade = await this.#momentumCascade(1, speak, superseded);
      return Boolean(replyText) || cascade.spoke;
    }
    return Boolean(replyText);
  }

  /** Director-side statuses for the observability `sceneFeatures` block (see
   *  run-voice-stream): the pipeline can't see the arc or the roster, so the
   *  driver states them — explicitly INACTIVE when absent, so a trace never
   *  reads as "ran and found nothing" for a feature that never applied. */
  #featureStatus(): Record<string, string> {
    const roster = this.scene.characters.length;
    const arc = this.scene.arc ?? [];
    const landed = this.#sceneState.arcLanded?.length ?? 0;
    return {
      sceneDefinition: this.scene.id.startsWith("character-sandbox:")
        ? `synthetic — ${this.scene.id} (no scene graph; scene-authored features unavailable)`
        : this.scene.solo
          ? `solo scene ${this.scene.id} (auto-provisioned one-character scene; editable in /scenes)`
          : `scene ${this.scene.id}`,
      arc: arc.length > 0
        ? `active — ${arc.length} beat(s), ${landed} landed`
        : "inactive — no arc event nodes on this scene",
      speakerSelection: roster > 1
        ? `active — roster of ${roster} (orchestrated; addressee continuity in effect)`
        : "solo fastpath — roster of 1 (no speaker selection; addressee continuity n/a)",
    };
  }

  /** Slugs in the roster that are currently present — a real choice needs ≥ 2. */
  #presentRoster(): string[] {
    return this.#sceneState.presentCharacterSlugs.filter((slug) =>
      this.scene.characters.some((c) => c.characterSlug === slug),
    );
  }

  /** A present character who has NOT spoken since the last narrated event —
   *  i.e. someone the event happened around who never responded to it. Null
   *  when there's no recent narration, or everyone present has already had
   *  their say. Bounded to the last few turns so an old event doesn't keep
   *  conscripting speakers forever. */
  #silentWitnessToEvent(): string | null {
    const window = this.#recentTurns.slice(-4);
    const lastNarrationIdx = window.map((t) => t.speakerSlug).lastIndexOf("narrator");
    if (lastNarrationIdx === -1) return null;
    const spokenSince = new Set(
      window.slice(lastNarrationIdx + 1).map((t) => t.speakerSlug),
    );
    return this.#presentRoster().find((slug) => !spokenSince.has(slug)) ?? null;
  }

  /** Who absorbs a failed decision after a real user message: whoever the
   *  user was talking with (addressee continuity), else the first present. */
  #fallbackSpeaker(): string | null {
    const present = this.#presentRoster();
    if (present.length === 0) return null;
    return present.find((slug) => slug === this.#sceneState.lastSpeakerSlug) ?? present[0]!;
  }

  /** Apply the immediate, deterministic half of the consequence protocol.
   * The chronicler will replace these provisional states after the forced
   * reflection following the first spoken reaction. */
  #armConsequenceProtocol(
    resolution: SceneDecisionResolution,
  ): { resolution: SceneDecisionResolution; consequence: ConsequenceContext | null } {
    if (!activatesConsequenceProtocol(resolution.decision)) {
      return { resolution, consequence: null };
    }

    const summary = consequenceSummary(resolution.decision);
    const subjectSlug = resolution.decision.exitSlug?.trim() || null;
    const affectedSlugs = resolution.sceneState.presentCharacterSlugs.filter(
      (slug) => slug !== subjectSlug,
    );
    const prefix = "reeling — ";
    const provisional = `${prefix}${summary.slice(0, 200 - prefix.length)}`;
    const characterStates = { ...(resolution.sceneState.characterStates ?? {}) };
    if (subjectSlug) delete characterStates[subjectSlug];
    for (const slug of affectedSlugs) characterStates[slug] = provisional;
    const nextState: SceneState = {
      ...resolution.sceneState,
      ...(Object.keys(characterStates).length ? { characterStates } : {}),
    };
    const nextResolution: SceneDecisionResolution = {
      ...resolution,
      sceneState: nextState,
      events: resolution.events.map((event) => ({
        ...event,
        payload: { ...event.payload, nextSceneState: nextState },
      })),
    };

    this.#pendingConsequence = summary;
    this.#consequenceVersion += 1;
    return {
      resolution: nextResolution,
      consequence: { summary, subjectSlug, affectedSlugs },
    };
  }

  /** Force the post-event turn onto the most-affected eligible character.
   * A valid director-selected affected speaker is the best available stakes
   * judgment; otherwise roster order is the deterministic fallback. */
  #forceConsequenceDecision(
    decision: OrchestratorDecision,
    consequence: ConsequenceContext,
  ): { decision: OrchestratorDecision; recovered?: "consequence-protocol" } {
    const preferred =
      decision.action === "speak" &&
      decision.speakerId &&
      consequence.affectedSlugs.includes(decision.speakerId)
        ? decision.speakerId
        : null;
    const speakerId = preferred ?? consequence.affectedSlugs[0] ?? this.#fallbackSpeaker();
    if (!speakerId) return { decision };

    const beat = decision.action === "speak" && decision.beat?.trim()
      ? decision.beat
      : `React fully to what just happened: ${consequence.summary}`;
    const forced: OrchestratorDecision = {
      ...decision,
      action: "speak",
      speakerId,
      beat,
      delivery: "expansive",
    };
    const changed =
      decision.action !== "speak" ||
      decision.speakerId !== speakerId ||
      decision.delivery !== "expansive";
    return changed
      ? { decision: forced, recovered: "consequence-protocol" }
      : { decision: forced };
  }

  /** A pipelined decision may have been resolved before a reflection lands.
   * Preserve a newer chronicler state when the decision itself did not touch
   * characterStates, instead of committing the stale full-state snapshot. */
  #preserveConcurrentCharacterStates(
    resolution: SceneDecisionResolution,
  ): SceneDecisionResolution {
    const previous = resolution.events[0]?.payload.previousSceneState;
    if (!previous) return resolution;
    const decisionChangedStates =
      JSON.stringify(previous.characterStates) !==
      JSON.stringify(resolution.sceneState.characterStates);
    const currentChangedSinceResolution =
      JSON.stringify(previous.characterStates) !==
      JSON.stringify(this.#sceneState.characterStates);
    if (decisionChangedStates || !currentChangedSinceResolution) return resolution;

    const nextState = { ...resolution.sceneState };
    if (this.#sceneState.characterStates) {
      nextState.characterStates = this.#sceneState.characterStates;
    } else {
      delete nextState.characterStates;
    }
    return {
      ...resolution,
      sceneState: nextState,
      events: resolution.events.map((event) => ({
        ...event,
        payload: { ...event.payload, nextSceneState: nextState },
      })),
    };
  }

  /** Accept a speculation only when its text is a prefix of the final turn AND
   *  covers most of it — so the speaker was chosen off ~the whole intent. */
  #acceptsSpeculation(basedOnText: string, finalText: string): boolean {
    const based = normalizeForMatch(basedOnText);
    const final = normalizeForMatch(finalText);
    if (!based || !final) return false;
    return final.startsWith(based) && based.length >= final.length * SPECULATION_COVERAGE;
  }

  /** Ask the orchestrator who speaks + the director `beat`. A solo roster used to
   *  fastpath with no LLM (0ms, no direction); now it also fetches a director cue,
   *  but only when it's worth it — disabled entirely if SOLO_CUE is off, and on the
   *  hot path (final) skipped unless a HIT was speculated under the hold (drive()) or
   *  SOLO_CUE_ON_MISS forces an inline call. The phase tag distinguishes a speculative
   *  pre-call (under the hold) from a final-turn call. */
  async #decide(
    // null = no fresh user utterance (a narrate→react chain step): the
    // director decides off the transcript alone, whose last line is the
    // narration just voiced.
    userText: string | null,
    phase: "final" | "speculate" | "proactive" | "chain" | "momentum" = "final",
    signal?: AbortSignal,
    extras?: { worldEventDirective?: string },
  ): Promise<DecideResult> {
    const present = this.#presentRoster();
    const solo = present.length <= 1 ? (present[0] ?? null) : null;
    const soloFloor: OrchestratorDecision | null =
      present.length === 0
        ? defaultSceneDecision(this.scene, this.#sceneState)
        : solo
          ? { action: "speak", speakerId: solo }
          : null;

    const { executor } = this.#deps.resolveExecutor();
    if (!executor) {
      return { decision: soloFloor ?? defaultSceneDecision(this.scene, this.#sceneState) };
    }

    // Solo → the lone character carries the turn. Reactive solo skips the LLM on the
    // hot path (the cue rides a speculative HIT) unless opted in. Proactive solo
    // ALWAYS calls it — no user is waiting, so latency is invisible and the director
    // gets to choose advance-or-hold. (A due world event always consults the LLM —
    // the event must be rendered, not floored.)
    if (solo && !extras?.worldEventDirective) {
      if (phase === "speculate" && !SOLO_CUE_ENABLED) return { decision: soloFloor! };
      if (phase === "final" && (!SOLO_CUE_ENABLED || !SOLO_CUE_ON_MISS)) {
        return { decision: soloFloor! };
      }
      // Chain step in a solo scene: the lone character reacts to the
      // narration — the floor already says exactly that, no LLM needed.
      if (phase === "chain") return { decision: soloFloor! };
    }

    const request = buildSceneDecisionRequest({
      scene: this.scene,
      sceneState: this.#sceneState,
      recentTurns: this.#recentTurns,
      sceneMemory: this.#sceneMemory,
      sceneFacts: this.#sceneFacts,
      chronicle: this.#chronicle,
      worldEventDirective: extras?.worldEventDirective,
      lastUserMessage: userText ?? undefined,
    });

    const startedAt = Date.now();
    const costOperationId = `director:${crypto.randomUUID()}`;
    let costRecorded = false;
    try {
      const decision = await executor.execute(request, {
        signal,
        onUsage: (usage) => {
          costRecorded = true;
          this.#cost?.(
            buildLlmSessionCostEntry({
              operationId: costOperationId,
              category: "director_llm",
              provider: executor.provider,
              model: executor.model,
              usage,
            }),
          );
        },
      });
      console.log(
        `[voice-agent] orchestrate[${phase}] ${Date.now() - startedAt}ms → ${decision.action} ${decision.speakerId ?? ""}`.trimEnd(),
      );
      // Reactive solo: pin the speaker (the user addressed them, so a
      // `wait-for-user` would leave them hanging). Never override end-scene
      // or narrate — those are deliberate non-speak moves. Proactive solo:
      // respect `wait-for-user` too — that's the silence/monologue brake.
      const pinnable = decision.action === "speak" || decision.action === "wait-for-user";
      // Momentum steps are exempt from the solo pin for the same reason as
      // proactive ticks: nobody is waiting, and `wait-for-user` is how the
      // director ENDS a cascade — pinning it to speak would loop forever.
      return {
        decision:
          solo && phase !== "proactive" && phase !== "momentum" && pinnable
            ? { ...decision, action: "speak", speakerId: solo }
            : decision,
        latencyMs: Date.now() - startedAt,
        provider: executor.provider,
        model: executor.model,
      };
    } catch (err) {
      const failed = err instanceof Error ? err.message : String(err);
      if (!costRecorded) {
        this.#cost?.(
          buildLlmSessionCostEntry({
            operationId: costOperationId,
            category: "director_llm",
            provider: executor.provider,
            model: executor.model,
            status: signal?.aborted ? "cancelled" : "failed",
            usage: {},
            usageKnown: false,
            note: failed,
          }),
        );
      }
      if (!signal?.aborted) console.error("[voice-agent] orchestrate failed", err);
      return {
        decision: soloFloor ?? defaultSceneDecision(this.scene, this.#sceneState),
        failed,
        latencyMs: Date.now() - startedAt,
        provider: executor.provider,
        model: executor.model,
      };
    }
  }

  /**
   * MOMENTUM cascade — the director declared the moment unresolved, so the
   * scene keeps advancing without the user: decide → perform → repeat while
   * each decision carries `momentum`, the budget holds, and no newer turn
   * has taken the floor. `beatsUsed` counts driver-initiated beats already
   * performed this user turn (the narrate chain counts toward the cap).
   */
  async #momentumCascade(
    beatsUsed: number,
    speak: SceneSpeakFn,
    superseded: () => boolean,
  ): Promise<{ spoke: boolean }> {
    let spoke = false;
    let beats = beatsUsed;
    let forcedConsequence: ConsequenceContext | null = null;
    const cascadeMax = CASCADE_MAX + (initiativeMode(this.scene) === "narrator" ? 2 : 0);
    while (beats < cascadeMax) {
      if (superseded()) break;
      const decideResult = await this.#decide(MOMENTUM_MARKER, "momentum");
      let { decision } = decideResult;
      let recovered: SceneDecisionJournalExtras["recovered"];
      if (forcedConsequence) {
        const forced = this.#forceConsequenceDecision(decision, forcedConsequence);
        decision = forced.decision;
        recovered = forced.recovered;
        forcedConsequence = null;
      }
      if (superseded()) break;
      let resolution = resolveSceneDecision(
        { scene: this.scene, sceneState: this.#sceneState },
        decision,
      );
      const armed = this.#armConsequenceProtocol(resolution);
      resolution = armed.resolution;
      forcedConsequence = armed.consequence;
      this.#sceneState = resolution.sceneState;
      this.#persistState();
      this.#journalDecision(resolution, {
        trigger: "momentum",
        cascadeDepth: beats + 1,
        ...(recovered ? { recovered } : {}),
        decide: decideResult,
      });
      this.#emitSfx(resolution.decision.sfx);

      if (resolution.decision.action === "narrate" && resolution.decision.narration?.trim()) {
        console.log(`[voice-agent] cascade beat ${beats + 1}: narrator`);
        const voiced = await this.#narrate(resolution.decision.narration.trim());
        spoke = spoke || voiced;
      } else if (resolution.decision.action === "speak" && resolution.speakerSlug) {
        console.log(`[voice-agent] cascade beat ${beats + 1}: ${resolution.speakerSlug}`);
        const result = await this.#speakTurn(
          resolution,
          speak,
          superseded,
          forcedConsequence ? { deferReflection: true } : undefined,
        );
        if (result === "superseded") break;
        spoke = spoke || result;
      } else {
        // wait-for-user / end-scene — the moment resolved; the scene breathes.
        console.log(`[voice-agent] cascade resolved: ${resolution.decision.action}`);
        break;
      }
      beats += 1;
      if (resolution.decision.momentum !== true && !forcedConsequence) break;
    }
    if (beats >= cascadeMax) {
      console.log(`[voice-agent] cascade capped at ${cascadeMax} beats — holding for the user`);
      this.#journalSuppression("cascade-capped", { beatsUsed: beats });
    }
    return { spoke };
  }

  /** Host hook: invoked when a reflection arms NEW timed world events, so
   *  the host can schedule a wake-up for the due time. */
  onWorldEvents(cb: () => void): void {
    this.#onWorldEventsArmed = cb;
  }

  /** Milliseconds until the next pending world event is due — 0 when one is
   *  due now, null when none are pending. The host arms a timer with this. */
  nextWorldEventDueInMs(now = Date.now()): number | null {
    const pending = this.#timedSchedule.filter((e) => !e.fired);
    if (pending.length === 0) return null;
    const soonest = Math.min(...pending.map((e) => e.dueAt));
    return Math.max(0, soonest - now);
  }

  /** Arm the schedule from a fresh chronicle. Events are deduped by
   *  direction text: a restated pending event keeps its original clock and
   *  fired state; dropped events disarm; new ones anchor to NOW. */
  #armTimedEvents(chronicle: SceneChronicle, now: number): void {
    const next: Array<{ dueAt: number; direction: string; fired: boolean }> = [];
    let armedNew = false;
    for (const t of chronicle.timed) {
      const existing = this.#timedSchedule.find((e) => e.direction === t.direction);
      if (existing) {
        next.push(existing);
      } else {
        const dueAt = now + t.afterSeconds * 1000;
        next.push({ dueAt, direction: t.direction, fired: false });
        armedNew = true;
        console.log(`[chronicler] timed event armed (~${t.afterSeconds}s): ${t.direction}`);
        if (this.#journal) {
          try {
            this.#journal(
              buildWorldEventArmedJournalEntry({
                sceneId: this.scene.id,
                direction: t.direction,
                afterSeconds: t.afterSeconds,
                dueAt: new Date(dueAt).toISOString(),
              }),
            );
          } catch {
            // best-effort
          }
        }
      }
    }
    this.#timedSchedule = next;
    if (armedNew && this.#onWorldEventsArmed) {
      try {
        this.#onWorldEventsArmed();
      } catch {
        // host hook must never disrupt the reflection
      }
    }
  }

  /** The first due, unfired event — marked fired on consumption. The caller
   *  un-fires it if the turn is superseded before the decision applies. */
  #consumeDueWorldEvent(now: number): { direction: string; fired: boolean } | null {
    const due = this.#timedSchedule.find((e) => !e.fired && e.dueAt <= now);
    if (!due) return null;
    due.fired = true;
    return due;
  }

  #trim(): void {
    const cap = RECENT_TURNS_LIMIT * 2;
    if (this.#recentTurns.length > cap) {
      this.#recentTurns = this.#recentTurns.slice(-cap);
    }
  }
}
