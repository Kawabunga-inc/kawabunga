import type { SceneSessionEventRecord } from "@kawabunga/db";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

export type JournalChronicle = {
  story: string;
  threads: string[];
  world: string[];
  intents: { trigger: string; direction: string }[];
  timed: { afterSeconds: number; direction: string }[];
  drafts: string[];
};

function asChronicle(value: unknown): JournalChronicle | null {
  const raw = asRecord(value);
  if (!raw) return null;
  return {
    story: str(raw.story) ?? "",
    threads: strList(raw.threads),
    world: strList(raw.world),
    intents: (Array.isArray(raw.intents) ? raw.intents : [])
      .map((entry) => {
        const record = asRecord(entry);
        const trigger = str(record?.trigger);
        const direction = str(record?.direction);
        return trigger && direction ? { trigger, direction } : null;
      })
      .filter((entry): entry is { trigger: string; direction: string } => entry !== null),
    timed: (Array.isArray(raw.timed) ? raw.timed : [])
      .map((entry) => {
        const record = asRecord(entry);
        const afterSeconds = num(record?.afterSeconds);
        const direction = str(record?.direction);
        return afterSeconds != null && direction ? { afterSeconds, direction } : null;
      })
      .filter((entry): entry is { afterSeconds: number; direction: string } => entry !== null),
    drafts: strList(raw.drafts),
  };
}

export type JournalSceneState = {
  beat: string | null;
  presentCharacterSlugs: string[];
  ambience: string | null;
  lastSpeakerSlug: string | null;
  turnIndex: number | null;
  directorNote: string | null;
  arcLanded: string[];
};

function asSceneState(value: unknown): JournalSceneState | null {
  const raw = asRecord(value);
  if (!raw) return null;
  return {
    beat: str(raw.beat),
    presentCharacterSlugs: strList(raw.presentCharacterSlugs),
    ambience: str(raw.ambience),
    lastSpeakerSlug: str(raw.lastSpeakerSlug),
    turnIndex: num(raw.turnIndex),
    directorNote: str(raw.directorNote),
    arcLanded: strList(raw.arcLanded),
  };
}

export type JournalDecisionItem = {
  kind: "decision";
  id: string;
  createdAt: string;
  createdMs: number;
  eventType: string;
  action: string;
  speakerSlug: string | null;
  trigger: string | null;
  userText: string | null;
  latencyMs: number | null;
  provider: string | null;
  model: string | null;
  degraded: boolean;
  reason: string | null;
  failure: string | null;
  recovered: string | null;
  cascadeDepth: number | null;
  worldEventDirective: string | null;
  speculation: { outcome: string; basedOnText: string | null; waitedMs: number | null } | null;
  beat: string | null;
  sceneCue: string | null;
  previousState: JournalSceneState | null;
  nextState: JournalSceneState | null;
  decisionRaw: unknown;
};

export type JournalReflectionItem = {
  kind: "reflection";
  id: string;
  createdAt: string;
  createdMs: number;
  model: string | null;
  latencyMs: number | null;
  raw: string | null;
  note: string | null;
  factsAdded: string[];
  landedAdded: string[];
  gone: string[];
  chronicleBefore: JournalChronicle | null;
  chronicleAfter: JournalChronicle | null;
  spokenTurns: number | null;
  error: string | null;
};

export type JournalWorldEventItem = {
  kind: "world-event";
  id: string;
  createdAt: string;
  createdMs: number;
  direction: string;
  afterSeconds: number | null;
  dueAt: string | null;
};

export type SessionJournalItem =
  | JournalDecisionItem
  | JournalReflectionItem
  | JournalWorldEventItem;

/** Defensive, transport-neutral reader shared by admin and consumer staff views. */
export function parseJournalItems(events: SceneSessionEventRecord[]): SessionJournalItem[] {
  const items: SessionJournalItem[] = [];
  for (const event of events) {
    const payload = asRecord(event.payload) ?? {};
    const createdMs = Date.parse(event.createdAt);
    const base = {
      id: event.id,
      createdAt: event.createdAt,
      createdMs: Number.isFinite(createdMs) ? createdMs : 0,
    };
    if (event.type.startsWith("scene.decision.")) {
      const decision = asRecord(payload.decision);
      const speculation = asRecord(payload.speculation);
      const orchestrator = asRecord(payload.orchestrator);
      items.push({
        kind: "decision",
        ...base,
        eventType: event.type,
        action: str(payload.action) ?? event.type.replace("scene.decision.", ""),
        speakerSlug: str(payload.speakerSlug),
        trigger: str(payload.trigger),
        userText: str(payload.userText),
        latencyMs: num(payload.latencyMs),
        provider: str(payload.provider) ?? str(orchestrator?.provider),
        model: str(payload.model) ?? str(orchestrator?.model),
        degraded: payload.degraded === true,
        reason: str(payload.reason),
        failure: str(payload.failure),
        recovered: str(payload.recovered),
        cascadeDepth: num(payload.cascadeDepth),
        worldEventDirective: str(payload.worldEventDirective),
        speculation: speculation
          ? {
              outcome: str(speculation.outcome) ?? "none",
              basedOnText: str(speculation.basedOnText),
              waitedMs: num(speculation.waitedMs),
            }
          : null,
        beat: str(decision?.beat),
        sceneCue: str(decision?.sceneCue),
        previousState: asSceneState(payload.previousSceneState),
        nextState: asSceneState(payload.nextSceneState),
        decisionRaw: payload.decision ?? null,
      });
    } else if (event.type === "scene.reflection") {
      items.push({
        kind: "reflection",
        ...base,
        model: str(payload.model),
        latencyMs: num(payload.latencyMs),
        raw: str(payload.raw),
        note: str(payload.note),
        factsAdded: strList(payload.factsAdded),
        landedAdded: strList(payload.landedAdded),
        gone: strList(payload.gone),
        chronicleBefore: asChronicle(payload.chronicleBefore),
        chronicleAfter: asChronicle(payload.chronicleAfter),
        spokenTurns: num(payload.spokenTurns),
        error: str(payload.error),
      });
    } else if (event.type === "scene.world-event.armed") {
      const direction = str(payload.direction);
      if (direction) {
        items.push({
          kind: "world-event",
          ...base,
          direction,
          afterSeconds: num(payload.afterSeconds),
          dueAt: str(payload.dueAt),
        });
      }
    }
  }
  return items.sort((a, b) => a.createdMs - b.createdMs);
}

export type SessionJournalHealth = {
  decisionCount: number;
  degradedCount: number;
  recoveredCount: number;
  specHitRate: number | null;
  avgDecisionMs: number | null;
  reflectionCount: number;
  reflectionFailures: number;
};

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
      if (payload.degraded === true || typeof payload.failure === "string") degradedCount += 1;
      if (typeof payload.recovered === "string") recoveredCount += 1;
      const speculation = asRecord(payload.speculation);
      if (speculation?.outcome === "hit") {
        specHits += 1;
        specTotal += 1;
      } else if (speculation?.outcome === "miss") {
        specTotal += 1;
      }
      if (typeof payload.latencyMs === "number" && Number.isFinite(payload.latencyMs)) {
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
      ? Math.round(decisionLatencies.reduce((sum, value) => sum + value, 0) / decisionLatencies.length)
      : null,
    reflectionCount,
    reflectionFailures,
  };
}
