import type {
  SceneSessionDetailRecord,
  SceneSessionEventRecord,
  SceneSessionRecord,
  SceneSessionTurnRecord,
} from "@kawabunga/db";

export type LiveSessionCursors = {
  turns: string | null;
  events: string | null;
};

export type LiveSessionFeedResponse = {
  session: SceneSessionRecord;
  turns: SceneSessionTurnRecord[];
  events: SceneSessionEventRecord[];
  cursors: LiveSessionCursors;
  truncated: {
    turns: boolean;
    events: boolean;
  };
  serverTime: string;
};

function maxIso(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (value && (latest == null || value > latest)) latest = value;
  }
  return latest;
}

export function cursorsForDetail(
  detail: SceneSessionDetailRecord,
): LiveSessionCursors {
  return {
    turns: maxIso(detail.turns.map((turn) => turn.updatedAt)),
    events: maxIso(detail.events.map((event) => event.createdAt)),
  };
}

/** Merge an incremental feed page into the server-rendered detail shape.
 * Turns replace in place because they mutate while streaming; immutable
 * events append once. All non-live detail collections pass through. */
export function mergeLiveSessionDetail(
  detail: SceneSessionDetailRecord,
  update: Pick<LiveSessionFeedResponse, "session" | "turns" | "events">,
): SceneSessionDetailRecord {
  const turns = [...detail.turns];
  const turnIndexById = new Map(turns.map((turn, index) => [turn.id, index]));
  for (const turn of update.turns) {
    const index = turnIndexById.get(turn.id);
    if (index == null) {
      turnIndexById.set(turn.id, turns.length);
      turns.push(turn);
    } else {
      turns[index] = turn;
    }
  }

  const eventIds = new Set(detail.events.map((event) => event.id));
  const events = [...detail.events];
  for (const event of update.events) {
    if (eventIds.has(event.id)) continue;
    eventIds.add(event.id);
    events.push(event);
  }

  return {
    ...detail,
    session: update.session,
    turns,
    events,
  };
}

export function newestLiveActivityMs(
  detail: Pick<SceneSessionDetailRecord, "turns" | "events">,
): number | null {
  let newest: number | null = null;
  for (const timestamp of [
    ...detail.turns.map((turn) => turn.updatedAt),
    ...detail.events.map((event) => event.createdAt),
  ]) {
    const value = Date.parse(timestamp);
    if (Number.isFinite(value) && (newest == null || value > newest)) {
      newest = value;
    }
  }
  return newest;
}
