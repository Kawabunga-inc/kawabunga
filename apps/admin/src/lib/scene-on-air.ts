import type {
  SceneSessionDetailRecord,
  SceneSessionEventRecord,
  SceneSessionRecord,
  SceneSessionTurnRecord,
} from "@kawabunga/db";
import { classifySessionActivity } from "@/lib/session-activity";

type JsonRecord = Record<string, unknown>;

export type SceneOnAirCandidate = {
  id: string;
  userLabel: string;
  startedAt: string;
};

export type SceneOnAirCharacterState = {
  state: "speaking" | "present" | "departed";
  turnNumber: number | null;
  lastSpokeTurn: number | null;
};

export type SceneOnAirSoundCue = {
  slug: string;
  firedAt: string;
  ageMs: number;
};

export type SceneOnAirPresentation = {
  beat: string | null;
  arcLanded: number;
  ambienceSlug: string | null;
  characterByNodeId: Record<string, SceneOnAirCharacterState>;
  narratorTurnNumber: number | null;
  recentSfxByNodeId: Record<string, SceneOnAirSoundCue>;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function timeOf(turn: SceneSessionTurnRecord): number {
  return Date.parse(turn.updatedAt) || Date.parse(turn.createdAt) || 0;
}

function isStreamingTurn(turn: SceneSessionTurnRecord): boolean {
  if (turn.status === "streaming" || turn.status === "in_progress") return true;
  return (
    turn.completedAt == null &&
    !["completed", "succeeded", "error", "interrupted"].includes(turn.status)
  );
}

function isCompletedTurn(turn: SceneSessionTurnRecord): boolean {
  return turn.status === "completed" || turn.status === "succeeded";
}

function turnNumber(turn: SceneSessionTurnRecord, turns: SceneSessionTurnRecord[]): number {
  if (turn.turnIndex != null) return turn.turnIndex;
  return turns.findIndex((candidate) => candidate.id === turn.id) + 1;
}

function newestTurn(
  turns: SceneSessionTurnRecord[],
  predicate: (turn: SceneSessionTurnRecord) => boolean,
): SceneSessionTurnRecord | null {
  let newest: SceneSessionTurnRecord | null = null;
  for (const turn of turns) {
    if (!turn.speakerSlug || !predicate(turn)) continue;
    if (!newest || timeOf(turn) >= timeOf(newest)) newest = turn;
  }
  return newest;
}

/**
 * Applies B3's canonical activity classifier to a scene-scoped batch and
 * returns newest-first active sessions. The caller is responsible for using
 * listSessionsForScene → listEventsForSessions → listTurnsForSessions.
 */
export function selectSceneOnAirSessions(
  sessions: SceneSessionRecord[],
  events: SceneSessionEventRecord[],
  turns: SceneSessionTurnRecord[],
  nowMs = Date.now(),
): SceneSessionRecord[] {
  const eventsBySession = new Map<string, SceneSessionEventRecord[]>();
  const turnsBySession = new Map<string, SceneSessionTurnRecord[]>();
  for (const event of events) {
    const rows = eventsBySession.get(event.sessionId) ?? [];
    rows.push(event);
    eventsBySession.set(event.sessionId, rows);
  }
  for (const turn of turns) {
    const rows = turnsBySession.get(turn.sessionId) ?? [];
    rows.push(turn);
    turnsBySession.set(turn.sessionId, rows);
  }

  return sessions
    .filter((session) =>
      classifySessionActivity(
        session,
        eventsBySession.get(session.id) ?? [],
        turnsBySession.get(session.id) ?? [],
        nowMs,
      ).isActive,
    )
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

/**
 * Turns one live detail into read-only stage presentation. nodeCharacterSlugs
 * and soundNodeSlugs are server-resolved joins, so labels never act as IDs.
 */
export function buildSceneOnAirPresentation({
  detail,
  nodeCharacterSlugs,
  soundNodeSlugs,
  defaultAmbience,
  nowMs,
}: {
  detail: SceneSessionDetailRecord;
  nodeCharacterSlugs: Record<string, string>;
  soundNodeSlugs: Record<string, string>;
  defaultAmbience: string | null;
  nowMs: number;
}): SceneOnAirPresentation {
  const snapshot = asRecord(asRecord(detail.session.currentScene)?.sceneState);
  const hasPresenceSnapshot = Array.isArray(snapshot?.presentCharacterSlugs);
  const presentSlugs = new Set(stringList(snapshot?.presentCharacterSlugs));
  const beat =
    typeof snapshot?.beat === "string" && snapshot.beat.trim()
      ? snapshot.beat
      : null;
  const arcLanded = stringList(snapshot?.arcLanded).length;

  const streaming = newestTurn(detail.turns, isStreamingTurn);
  const speaking = streaming ?? newestTurn(detail.turns, isCompletedTurn);
  const speakingSlug = speaking?.speakerSlug ?? null;
  const speakingTurnNumber = speaking ? turnNumber(speaking, detail.turns) : null;

  const lastTurnBySlug = new Map<string, SceneSessionTurnRecord>();
  for (const turn of detail.turns) {
    if (!turn.speakerSlug || !isCompletedTurn(turn)) continue;
    const current = lastTurnBySlug.get(turn.speakerSlug);
    if (!current || timeOf(turn) >= timeOf(current)) {
      lastTurnBySlug.set(turn.speakerSlug, turn);
    }
  }

  const characterByNodeId: Record<string, SceneOnAirCharacterState> = {};
  for (const [nodeId, slug] of Object.entries(nodeCharacterSlugs)) {
    const lastTurn = lastTurnBySlug.get(slug);
    characterByNodeId[nodeId] = {
      state:
        speakingSlug === slug
          ? "speaking"
          : hasPresenceSnapshot && !presentSlugs.has(slug)
            ? "departed"
            : "present",
      turnNumber: speakingSlug === slug ? speakingTurnNumber : null,
      lastSpokeTurn: lastTurn ? turnNumber(lastTurn, detail.turns) : null,
    };
  }

  let ambienceSlug = defaultAmbience;
  let foundAmbienceDecision = false;
  let sawDecision = false;
  const recentSfx = new Map<string, SceneOnAirSoundCue>();
  for (let index = detail.events.length - 1; index >= 0; index -= 1) {
    const event = detail.events[index]!;
    if (!event.type.startsWith("scene.decision.")) continue;
    const decision = asRecord(asRecord(event.payload)?.decision);
    if (!decision) continue;
    sawDecision = true;
    if (
      !foundAmbienceDecision &&
      typeof decision.ambience === "string" &&
      decision.ambience.trim()
    ) {
      ambienceSlug = decision.ambience;
      foundAmbienceDecision = true;
    }
    if (!Array.isArray(decision.sfx)) continue;
    const firedMs = Date.parse(event.createdAt);
    const ageMs = Number.isFinite(firedMs) ? Math.max(0, nowMs - firedMs) : Infinity;
    // Keep a just-fired cue visible for the same short live-activity window
    // used by B3; older cues would read as history rather than stage state.
    if (ageMs >= 60_000) continue;
    for (const cue of decision.sfx) {
      const slug = asRecord(cue)?.id;
      if (typeof slug !== "string" || recentSfx.has(slug)) continue;
      recentSfx.set(slug, { slug, firedAt: event.createdAt, ageMs });
    }
  }

  const recentSfxByNodeId: Record<string, SceneOnAirSoundCue> = {};
  for (const [nodeId, slug] of Object.entries(soundNodeSlugs)) {
    const cue = recentSfx.get(slug);
    if (cue) recentSfxByNodeId[nodeId] = cue;
  }

  return {
    beat,
    arcLanded,
    ambienceSlug: sawDecision ? ambienceSlug : null,
    characterByNodeId,
    narratorTurnNumber:
      speakingSlug === "narrator" ? speakingTurnNumber : null,
    recentSfxByNodeId,
  };
}
