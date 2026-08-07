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
import { aggregateSessionHealthRollup } from "@/lib/session-health-rollup";

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

function healthRow(
  session: SceneSessionRecord,
  turns: SceneSessionTurnRecord[],
  events: SceneSessionEventRecord[],
  hasArc: boolean,
): SceneSessionHealthRow {
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
    ...aggregateSessionHealthRollup(session, turns, events, hasArc),
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
