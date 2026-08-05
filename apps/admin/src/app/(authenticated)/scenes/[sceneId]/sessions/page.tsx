import { notFound } from "next/navigation";
import {
  getSceneSessionStore,
  type SceneSessionEventRecord,
  type SceneSessionRecord,
  type SceneSessionTurnRecord,
} from "@kawabunga/db";
import {
  SceneSessionsRollup,
  type SceneSessionHealthRow,
} from "@/components/scene-sessions-rollup";
import { resolveScene } from "@/lib/scene-orchestration";
import { aggregateSessionJournalHealth } from "@/lib/session-journal-health";

export const dynamic = "force-dynamic";

// Journal-health aggregation happens server-side over raw event/turn rows —
// deliberately independent of the client-side journal parser (which lives in
// a "use client" module) but reading the same payload contract
// (packages/orchestration/src/journal.ts).

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function firstAudioMsOf(turn: SceneSessionTurnRecord): number | null {
  const metrics = asRecord(turn.audioMetrics);
  const latency = asRecord(turn.latencySummary);
  const value =
    (typeof metrics?.firstAudioMs === "number" ? metrics.firstAudioMs : null) ??
    (typeof metrics?.firstAudio === "number" ? metrics.firstAudio : null) ??
    (typeof latency?.firstAudioMs === "number" ? latency.firstAudioMs : null) ??
    (typeof latency?.firstAudio === "number" ? latency.firstAudio : null);
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function durationLabel(session: SceneSessionRecord): string {
  const start = Date.parse(session.startedAt);
  const end = Date.parse(session.endedAt ?? session.lastActiveAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function healthRow(
  session: SceneSessionRecord,
  turns: SceneSessionTurnRecord[],
  events: SceneSessionEventRecord[],
  hasArc: boolean,
): SceneSessionHealthRow {
  const health = aggregateSessionJournalHealth(events);

  // Arc completion: the persisted snapshot is authoritative; journal
  // decisions fill in when snapshot persistence was off.
  let arcLandedCount: number | null = null;
  if (hasArc) {
    const snapshotState = asRecord(asRecord(session.currentScene)?.sceneState);
    const fromSnapshot = Array.isArray(snapshotState?.arcLanded)
      ? snapshotState.arcLanded.filter((v) => typeof v === "string").length
      : 0;
    let fromJournal = 0;
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i]!;
      if (!event.type.startsWith("scene.decision.")) continue;
      const nextState = asRecord(asRecord(event.payload)?.nextSceneState);
      if (Array.isArray(nextState?.arcLanded)) {
        fromJournal = nextState.arcLanded.filter((v) => typeof v === "string").length;
        break;
      }
    }
    arcLandedCount = Math.max(fromSnapshot, fromJournal);
  }

  const meta = asRecord(session.metadata);
  const userLabel =
    (typeof meta?.userName === "string" && meta.userName) ||
    (typeof meta?.userEmail === "string" && meta.userEmail) ||
    null;

  return {
    id: session.id,
    startedAt: session.startedAt,
    lastActiveAt: session.lastActiveAt,
    mode: session.mode,
    status: session.status,
    userLabel,
    turnCount: turns.length,
    durationLabel: durationLabel(session),
    p50FirstAudioMs: median(
      turns.map(firstAudioMsOf).filter((v): v is number => v != null),
    ),
    ...health,
    arcLandedCount,
  };
}

export default async function SceneSessionsPage({
  params,
}: {
  params: Promise<{ sceneId: string }>;
}) {
  const { sceneId } = await params;
  const scene = await resolveScene(sceneId).catch(() => null);
  if (!scene) notFound();

  const store = getSceneSessionStore();
  const sessions = await store.listSessionsForScene(sceneId, 50);
  const sessionIds = sessions.map((s) => s.id);
  const [events, turns] = await Promise.all([
    store.listEventsForSessions(sessionIds, "scene."),
    store.listTurnsForSessions(sessionIds),
  ]);

  const eventsBySession = new Map<string, SceneSessionEventRecord[]>();
  for (const event of events) {
    const list = eventsBySession.get(event.sessionId) ?? [];
    list.push(event);
    eventsBySession.set(event.sessionId, list);
  }
  const turnsBySession = new Map<string, SceneSessionTurnRecord[]>();
  for (const turn of turns) {
    const list = turnsBySession.get(turn.sessionId) ?? [];
    list.push(turn);
    turnsBySession.set(turn.sessionId, list);
  }

  const arcLength = scene.arc?.length ?? 0;
  const rows = sessions.map((session) =>
    healthRow(
      session,
      turnsBySession.get(session.id) ?? [],
      eventsBySession.get(session.id) ?? [],
      arcLength > 0,
    ),
  );

  return (
    <SceneSessionsRollup
      sceneId={sceneId}
      sceneTitle={scene.title}
      sceneObjective={scene.objective ?? null}
      arcLength={arcLength}
      rows={rows}
    />
  );
}
