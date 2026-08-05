"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SceneSessionTurnRecord } from "@kawabunga/db";
import {
  aggregateSessionJournalHealth,
  parseJournalItems,
  type JournalReflectionItem,
  type SessionJournalItem,
} from "@kawabunga/orchestration/journal-reader";
import type { SceneEndedLifecycleMessage } from "@kawabunga/types";
import { useSceneSessionJournal } from "@/hooks/use-scene-session-journal";
import { timedWorldEventSeconds } from "@/lib/scene-session-journal";
import { SceneViewToggle, type SceneView } from "./scene-view-toggle";
import styles from "./scene-player.module.css";

type Props = {
  sceneId: string;
  sessionId: string;
  title: string;
  elapsed: string;
  arcLength: number;
  adminBaseUrl: string;
  micLevel: number;
  view: SceneView;
  live: boolean;
  lifecycleEnd: SceneEndedLifecycleMessage | null;
  lifecycleAt: number | null;
  onSettled(): void;
  onViewChange(view: SceneView): void;
  onLeave(): void;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function firstAudioMs(turn: SceneSessionTurnRecord): number | null {
  const audio = record(turn.audioMetrics);
  const latency = record(turn.latencySummary);
  const value = audio?.firstAudioMs ?? audio?.firstAudio ?? latency?.firstAudioMs ?? latency?.firstAudio;
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function metric(turn: SceneSessionTurnRecord, names: string[]): number | null {
  const sources = [record(turn.latencySummary), record(turn.audioMetrics), record(turn.metadata)];
  for (const source of sources) {
    for (const name of names) {
      const value = source?.[name];
      if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    }
  }
  return null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function ago(timestamp: string | null, now: number): string {
  if (!timestamp) return "—";
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms) ? `${Math.max(0, Math.floor((now - ms) / 1000))}s` : "—";
}

function clock(timestamp: string): string {
  const ms = Date.parse(timestamp);
  return Number.isFinite(ms)
    ? new Date(ms).toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" })
    : "—";
}

function TurnRows({ turn }: { turn: SceneSessionTurnRecord }) {
  const partial = turn.status === "streaming";
  const sttMs = metric(turn, ["sttMs", "transcriptionMs"]);
  const ttsPercent = metric(turn, ["ttsPercent", "audioPercent"]);
  return (
    <>
      {turn.userText ? (
        <div className={styles.journalRow}>
          <time>{clock(turn.startedAt)}</time><b>YOU</b><p>{turn.userText}</p>
          {sttMs == null ? null : <span>stt {sttMs}ms</span>}
        </div>
      ) : null}
      {turn.assistantText ? (
        <div className={`${styles.journalRow} ${partial ? styles.journalStreaming : ""}`}>
          <time>{clock(turn.updatedAt)}</time><b>{turn.speakerSlug ?? "AGENT"}</b>
          <p>{turn.assistantText}{partial ? " ▍" : ""}</p>
          {partial ? <span>● STREAMING{ttsPercent == null ? "" : ` · tts ${ttsPercent}%`}</span> : null}
        </div>
      ) : null}
    </>
  );
}

function JournalRow({ item }: { item: SessionJournalItem }) {
  if (item.kind === "decision") {
    return (
      <div className={styles.journalRow}>
        <time>{clock(item.createdAt)}</time><b>DIRECTOR</b>
        <p>{item.action}{item.speakerSlug ? ` · ${item.speakerSlug}` : ""}{item.beat ? ` · ${item.beat}` : ""}</p>
        <span>{item.speculation?.outcome === "hit" ? "SPEC HIT · " : ""}{item.degraded ? "DEGRADED · " : ""}{item.latencyMs == null ? "—" : `${item.latencyMs}ms`}</span>
      </div>
    );
  }
  if (item.kind === "reflection") {
    return (
      <div className={styles.journalRow}>
        <time>{clock(item.createdAt)}</time><b>REFLECTION</b>
        <p>{item.error ? `failed · ${item.error}` : item.note ?? "chronicle updated"}</p>
      </div>
    );
  }
  return (
    <div className={styles.journalRow}>
      <time>{clock(item.createdAt)}</time><b>WORLD EVENT</b><p>{item.direction}</p>
      <span>{item.afterSeconds == null ? "armed" : `+${item.afterSeconds}s`}</span>
    </div>
  );
}

export function SceneSessionView(props: Props) {
  const journal = useSceneSessionJournal({
    sceneId: props.sceneId,
    sessionId: props.sessionId,
    open: true,
    live: props.live,
    settle: Boolean(props.lifecycleEnd),
    onSettled: props.onSettled,
  });
  const [now, setNow] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [journal.events.length, journal.turns.length, props.lifecycleEnd]);

  const items = useMemo(() => parseJournalItems(journal.events), [journal.events]);
  const timeline = useMemo(() => [
    ...journal.turns.map((turn) => ({ kind: "turn" as const, at: Date.parse(turn.startedAt), turn })),
    ...items.map((item) => ({ kind: "journal" as const, at: item.createdMs, item })),
  ].sort((a, b) => a.at - b.at), [items, journal.turns]);
  const health = useMemo(() => aggregateSessionJournalHealth(journal.events), [journal.events]);
  const reflection = [...items].reverse().find((item): item is JournalReflectionItem => item.kind === "reflection");
  const snapshot = record(record(journal.session?.currentScene)?.sceneState) ?? {};
  const landed = list(snapshot.arcLanded).length;
  const firstAudio = median(journal.turns.map(firstAudioMs).filter((value): value is number => value != null));
  const lastAt = [journal.session?.lastActiveAt, journal.events.at(-1)?.createdAt, journal.turns.at(-1)?.updatedAt]
    .filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const chronicle = reflection?.chronicleAfter;
  const armedWorldEvent = [...items].reverse().find((item) => item.kind === "world-event");
  const timed = chronicle?.timed[0] ?? null;
  const countdown = timed && reflection
    ? timedWorldEventSeconds(reflection.createdAt, timed.afterSeconds, now)
    : null;
  const timedDirection = timed?.direction ??
    (armedWorldEvent?.kind === "world-event" ? armedWorldEvent.direction : "—");
  const workbenchHref = `${props.adminBaseUrl.replace(/\/$/, "")}/sessions/${encodeURIComponent(props.sessionId)}`;

  return (
    <section className={styles.sessionView} aria-label="Live scene session instrumentation">
      <header className={styles.topbar}>
        <p>{props.title}</p>
        <SceneViewToggle value={props.view} staff onChange={props.onViewChange} />
        <div className={styles.topbarActions}>
          <time suppressHydrationWarning>{props.elapsed}</time>
          <button type="button" onClick={props.onLeave}>Leave quietly</button>
        </div>
      </header>

      <div className={styles.sessionHealth}>
        <p><i /> {props.live ? "live" : "ended"} · last event {ago(lastAt, now)}</p>
        <span>turn {journal.turns.length}</span><span>decisions {health.decisionCount}</span>
        <span>spec hit {health.specHitRate == null ? "—" : `${Math.round(health.specHitRate * 100)}%`}</span>
        <span>degraded {health.degradedCount} ({health.recoveredCount}r)</span>
        <span>p50 first-audio {firstAudio == null ? "—" : `${firstAudio}ms`}</span>
        <span>reflections {health.reflectionCount}</span><span>arc {landed}/{props.arcLength}</span>
        <a href={workbenchHref} target="_blank" rel="noreferrer">Open full workbench →</a>
      </div>

      <div className={styles.sessionGrid}>
        <section className={styles.journalPanel}>
          <header><p>SESSION JOURNAL</p><span>following</span></header>
          <div className={styles.journalViewport} ref={viewportRef} aria-live="polite">
            {!journal.turns.length && !items.length ? <p className={styles.journalEmpty}>Waiting for the first recorded turn…</p> : null}
            {timeline.map((entry) => entry.kind === "turn"
              ? <TurnRows key={`turn:${entry.turn.id}`} turn={entry.turn} />
              : <JournalRow key={`event:${entry.item.id}`} item={entry.item} />)}
            {props.lifecycleEnd ? (
              <div className={`${styles.journalRow} ${styles.journalEnded}`}>
                <time>{clock(new Date(props.lifecycleAt ?? now).toISOString())}</time><b>LIFECYCLE</b>
                <p>scene ended · {props.lifecycleEnd.reason}</p>
              </div>
            ) : null}
          </div>
        </section>

        <aside className={styles.statePanel}>
          <section><header><p>SCENE STATE</p><span>live snapshot</span></header>
            <dl>
              <div><dt>beat</dt><dd>{typeof snapshot.beat === "string" ? snapshot.beat : "—"}</dd></div>
              <div><dt>present</dt><dd>{list(snapshot.presentCharacterSlugs).join(", ") || "—"}</dd></div>
              <div><dt>turn index</dt><dd>{typeof snapshot.turnIndex === "number" ? snapshot.turnIndex : "—"}</dd></div>
              <div><dt>arc</dt><dd><span className={styles.arcSegments} aria-label={`${landed} of ${props.arcLength} arc beats landed`}>{Array.from({ length: props.arcLength }, (_, index) => <i key={index} data-landed={index < landed} />)}</span>{landed}/{props.arcLength}</dd></div>
              <div><dt>director note</dt><dd className={styles.directorNote}>{typeof snapshot.directorNote === "string" ? snapshot.directorNote : reflection?.note ?? "—"}</dd></div>
            </dl>
          </section>
          <section><header><p>CHRONICLE</p><span>latest reflection</span></header>
            <div className={styles.chronicleBlock}><b>OPEN THREADS</b>{chronicle?.threads.length ? chronicle.threads.map((thread) => <p key={thread}>• {thread}</p>) : <p>—</p>}</div>
            <div className={styles.chronicleBlock}><b>INTENTS</b>{chronicle?.intents.length ? chronicle.intents.map((intent) => <p key={`${intent.trigger}:${intent.direction}`}>{intent.trigger} → {intent.direction}</p>) : <p>—</p>}</div>
            <div className={styles.chronicleBlock} title="Countdown is anchored to the latest reflection and may vary by the ~2s polling interval"><b>TIMED WORLD EVENT</b><p>{timedDirection}</p>{countdown != null ? <strong>{countdown > 0 ? `due ${countdown}s` : "due now"}</strong> : null}</div>
          </section>
        </aside>
      </div>

      <p className={styles.sessionFootnote}>admin only · read-only · the visitor never sees this view</p>
      <div className={`${styles.micPill} ${props.micLevel > 0.12 ? styles.micActive : ""}`}>
        <span aria-hidden="true" /><p>Listening — the scene continues while you debug</p>
      </div>
      {journal.error ? <p className={styles.sessionError}>{journal.error}</p> : null}
    </section>
  );
}
