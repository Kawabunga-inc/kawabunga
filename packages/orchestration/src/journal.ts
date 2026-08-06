import type { OrchestratorDecision, SceneState } from "@kawabunga/types";
import type { SceneChronicle, SceneDecisionResolution } from "./client";

/**
 * The SCENE JOURNAL — the Narrator's flight recorder.
 *
 * Every consequential orchestration moment (a director decision, a
 * chronicler reflection, a timed world event arming) is emitted as a typed
 * journal entry. Hosts persist entries to `scene_session_events`, which
 * makes any session — live or historical — replayable in the session
 * workbench.
 *
 * The decision entry types (`scene.decision.*`) deliberately match the
 * SceneEventDraft rows the admin orchestrate route has always persisted, so
 * both transports (browser SSE player and the LiveKit voice agent) produce
 * one uniform stream the UI can read without caring where a session ran.
 *
 * Payloads are versioned (`journalVersion`) so the workbench can render
 * older sessions as schemas evolve.
 */

export const SCENE_JOURNAL_VERSION = 1;

/** Event types beyond the existing `scene.decision.*` family. */
export const SCENE_REFLECTION_EVENT_TYPE = "scene.reflection";
export const SCENE_WORLD_EVENT_ARMED_TYPE = "scene.world-event.armed";

/** What prompted a director decision — the voice path's sentinel markers
 *  made explicit, so the workbench can label rail items without parsing
 *  prompt text. */
export type SceneDecisionTrigger =
  /** A finished user turn (drive). */
  | "user-turn"
  /** The scene's first move — proactive tick before the visitor has spoken. */
  | "scene-open"
  /** An idle/silence tick (driveProactive). */
  | "proactive"
  /** The narrate→react chain step after a rendered event. */
  | "chain"
  /** A momentum cascade step. */
  | "momentum"
  /** A due TIMED world event upgraded this tick. */
  | "world-event"
  /** Browser player loop (the orchestrate route; trigger granularity
   *  unknown to the server). */
  | "player";

/** How the runtime recovered when the raw decision would have failed the
 *  moment (see scene-driver.ts for each observed failure). */
export type SceneDecisionRecovery =
  /** Degraded/failed decision after a user turn → addressee answers. */
  | "fallback-speaker"
  /** Chain returned wait-for-user after an event → a character reacts. */
  | "chain-reactor"
  /** Proactive wait-for-user with an unanswered event → witness responds. */
  | "silent-witness"
  /** Proactive wait-for-user with a due world event → narrated directly. */
  | "world-event-narrated"
  /** User lacks director powers; narrator-addressed world fiat → character response. */
  | "director-denied"
  /** Runtime forced the speaker/delivery after an irreversible event. */
  | "consequence-protocol";

export type SceneDecisionJournalExtras = {
  trigger: SceneDecisionTrigger;
  /** The user's utterance for `user-turn` triggers. */
  userText?: string;
  /** Director call latency (absent on floors/fallbacks that skip the LLM). */
  latencyMs?: number;
  provider?: string;
  model?: string;
  /** Speculation outcome for the hot-path decision this entry records. */
  speculation?: {
    outcome: "hit" | "miss" | "none";
    /** The partial transcript the accepted speculation was computed from. */
    basedOnText?: string;
    /** How long drive() awaited the in-flight speculative call on a HIT. */
    waitedMs?: number;
  };
  /** Executor failure the resolution papered over (timeout, 5xx…). */
  failure?: string;
  recovered?: SceneDecisionRecovery;
  /** 1-based beat number within a chain/cascade after one user turn. */
  cascadeDepth?: number;
  /** The due TIMED direction rendered by a `world-event` trigger. */
  worldEventDirective?: string;
  /** Real-time narration duration that hid reaction work. Pipelined paths only. */
  narrationAudioMs?: number;
  /** Chain decision + character generation/TTS buffering wall time. */
  reactionReadyMs?: number;
  /** Listener-visible delay from narration end to the first reaction frame. */
  gapMs?: number;
};

export type SceneJournalEntry = {
  /** `scene.decision.*` | scene.reflection | scene.world-event.armed */
  type: string;
  source: "orchestration";
  turnId?: string;
  payload: Record<string, unknown>;
};

/** Host-supplied sink; implementations must be fire-and-forget safe (the
 *  driver never awaits the sink and swallows its throws). */
export type SceneJournalSink = (entry: SceneJournalEntry) => void;

/**
 * Journal entries for one resolved decision — the resolution's event drafts
 * (same rows the orchestrate route persists) enriched with the voice path's
 * runtime context (trigger, speculation, latency, recovery).
 */
export function buildDecisionJournalEntries(
  resolution: SceneDecisionResolution,
  extras: SceneDecisionJournalExtras,
): SceneJournalEntry[] {
  return resolution.events.map((event) => ({
    type: event.type,
    source: "orchestration" as const,
    payload: {
      ...event.payload,
      journalVersion: SCENE_JOURNAL_VERSION,
      ...extras,
    },
  }));
}

export type SceneReflectionJournalPayload = {
  journalVersion: number;
  sceneId: string;
  model: string;
  latencyMs: number;
  /** Raw model reply (capped) — the ground truth when parsing is suspect. */
  raw?: string;
  note: string | null;
  /** Facts newly added by this reflection (not the whole store). */
  factsAdded: string[];
  /** Arc beats newly landed (canonical labels, post prefix-expansion). */
  landedAdded: string[];
  /** Roster slugs the chronicler retired via GONE (validated). */
  gone: string[];
  /** Per-character emotional states changed by this reflection. Null means a
   *  previously carried state was deliberately dropped. */
  statesChanged: Array<{ slug: string; state: string | null }>;
  chronicleBefore: SceneChronicle | null;
  chronicleAfter: SceneChronicle | null;
  /** Completed spoken turns at fire time (the cadence counter). */
  spokenTurns: number;
  /** Set when the reflection call failed — all output fields are empty. */
  error?: string;
};

const REFLECTION_RAW_MAX_CHARS = 6000;

export function buildReflectionJournalEntry(
  payload: Omit<SceneReflectionJournalPayload, "journalVersion">,
): SceneJournalEntry {
  return {
    type: SCENE_REFLECTION_EVENT_TYPE,
    source: "orchestration",
    payload: {
      ...payload,
      ...(payload.raw !== undefined
        ? { raw: payload.raw.slice(0, REFLECTION_RAW_MAX_CHARS) }
        : {}),
      journalVersion: SCENE_JOURNAL_VERSION,
    },
  };
}

export type SceneWorldEventArmedJournalPayload = {
  journalVersion: number;
  sceneId: string;
  direction: string;
  afterSeconds: number;
  /** ISO timestamp the runtime will consider the event due. */
  dueAt: string;
};

export function buildWorldEventArmedJournalEntry(
  payload: Omit<SceneWorldEventArmedJournalPayload, "journalVersion">,
): SceneJournalEntry {
  return {
    type: SCENE_WORLD_EVENT_ARMED_TYPE,
    source: "orchestration",
    payload: { ...payload, journalVersion: SCENE_JOURNAL_VERSION },
  };
}

/** Decision snapshot fields shared by every `scene.decision.*` payload —
 *  exported for the workbench's typed reads (both transports emit them). */
export type SceneDecisionJournalPayload = {
  sceneId: string;
  action: OrchestratorDecision["action"];
  speakerSlug: string | null;
  previousSceneState: SceneState;
  nextSceneState: SceneState;
  decision: OrchestratorDecision;
  degraded?: boolean;
  reason?: string;
} & Partial<SceneDecisionJournalExtras> & { journalVersion?: number };
