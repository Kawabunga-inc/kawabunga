"use client";

/**
 * The SESSION PULSE — a cross-turn mini-map at the top of the conversation
 * rail: the authored arc with landed beats, and one chronological lane of
 * turn latency bars interleaved with journal markers (director decisions,
 * chronicler reflections, world events). Clicking anything selects it in
 * the rail/inspector below.
 */

import type { ReactNode } from "react";
import { C, FONT_BODY, FONT_MONO } from "@/components/session-workbench-theme";
import type { SessionJournalItem } from "@/components/session-journal";

export type PulseTurn = {
  id: string;
  at: number;
  index: number;
  speakerSlug: string | null;
  firstAudioMs: number | null;
  status: string;
};

export type SceneArcBeat = { label: string; summary?: string };

const LANE_HEIGHT = 44;
const BAR_MIN = 6;

function turnBarColor(turn: PulseTurn, isLive: boolean): string {
  if (turn.status === "error") return C.red;
  if (isLive && turn.status === "streaming") return C.mint;
  if (turn.status !== "completed" && turn.status !== "succeeded") return C.amber;
  return C.mint;
}

function Marker({
  title,
  selected,
  onClick,
  children,
}: {
  title: string;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        height: LANE_HEIGHT,
        padding: "0 1px",
        borderBottom: `2px solid ${selected ? C.mint : "transparent"}`,
      }}
    >
      {children}
    </button>
  );
}

