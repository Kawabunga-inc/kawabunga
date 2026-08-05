import type { SceneSessionTurnRecord } from "@kawabunga/db";
import type {
  JournalDecisionItem,
  JournalReflectionItem,
  SessionJournalItem,
} from "@/components/session-journal";

export type CausalityGraph = {
  decisionByTurnId: Map<string, JournalDecisionItem>;
  turnByDecisionId: Map<string, SceneSessionTurnRecord>;
  reflectionByTurnId: Map<string, JournalReflectionItem>;
  turnsByReflectionId: Map<string, SceneSessionTurnRecord[]>;
};

export type CausalEntityKind = "turn" | "decision" | "reflection";

export function directorClockSlice(decision: JournalDecisionItem) {
  const outcome = decision.speculation?.outcome ?? "none";
  const ranDuringEndpointHold = outcome === "hit";
  return {
    outcome,
    ranDuringEndpointHold,
    durationMs: Math.max(
      ranDuringEndpointHold
        ? decision.speculation?.waitedMs ?? 0
        : decision.latencyMs ?? 0,
      1,
    ),
    fullLatencyMs: decision.latencyMs,
  };
}

/** Every causal entry point opens the tab that owns its primary evidence. */
export function inspectorAnchorFor(kind: CausalEntityKind) {
  if (kind === "decision") return "director" as const;
  if (kind === "reflection") return "chronicle" as const;
  return "pipeline" as const;
}

/** One-based ordinal among journal items of the same kind. */
export function journalOrdinal(
  items: SessionJournalItem[],
  target: JournalDecisionItem | JournalReflectionItem,
) {
  const peers = items.filter((item) => item.kind === target.kind);
  const index = peers.findIndex((item) => item.id === target.id);
  return index >= 0 ? index + 1 : null;
}

/**
 * Join independently persisted turn, director, and chronicler records.
 *
 * Director decisions prefer the journal contract's exact state index. Older
 * journal rows did not always carry that snapshot, so unmatched turns fall
 * back to the nearest unused preceding speak/narrate decision.
 *
 * A reflection reviews at most three completed turns: the selected turn plus
 * no more than two later completions. This keeps "following reflection" local
 * and makes the inverse reflection window deterministic without inventing a
 * relationship for a distant or pre-journal turn.
 */
export function buildTurnCausality(
  turns: SceneSessionTurnRecord[],
  items: SessionJournalItem[],
): CausalityGraph {
  const orderedTurns = [...turns].sort(
    (a, b) => timestamp(a.startedAt) - timestamp(b.startedAt),
  );
  const decisions = items
    .filter(
      (item): item is JournalDecisionItem =>
        item.kind === "decision" &&
        (item.action === "speak" || item.action === "narrate"),
    )
    .sort((a, b) => a.createdMs - b.createdMs);
  const reflections = items
    .filter(
      (item): item is JournalReflectionItem => item.kind === "reflection",
    )
    .sort((a, b) => a.createdMs - b.createdMs);

  const decisionByTurnId = new Map<string, JournalDecisionItem>();
  const turnByDecisionId = new Map<string, SceneSessionTurnRecord>();
  const usedDecisionIds = new Set<string>();

  for (const turn of orderedTurns) {
    if (turn.turnIndex == null) continue;
    const exact = decisions.find(
      (decision) =>
        !usedDecisionIds.has(decision.id) &&
        decision.nextState?.turnIndex === turn.turnIndex,
    );
    if (exact) linkDecision(turn, exact);
  }

  for (const turn of orderedTurns) {
    if (decisionByTurnId.has(turn.id)) continue;
    const turnStartedMs = timestamp(turn.startedAt);
    const fallback = [...decisions]
      .reverse()
      .find(
        (decision) =>
          !usedDecisionIds.has(decision.id) &&
          decision.createdMs <= turnStartedMs,
      );
    if (fallback) linkDecision(turn, fallback);
  }

  const reflectionByTurnId = new Map<string, JournalReflectionItem>();
  const turnsByReflectionId = new Map<string, SceneSessionTurnRecord[]>();
  const completedTurns = orderedTurns.filter(
    (turn) => turn.completedAt && Number.isFinite(timestamp(turn.completedAt)),
  );

  for (let turnIndex = 0; turnIndex < completedTurns.length; turnIndex += 1) {
    const turn = completedTurns[turnIndex]!;
    const completedMs = timestamp(turn.completedAt!);
    const following = reflections.find((reflection) => {
      if (reflection.createdMs < completedMs) return false;
      const laterCompletions = completedTurns
        .slice(turnIndex + 1)
        .filter(
          (candidate) =>
            timestamp(candidate.completedAt!) <= reflection.createdMs,
        ).length;
      return laterCompletions <= 2;
    });
    if (!following) continue;
    reflectionByTurnId.set(turn.id, following);
    const window = turnsByReflectionId.get(following.id) ?? [];
    window.push(turn);
    turnsByReflectionId.set(following.id, window);
  }

  return {
    decisionByTurnId,
    turnByDecisionId,
    reflectionByTurnId,
    turnsByReflectionId,
  };

  function linkDecision(
    turn: SceneSessionTurnRecord,
    decision: JournalDecisionItem,
  ) {
    decisionByTurnId.set(turn.id, decision);
    turnByDecisionId.set(decision.id, turn);
    usedDecisionIds.add(decision.id);
  }
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
