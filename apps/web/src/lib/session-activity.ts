import type {
  SceneSessionEventRecord,
  SceneSessionRecord,
  SceneSessionTurnRecord,
} from "@kawabunga/db";

export const SESSION_ACTIVE_WINDOW_MS = 60_000;

export type SessionActivity = {
  isActive: boolean;
  latestActivityAt: string | null;
  ageMs: number | null;
  displayStatus: string;
};

function parsedTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/**
 * Mirrors the admin sessions-index rule. Persisted `active` is necessary but
 * not sufficient: the newest session, event, or turn timestamp must be
 * strictly less than 60 seconds old. Exact 60 seconds is stale.
 */
export function classifySessionActivity(
  session: Pick<SceneSessionRecord, "status" | "lastActiveAt">,
  events: Pick<SceneSessionEventRecord, "createdAt">[],
  turns: Pick<SceneSessionTurnRecord, "updatedAt">[],
  nowMs = Date.now(),
): SessionActivity {
  const timestamps = [
    parsedTime(session.lastActiveAt),
    ...events.map((event) => parsedTime(event.createdAt)),
    ...turns.map((turn) => parsedTime(turn.updatedAt)),
  ].filter((time): time is number => time != null);
  const latestMs = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const ageMs = latestMs == null ? null : Math.max(0, nowMs - latestMs);
  const isActive =
    session.status === "active" &&
    ageMs != null &&
    ageMs < SESSION_ACTIVE_WINDOW_MS;

  return {
    isActive,
    latestActivityAt: latestMs == null ? null : new Date(latestMs).toISOString(),
    ageMs,
    displayStatus:
      session.status === "active" && !isActive ? "stale" : session.status,
  };
}
