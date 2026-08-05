import "server-only";

import { cache } from "react";
import {
  getSceneSessionStore,
  type SceneSessionEventRecord,
  type SceneSessionRecord,
  type SceneSessionSummaryRecord,
  type SceneSessionTurnRecord,
} from "@kawabunga/db";
import { resolveScene } from "./scene-orchestration";
import { classifySessionActivity } from "./session-activity";
import {
  aggregateSessionHealthRollup,
  type SessionHealthRollup,
} from "./session-health-rollup";

type JsonRecord = Record<string, unknown>;

export type SessionIndexRow = SessionHealthRollup & {
  id: string;
  sceneId: string | null;
  sceneTitle: string;
  userLabel: string;
  mode: string;
  transport: "livekit" | "sandbox" | "web";
  status: string;
  startedAt: string;
  lastActiveAt: string;
  latestActivityAt: string | null;
  isActive: boolean;
  arcLength: number;
};

export type SessionsIndexData = {
  active: SessionIndexRow[];
  recent: SessionIndexRow[];
  activeCount: number;
  totalCount: number;
  renderedAt: string;
};

export type SessionActivityData = {
  entries: Array<{
    session: SceneSessionRecord;
    events: SceneSessionEventRecord[];
    turns: SceneSessionTurnRecord[];
    activity: ReturnType<typeof classifySessionActivity>;
  }>;
  activeCount: number;
  renderedAt: string;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function groupBySession<T extends { sessionId: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const values = grouped.get(row.sessionId) ?? [];
    values.push(row);
    grouped.set(row.sessionId, values);
  }
  return grouped;
}

function transportOf(
  metadata: JsonRecord | null,
): SessionIndexRow["transport"] {
  const source =
    typeof metadata?.source === "string" ? metadata.source.toLowerCase() : "";
  if (source === "scene-voice" || source.includes("livekit")) return "livekit";
  if (source.includes("sandbox")) return "sandbox";
  return "web";
}

function fallbackSceneTitle(session: SceneSessionSummaryRecord): string {
  const metadata = asRecord(session.metadata);
  const initialScene = asRecord(session.initialScene);
  const title =
    (typeof metadata?.sceneTitle === "string" && metadata.sceneTitle.trim()) ||
    (typeof initialScene?.title === "string" && initialScene.title.trim());
  return title || (session.sceneId ? `Scene ${session.sceneId.slice(0, 8)}` : "Unknown scene");
}

/** Lightweight activity slice shared exactly by the layout badge and page. */
export const getSessionActivityData = cache(
  async (): Promise<SessionActivityData> => {
    const store = getSceneSessionStore();
    const sessions = await store.listSessions(50);
    const sessionIds = sessions.map((session) => session.id);
    const [events, turns] = await Promise.all([
      store.listEventsForSessions(sessionIds),
      store.listTurnsForSessions(sessionIds),
    ]);
    const eventsBySession = groupBySession<SceneSessionEventRecord>(events);
    const turnsBySession = groupBySession<SceneSessionTurnRecord>(turns);
    const renderedAtMs = Date.now();
    const entries = sessions.map((session) => {
      const sessionEvents = eventsBySession.get(session.id) ?? [];
      const sessionTurns = turnsBySession.get(session.id) ?? [];
      return {
        session,
        events: sessionEvents,
        turns: sessionTurns,
        activity: classifySessionActivity(
          session,
          sessionEvents,
          sessionTurns,
          renderedAtMs,
        ),
      };
    });

    return {
      entries,
      activeCount: entries.filter((entry) => entry.activity.isActive).length,
      renderedAt: new Date(renderedAtMs).toISOString(),
    };
  },
);

/**
 * Latest 50 sessions, fully hydrated only for the sessions page. The shared
 * activity slice above keeps the global sidebar read light and guarantees its
 * count uses the page's exact timestamps and classifier.
 */
export const getSessionsIndexData = cache(
  async (): Promise<SessionsIndexData> => {
    const store = getSceneSessionStore();
    const [activityData, sessions] = await Promise.all([
      getSessionActivityData(),
      store.listSessionSummaries(50),
    ]);
    const activityBySession = new Map(
      activityData.entries.map((entry) => [entry.session.id, entry]),
    );

    const sceneIds = Array.from(
      new Set(
        sessions
          .map((session) => session.sceneId)
          .filter((sceneId): sceneId is string => Boolean(sceneId)),
      ),
    );
    const scenes = await Promise.all(
      sceneIds.map(async (sceneId) => [
        sceneId,
        await resolveScene(sceneId).catch(() => null),
      ] as const),
    );
    const scenesById = new Map(scenes);

    const rows = sessions.map((session): SessionIndexRow => {
      const activityEntry = activityBySession.get(session.id);
      const sessionEvents = activityEntry?.events ?? [];
      const sessionTurns = activityEntry?.turns ?? [];
      const scene = session.sceneId ? scenesById.get(session.sceneId) : null;
      const arcLength = scene?.arc?.length ?? 0;
      const activity =
        activityEntry?.activity ??
        classifySessionActivity(
          session,
          sessionEvents,
          sessionTurns,
          Date.parse(activityData.renderedAt),
        );
      const metadata = asRecord(session.metadata);

      return {
        id: session.id,
        sceneId: session.sceneId ?? null,
        sceneTitle: scene?.title ?? fallbackSceneTitle(session),
        userLabel: session.user?.name?.trim() || "anonymous",
        mode: session.mode,
        transport: transportOf(metadata),
        status: activity.displayStatus,
        startedAt: session.startedAt,
        lastActiveAt: session.lastActiveAt,
        latestActivityAt: activity.latestActivityAt,
        isActive: activity.isActive,
        arcLength,
        ...aggregateSessionHealthRollup(
          session,
          sessionTurns,
          sessionEvents,
          arcLength > 0,
        ),
      };
    });

    const newestActivityFirst = (a: SessionIndexRow, b: SessionIndexRow) =>
      Date.parse(b.latestActivityAt ?? b.lastActiveAt) -
      Date.parse(a.latestActivityAt ?? a.lastActiveAt);
    const active = rows.filter((row) => row.isActive).sort(newestActivityFirst);
    const recent = rows.filter((row) => !row.isActive).sort(newestActivityFirst);

    return {
      active,
      recent,
      activeCount: active.length,
      totalCount: rows.length,
      renderedAt: activityData.renderedAt,
    };
  },
);
