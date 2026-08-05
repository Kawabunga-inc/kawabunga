import type {
  SceneSessionEventRecord,
  SceneSessionRecord,
  SceneSessionTurnRecord,
} from "@kawabunga/db";

export type SceneSessionJournalFeed = {
  session: SceneSessionRecord;
  turns: SceneSessionTurnRecord[];
  events: SceneSessionEventRecord[];
  cursors: { turns: string | null; events: string | null };
  truncated: { turns: boolean; events: boolean };
  serverTime: string;
};

export type SceneSessionJournalState = {
  session: SceneSessionRecord | null;
  turns: SceneSessionTurnRecord[];
  events: SceneSessionEventRecord[];
  cursors: SceneSessionJournalFeed["cursors"];
};

export const EMPTY_SCENE_SESSION_JOURNAL: SceneSessionJournalState = {
  session: null,
  turns: [],
  events: [],
  cursors: { turns: null, events: null },
};

/** Turns mutate while streaming; events are immutable and append-only. */
export function mergeSceneSessionJournal(
  current: SceneSessionJournalState,
  incoming: SceneSessionJournalFeed,
): SceneSessionJournalState {
  const turns = new Map(current.turns.map((turn) => [turn.id, turn]));
  for (const turn of incoming.turns) turns.set(turn.id, turn);
  const events = new Map(current.events.map((event) => [event.id, event]));
  for (const event of incoming.events) events.set(event.id, event);
  return {
    session: incoming.session,
    turns: [...turns.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    events: [...events.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    cursors: incoming.cursors,
  };
}

export function shouldPollSceneSessionJournal(input: {
  open: boolean;
  visible: boolean;
  live: boolean;
}): boolean {
  return input.open && input.visible && input.live;
}

/** Client-side countdown anchored to the reflection that authored the event. */
export function timedWorldEventSeconds(
  reflectionCreatedAt: string,
  afterSeconds: number,
  nowMs: number,
): number | null {
  const reflectionMs = Date.parse(reflectionCreatedAt);
  if (!Number.isFinite(reflectionMs) || !Number.isFinite(afterSeconds)) return null;
  return Math.max(0, Math.ceil((reflectionMs + afterSeconds * 1_000 - nowMs) / 1_000));
}
