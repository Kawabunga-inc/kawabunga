import type {
  SceneSessionEventRecord,
  SceneSessionRecord,
  SceneSessionTurnRecord,
} from "@kawabunga/db";
import {
  aggregateSessionJournalHealth,
  type SessionJournalHealth,
} from "./session-journal-health";

type JsonRecord = Record<string, unknown>;

export type SessionHealthRollup = SessionJournalHealth & {
  turnCount: number;
  durationLabel: string;
  p50FirstAudioMs: number | null;
  /** null when the scene has no authored arc. */
  arcLandedCount: number | null;
};

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
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
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

/** Shared turn/journal/snapshot aggregation used by both session list views. */
export function aggregateSessionHealthRollup(
  session: SceneSessionRecord,
  turns: SceneSessionTurnRecord[],
  events: SceneSessionEventRecord[],
  hasArc: boolean,
): SessionHealthRollup {
  let arcLandedCount: number | null = null;
  if (hasArc) {
    const snapshotState = asRecord(asRecord(session.currentScene)?.sceneState);
    const fromSnapshot = Array.isArray(snapshotState?.arcLanded)
      ? snapshotState.arcLanded.filter((value) => typeof value === "string").length
      : 0;
    let fromJournal = 0;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]!;
      if (!event.type.startsWith("scene.decision.")) continue;
      const nextState = asRecord(asRecord(event.payload)?.nextSceneState);
      if (Array.isArray(nextState?.arcLanded)) {
        fromJournal = nextState.arcLanded.filter(
          (value) => typeof value === "string",
        ).length;
        break;
      }
    }
    arcLandedCount = Math.max(fromSnapshot, fromJournal);
  }

  return {
    turnCount: turns.length,
    durationLabel: durationLabel(session),
    p50FirstAudioMs: median(
      turns.map(firstAudioMsOf).filter((value): value is number => value != null),
    ),
    ...aggregateSessionJournalHealth(events),
    arcLandedCount,
  };
}
