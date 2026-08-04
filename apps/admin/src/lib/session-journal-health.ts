import type { SceneSessionEventRecord } from "@kawabunga/db";

type JsonRecord = Record<string, unknown>;

export type SessionJournalHealth = {
  decisionCount: number;
  degradedCount: number;
  recoveredCount: number;
  specHitRate: number | null;
  avgDecisionMs: number | null;
  reflectionCount: number;
  reflectionFailures: number;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

/** Shared journal health rollup for scene summaries and the live workbench. */
export function aggregateSessionJournalHealth(
  events: SceneSessionEventRecord[],
): SessionJournalHealth {
  let decisionCount = 0;
  let degradedCount = 0;
  let recoveredCount = 0;
  let specHits = 0;
  let specTotal = 0;
  const decisionLatencies: number[] = [];
  let reflectionCount = 0;
  let reflectionFailures = 0;

  for (const event of events) {
    const payload = asRecord(event.payload) ?? {};
    if (event.type.startsWith("scene.decision.")) {
      decisionCount += 1;
      if (payload.degraded === true || typeof payload.failure === "string") {
        degradedCount += 1;
      }
      if (typeof payload.recovered === "string") recoveredCount += 1;

      const speculation = asRecord(payload.speculation);
      if (speculation?.outcome === "hit") {
        specHits += 1;
        specTotal += 1;
      } else if (speculation?.outcome === "miss") {
        specTotal += 1;
      }

      if (
        typeof payload.latencyMs === "number" &&
        Number.isFinite(payload.latencyMs)
      ) {
        decisionLatencies.push(payload.latencyMs);
      }
    } else if (event.type === "scene.reflection") {
      reflectionCount += 1;
      if (typeof payload.error === "string") reflectionFailures += 1;
    }
  }

  return {
    decisionCount,
    degradedCount,
    recoveredCount,
    specHitRate: specTotal > 0 ? specHits / specTotal : null,
    avgDecisionMs: decisionLatencies.length
      ? Math.round(
          decisionLatencies.reduce((sum, value) => sum + value, 0) /
            decisionLatencies.length,
        )
      : null,
    reflectionCount,
    reflectionFailures,
  };
}