export function SessionPulse({
  turns,
  journalItems,
  arc,
  arcLanded,
  activeTurnId,
  activeJournalId,
  onSelectTurn,
  onSelectJournalItem,
  isLive,
  onResumeFollowing,
}: {
  turns: PulseTurn[];
  journalItems: SessionJournalItem[];
  arc: SceneArcBeat[];
  arcLanded: string[];
  activeTurnId: string | null;
  activeJournalId: string | null;
  onSelectTurn: (id: string) => void;
  onSelectJournalItem: (item: SessionJournalItem) => void;
  isLive: boolean;
  onResumeFollowing: () => void;
}) {
  if (
    turns.length === 0 &&
    journalItems.length === 0 &&
    arc.length === 0 &&
    !isLive
  ) {
    return null;
  }

  const maxMs = Math.max(...turns.map((t) => t.firstAudioMs ?? 0), 1);
  const scale = (ms: number | null): number =>
    ms == null ? BAR_MIN : Math.max(BAR_MIN, Math.round((ms / maxMs) * (LANE_HEIGHT - 6)));

  // Which reflection landed each beat (for arc tooltips).
  const landedBy = new Map<string, number>();
  journalItems.forEach((item, i) => {
    if (item.kind === "reflection") {
      for (const label of item.landedAdded) landedBy.set(label.toLowerCase(), i);
    }
  });
  const landedSet = new Set(arcLanded.map((l) => l.toLowerCase()));

  const lane: Array<
    | { kind: "turn"; at: number; turn: PulseTurn }
    | { kind: "journal"; at: number; item: SessionJournalItem }
  > = [
    ...turns.map((turn) => ({ kind: "turn" as const, at: turn.at, turn })),
    ...journalItems.map((item) => ({ kind: "journal" as const, at: item.createdMs, item })),
  ].sort((a, b) => (a.at === b.at ? (a.kind === "journal" ? -1 : 1) : a.at - b.at));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-8)",
        border: `1px solid ${C.border}`,
        borderRadius: "var(--radius-xl)",
        background: C.panel,
        padding: "12px 16px",
        minWidth: 0,
      }}
    >
      {arc.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", letterSpacing: "0.16em", textTransform: "uppercase", color: C.textLow }}>
              Arc · {arcLanded.length}/{arc.length} landed
            </span>
          </div>
          <div style={{ display: "flex", gap: "var(--space-4)" }}>
            {arc.map((beat) => {
              const landed = landedSet.has(beat.label.toLowerCase());
              const reflectionIdx = landedBy.get(beat.label.toLowerCase());
              return (
                <div
                  key={beat.label}
                  title={
                    (beat.summary ?? beat.label) +
                    (landed
                      ? reflectionIdx != null
                        ? " — landed (chronicler)"
                        : " — landed"
                      : " — pending")
                  }
                  style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
                >
                  <span
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: "var(--font-size-xs)",
                      color: landed ? C.mint : C.textMid,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {beat.label}
                  </span>
                  <div
                    style={{
                      height: 3,
                      borderRadius: 2,
                      background: landed ? C.mint : C.panelStrong,
                      border: landed ? "none" : `1px solid ${C.borderStrong}`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {lane.length > 0 || isLive ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", letterSpacing: "0.16em", textTransform: "uppercase", color: C.textLow }}>
              Pulse · bars = first-audio (max {maxMs >= 1000 ? `${(maxMs / 1000).toFixed(1)}s` : `${maxMs}ms`})
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", color: C.textLow }}>
              ■ turn · ● director · ▲ chronicler · ◇ world
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 3,
              overflowX: "auto",
              paddingBottom: 2,
            }}
          >
            {lane.map((entry) => {
              if (entry.kind === "turn") {
                const { turn } = entry;
                return (
                  <Marker
                    key={turn.id}
                    title={`Turn ${turn.index + 1}${turn.speakerSlug ? ` · ${turn.speakerSlug}` : ""}${turn.firstAudioMs != null ? ` · first-audio ${turn.firstAudioMs}ms` : ""}${turn.status !== "completed" && turn.status !== "succeeded" ? ` · ${turn.status}` : ""}`}
                    selected={turn.id === activeTurnId}
                    onClick={() => onSelectTurn(turn.id)}
                  >
                    <div
                      style={{
                        width: 9,
                        height: scale(turn.firstAudioMs),
                        borderRadius: 2,
                        background: turnBarColor(turn, isLive),
                        border:
                          isLive && turn.status === "streaming"
                            ? `1px dashed ${C.mintMid}`
                            : "none",
                        opacity: turn.firstAudioMs == null ? 0.35 : 0.9,
                      }}
                    />
                  </Marker>
                );
              }
              const { item } = entry;
              const selected = item.id === activeJournalId;
              if (item.kind === "decision") {
                const troubled = item.degraded || item.failure != null;
                const hollow = item.action === "wait-for-user" || item.action === "end-scene";
                return (
                  <Marker
                    key={item.id}
                    title={`director · ${item.action}${item.speakerSlug ? ` ${item.speakerSlug}` : ""}${item.trigger ? ` · ${item.trigger}` : ""}${troubled ? " · degraded" : ""}${item.latencyMs != null ? ` · ${item.latencyMs}ms` : ""}`}
                    selected={selected}
                    onClick={() => onSelectJournalItem(item)}
                  >
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: hollow ? "transparent" : troubled ? C.amber : C.mint,
                        border: `1.5px solid ${troubled ? C.amber : C.mint}`,
                        marginBottom: 1,
                      }}
                    />
                  </Marker>
                );
              }
              if (item.kind === "reflection") {
                return (
                  <Marker
                    key={item.id}
                    title={`chronicler${item.error ? ` · failed: ${item.error}` : item.note ? ` · ${item.note}` : ""}`}
                    selected={selected}
                    onClick={() => onSelectJournalItem(item)}
                  >
                    <div
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: "5px solid transparent",
                        borderRight: "5px solid transparent",
                        borderBottom: `8px solid ${item.error ? C.red : C.amberDeep}`,
                        marginBottom: 1,
                      }}
                    />
                  </Marker>
                );
              }
              return (
                <Marker
                  key={item.id}
                  title={`world event armed · ${item.direction}${item.afterSeconds != null ? ` · ~${item.afterSeconds}s` : ""}`}
                  selected={selected}
                  onClick={() => onSelectJournalItem(item)}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      border: `1.5px solid ${C.amberDeep}`,
                      transform: "rotate(45deg)",
                      marginBottom: 2,
                    }}
                  />
                </Marker>
              );
            })}
            {isLive ? (
              <div
                aria-hidden="true"
                style={{
                  width: 9,
                  height: 20,
                  borderRadius: 2,
                  border: `1px dashed ${C.mintMid}`,
                  background: C.mintBg,
                  opacity: 0.45,
                  flexShrink: 0,
                  marginBottom: 2,
                }}
              />
            ) : null}
            {isLive ? (
              <button
                type="button"
                onClick={onResumeFollowing}
                title="Resume following live activity"
                style={{
                  all: "unset",
                  alignSelf: "stretch",
                  display: "flex",
                  alignItems: "center",
                  marginLeft: 6,
                  paddingLeft: 8,
                  borderLeft: `1px dashed ${C.mintGlow}`,
                  color: C.mint,
                  fontFamily: FONT_MONO,
                  fontSize: "var(--font-size-2xs)",
                  letterSpacing: "0.12em",
                  cursor: "pointer",
                }}
              >
                NOW
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
