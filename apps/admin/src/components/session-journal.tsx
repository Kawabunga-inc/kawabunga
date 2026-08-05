"use client";

/**
 * The scene journal, rendered — rail rows and inspector panels for the
 * Narrator's flight recorder (scene_session_events written by the voice
 * agent's SceneDriver and the admin orchestrate route; see
 * packages/orchestration/src/journal.ts for the payload contract).
 *
 * Defensive by design: payloads are untrusted JSON from two transports and
 * multiple journal versions — every read is optional-chained and falls back
 * to "—" rather than throwing inside the workbench.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { SceneSessionEventRecord } from "@kawabunga/db";
import { C, FONT_BODY, FONT_MONO } from "@/components/session-workbench-theme";

// ───────────── Parsing ─────────────

export {
  parseJournalItems,
  type JournalChronicle,
  type JournalDecisionItem,
  type JournalReflectionItem,
  type JournalWorldEventItem,
  type SessionJournalItem,
} from "@kawabunga/orchestration/journal-reader";
import {
  parseJournalItems,
  type JournalDecisionItem,
  type JournalReflectionItem,
  type SessionJournalItem,
} from "@kawabunga/orchestration/journal-reader";

// ───────────── Live feed ─────────────

const JOURNAL_POLL_MS = 2000;

/**
 * Poll the session's journal events while `live` — the sandbox's window
 * into the Narrator's mind during a run. Both transports persist to
 * scene_session_events, so this sees voice-agent sessions and browser
 * sessions alike. One final fetch fires when `live` flips false so the
 * panel settles on the complete record.
 */
export function useSessionJournal(
  sessionId: string,
  { live }: { live: boolean },
): { items: SessionJournalItem[]; error: string | null } {
  const [items, setItems] = useState<SessionJournalItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetch(
          `/api/scene-sessions/${encodeURIComponent(sessionId)}/events?prefix=scene.`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`journal fetch failed (${res.status})`);
        const payload = (await res.json()) as { events?: SceneSessionEventRecord[] };
        if (!cancelled) {
          setItems(parseJournalItems(payload.events ?? []));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        inFlight.current = false;
      }
    };
    void fetchOnce();
    if (!live) return () => { cancelled = true; };
    const timer = window.setInterval(() => void fetchOnce(), JOURNAL_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId, live]);

  return { items, error };
}

// ───────────── Shared bits ─────────────

function Chip({
  children,
  color,
  bg,
  title,
}: {
  children: ReactNode;
  color: string;
  bg?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        fontFamily: FONT_MONO,
        fontSize: "var(--font-size-xs)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        background: bg ?? "transparent",
        border: bg ? "none" : `1px solid ${C.borderStrong}`,
        borderRadius: "var(--radius-pill)",
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

const TRIGGER_LABELS: Record<string, string> = {
  "user-turn": "user turn",
  "scene-open": "scene open",
  proactive: "silence tick",
  chain: "narrate→react",
  momentum: "momentum",
  "world-event": "world event",
  player: "player loop",
};

function actionColor(action: string): string {
  if (action === "speak") return C.mint;
  if (action === "narrate") return C.amber;
  if (action === "end-scene") return C.red;
  return C.textMid;
}

// ───────────── Rail rows ─────────────

/** One journal item in the conversation rail — compact, selectable. */
export function JournalRailRow({
  item,
  selected,
  onSelect,
}: {
  item: SessionJournalItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const border = selected ? C.mintMid : C.borderSoft;
  const rowStyle = {
    all: "unset",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "var(--space-8)",
    padding: "7px 18px",
    borderLeft: `2px solid ${selected ? C.mint : "transparent"}`,
    borderTop: `1px solid ${border}`,
    background: selected ? C.mintBg : "transparent",
    minWidth: 0,
    flexWrap: "wrap" as const,
  } as const;

  if (item.kind === "decision") {
    return (
      <button type="button" onClick={onSelect} style={rowStyle}>
        <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", letterSpacing: "0.14em", color: C.textLow, textTransform: "uppercase", flexShrink: 0 }}>
          director
        </span>
        <Chip color={actionColor(item.action)}>{item.action}</Chip>
        {item.speakerSlug ? (
          <span style={{ fontFamily: FONT_BODY, fontSize: "var(--font-size-sm)", color: C.textHigh }}>{item.speakerSlug}</span>
        ) : null}
        {item.trigger && item.trigger !== "user-turn" ? (
          <Chip color={C.textMid}>{TRIGGER_LABELS[item.trigger] ?? item.trigger}</Chip>
        ) : null}
        {item.cascadeDepth != null ? <Chip color={C.textMid}>beat {item.cascadeDepth}</Chip> : null}
        {item.speculation?.outcome === "hit" ? (
          <Chip color={C.greenDot} title={`speculation hit — waited ${item.speculation.waitedMs ?? "?"}ms`}>spec hit</Chip>
        ) : null}
        {item.speculation?.outcome === "miss" ? (
          <Chip color={C.amber} title="speculation missed — orchestrated on the final transcript">spec miss</Chip>
        ) : null}
        {item.degraded || item.failure ? (
          <Chip color={C.amber} bg={C.amberSoft} title={item.failure ?? item.reason ?? undefined}>degraded</Chip>
        ) : null}
        {item.recovered ? (
          <Chip color={C.mint} bg={C.mintSoft} title={`recovered: ${item.recovered}`}>{item.recovered}</Chip>
        ) : null}
        <span style={{ marginLeft: "auto", fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", color: C.textLow, flexShrink: 0 }}>
          {item.latencyMs != null ? `${item.latencyMs}ms` : ""}
        </span>
      </button>
    );
  }

  if (item.kind === "reflection") {
    const summary = item.error
      ? `failed — ${item.error}`
      : (item.note ?? "no note");
    const counts = [
      item.factsAdded.length ? `+${item.factsAdded.length} fact${item.factsAdded.length > 1 ? "s" : ""}` : null,
      item.landedAdded.length ? `+${item.landedAdded.length} beat${item.landedAdded.length > 1 ? "s" : ""}` : null,
      item.gone.length ? `${item.gone.length} gone` : null,
    ].filter(Boolean);
    return (
      <button type="button" onClick={onSelect} style={rowStyle}>
        <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", letterSpacing: "0.14em", color: item.error ? C.red : C.amberDeep, textTransform: "uppercase", flexShrink: 0 }}>
          chronicler
        </span>
        <span
          style={{
            fontFamily: FONT_BODY,
            fontSize: "var(--font-size-sm)",
            color: item.error ? C.red : C.textHigh,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: 1,
          }}
        >
          {summary}
        </span>
        {counts.map((c) => (
          <Chip key={c as string} color={C.textMid}>{c}</Chip>
        ))}
        <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", color: C.textLow, flexShrink: 0 }}>
          {item.latencyMs != null ? `${(item.latencyMs / 1000).toFixed(1)}s` : ""}
        </span>
      </button>
    );
  }

  return (
    <button type="button" onClick={onSelect} style={rowStyle}>
      <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", letterSpacing: "0.14em", color: C.amberDeep, textTransform: "uppercase", flexShrink: 0 }}>
        world event armed
      </span>
      <span style={{ fontFamily: FONT_BODY, fontSize: "var(--font-size-sm)", color: C.textHigh, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
        {item.direction}
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", color: C.textLow, flexShrink: 0 }}>
        {item.afterSeconds != null ? `~${item.afterSeconds}s` : ""}
      </span>
    </button>
  );
}

// ───────────── Inspector panels ─────────────

function Panel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: "var(--radius-xl)",
        background: C.panel,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-10)",
        minWidth: 0,
      }}
    >
      {children}
    </div>
  );
}

function PanelEyebrow({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: "var(--font-size-xs)",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: color ?? C.textLow,
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "var(--space-10)", alignItems: "baseline", minWidth: 0 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", letterSpacing: "0.1em", textTransform: "uppercase", color: C.textLow, flex: "0 0 128px" }}>
        {label}
      </span>
      <span style={{ fontFamily: FONT_BODY, fontSize: "var(--font-size-sm)", color: C.textHigh, minWidth: 0, overflowWrap: "anywhere" }}>
        {children}
      </span>
    </div>
  );
}

function DiffRow({ label, before, after }: { label: string; before: string; after: string }) {
  const changed = before !== after;
  return (
    <div style={{ display: "flex", gap: "var(--space-10)", alignItems: "baseline", minWidth: 0 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", letterSpacing: "0.1em", textTransform: "uppercase", color: C.textLow, flex: "0 0 128px" }}>
        {label}
      </span>
      {changed ? (
        <span style={{ fontFamily: FONT_BODY, fontSize: "var(--font-size-sm)", minWidth: 0, overflowWrap: "anywhere" }}>
          <span style={{ color: C.textMid, textDecoration: "line-through", textDecorationColor: C.red }}>{before}</span>
          <span style={{ color: C.textLow }}> → </span>
          <span style={{ color: C.mint }}>{after}</span>
        </span>
      ) : (
        <span style={{ fontFamily: FONT_BODY, fontSize: "var(--font-size-sm)", color: C.textMid, minWidth: 0, overflowWrap: "anywhere" }}>{after || "—"}</span>
      )}
    </div>
  );
}

function CollapsibleJson({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ all: "unset", cursor: "pointer" }}
      >
        <PanelEyebrow>{open ? "▾" : "▸"} {label}</PanelEyebrow>
      </button>
      {open ? (
        <pre
          style={{
            fontFamily: FONT_MONO,
            fontSize: "var(--font-size-xs)",
            lineHeight: 1.55,
            color: C.textHigh,
            background: C.panelStrong,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: "var(--radius-lg)",
            padding: "10px 12px",
            margin: 0,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function EmptyPanelHint({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: FONT_BODY, fontSize: "var(--font-size-sm)", color: C.textMid, padding: "8px 2px" }}>
      {children}
    </div>
  );
}

/** DIRECTOR tab: one decision, fully unpacked — why it happened, what it
 *  chose, what it changed. */
export function DirectorPanel({
  item,
  fallbackHint,
}: {
  item: JournalDecisionItem | null;
  fallbackHint?: string;
}) {
  if (!item) {
    return (
      <Panel>
        <PanelEyebrow>Director decision</PanelEyebrow>
        <EmptyPanelHint>
          {fallbackHint ??
            "No decision selected — click a director row in the conversation rail. Older sessions (before the journal) have no recorded decisions."}
        </EmptyPanelHint>
      </Panel>
    );
  }
  const prev = item.previousState;
  const next = item.nextState;
  const presenceBefore = prev?.presentCharacterSlugs ?? [];
  const presenceAfter = next?.presentCharacterSlugs ?? [];
  const entered = presenceAfter.filter((s) => !presenceBefore.includes(s));
  const exited = presenceBefore.filter((s) => !presenceAfter.includes(s));

  return (
    <>
      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-8)", flexWrap: "wrap" }}>
          <PanelEyebrow color={C.mint}>Director decision</PanelEyebrow>
          <Chip color={actionColor(item.action)}>{item.action}</Chip>
          {item.trigger ? <Chip color={C.textMid}>{TRIGGER_LABELS[item.trigger] ?? item.trigger}</Chip> : null}
          {item.degraded || item.failure ? <Chip color={C.amber} bg={C.amberSoft}>degraded</Chip> : null}
          {item.recovered ? <Chip color={C.mint} bg={C.mintSoft}>{item.recovered}</Chip> : null}
        </div>
        {item.userText ? <KV label="user said">“{item.userText}”</KV> : null}
        {item.speakerSlug ? <KV label="speaker">{item.speakerSlug}</KV> : null}
        {item.beat ? <KV label="beat (direction)">{item.beat}</KV> : null}
        {item.sceneCue ? <KV label="scene cue">{item.sceneCue}</KV> : null}
        {item.worldEventDirective ? <KV label="world event">{item.worldEventDirective}</KV> : null}
        <KV label="provenance">
          {[item.provider, item.model, item.latencyMs != null ? `${item.latencyMs}ms` : null]
            .filter(Boolean)
            .join(" · ") || "—"}
        </KV>
        {item.speculation && item.speculation.outcome !== "none" ? (
          <KV label="speculation">
            {item.speculation.outcome === "hit"
              ? `HIT — decided during the endpoint hold off “${item.speculation.basedOnText ?? ""}”, awaited ${item.speculation.waitedMs ?? "?"}ms`
              : `MISS — partial “${item.speculation.basedOnText ?? ""}” did not cover the final turn; orchestrated inline`}
          </KV>
        ) : null}
        {item.failure ? <KV label="executor failure">{item.failure}</KV> : null}
        {item.reason ? <KV label="resolution notes">{item.reason}</KV> : null}
      </Panel>

      <Panel>
        <PanelEyebrow>State before → after</PanelEyebrow>
        {prev || next ? (
          <>
            <DiffRow label="beat" before={prev?.beat ?? "—"} after={next?.beat ?? "—"} />
            <DiffRow
              label="present"
              before={presenceBefore.join(", ") || "—"}
              after={presenceAfter.join(", ") || "—"}
            />
            {entered.length ? <KV label="entered">{entered.join(", ")}</KV> : null}
            {exited.length ? <KV label="exited">{exited.join(", ")}</KV> : null}
            <DiffRow label="ambience" before={prev?.ambience ?? "—"} after={next?.ambience ?? "—"} />
            <DiffRow
              label="last speaker"
              before={prev?.lastSpeakerSlug ?? "—"}
              after={next?.lastSpeakerSlug ?? "—"}
            />
            <DiffRow
              label="turn index"
              before={prev?.turnIndex != null ? String(prev.turnIndex) : "—"}
              after={next?.turnIndex != null ? String(next.turnIndex) : "—"}
            />
            <DiffRow
              label="arc landed"
              before={(prev?.arcLanded ?? []).join(", ") || "—"}
              after={(next?.arcLanded ?? []).join(", ") || "—"}
            />
          </>
        ) : (
          <EmptyPanelHint>This decision carried no state snapshots.</EmptyPanelHint>
        )}
      </Panel>

      <Panel>
        <CollapsibleJson label="raw decision json" value={item.decisionRaw} />
      </Panel>
    </>
  );
}

function ChronicleSection({ label, lines }: { label: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: "var(--space-10)", minWidth: 0 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", letterSpacing: "0.1em", textTransform: "uppercase", color: C.amberDeep, flex: "0 0 72px", fontWeight: 700 }}>
        {label}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: 0, flex: 1 }}>
        {lines.map((line, i) => (
          <span key={i} style={{ fontFamily: FONT_BODY, fontSize: "var(--font-size-sm)", lineHeight: 1.5, color: C.textHigh, overflowWrap: "anywhere" }}>
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One reflection, expanded: what the chronicler wrote and what changed. */
function ReflectionDetail({ item }: { item: JournalReflectionItem }) {
  const before = item.chronicleBefore;
  const after = item.chronicleAfter;
  const threadsAdded = (after?.threads ?? []).filter((t) => !(before?.threads ?? []).includes(t));
  const threadsDropped = (before?.threads ?? []).filter((t) => !(after?.threads ?? []).includes(t));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-10)" }}>
      {item.error ? (
        <KV label="error">{item.error}</KV>
      ) : (
        <>
          {item.note ? <KV label="note to director">{item.note}</KV> : null}
          {item.factsAdded.length ? (
            <KV label="facts added">{item.factsAdded.join(" · ")}</KV>
          ) : null}
          {item.landedAdded.length ? (
            <KV label="beats landed">{item.landedAdded.join(" · ")}</KV>
          ) : null}
          {item.gone.length ? <KV label="retired (gone)">{item.gone.join(", ")}</KV> : null}
          {threadsAdded.length ? <KV label="threads opened">{threadsAdded.join(" · ")}</KV> : null}
          {threadsDropped.length ? (
            <KV label="threads resolved">{threadsDropped.join(" · ")}</KV>
          ) : null}
          {after ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)", borderTop: `1px solid ${C.borderSoft}`, paddingTop: "var(--space-10)" }}>
              <PanelEyebrow>Chronicle after this reflection</PanelEyebrow>
              {after.story ? <ChronicleSection label="story" lines={[after.story]} /> : null}
              <ChronicleSection label="thread" lines={after.threads} />
              <ChronicleSection label="world" lines={after.world} />
              <ChronicleSection
                label="intent"
                lines={after.intents.map((i) => `when ${i.trigger}: ${i.direction}`)}
              />
              <ChronicleSection
                label="timed"
                lines={after.timed.map((t) => `in ~${t.afterSeconds}s: ${t.direction}`)}
              />
              <ChronicleSection label="draft" lines={after.drafts} />
            </div>
          ) : null}
          {item.raw ? <CollapsibleJson label="raw reflection reply" value={item.raw} /> : null}
        </>
      )}
    </div>
  );
}

/**
 * The LIVE journal panel — the sandbox's console into the Narrator while a
 * session runs: streaming rail rows, an inline inspector for the selected
 * item, and an exit to the full workbench. Fed by useSessionJournal.
 */
export function SessionJournalLivePanel({
  sessionId,
  items,
  error,
  live,
}: {
  sessionId: string;
  items: SessionJournalItem[];
  error: string | null;
  live: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToLatest = selectedId == null;

  useEffect(() => {
    if (stickToLatest) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [items.length, stickToLatest]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-8)",
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: "var(--radius-xl)",
        padding: "14px 16px",
        color: C.text,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-10)" }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", letterSpacing: "0.16em", textTransform: "uppercase", color: C.textLow }}>
          Narrator journal · {items.length} event{items.length === 1 ? "" : "s"}
          {live ? (
            <span style={{ color: C.mint }}> · live</span>
          ) : null}
        </span>
        <Link
          href={`/sessions/${encodeURIComponent(sessionId)}`}
          style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", letterSpacing: "0.1em", textTransform: "uppercase", color: C.mint, textDecoration: "none" }}
        >
          open workbench →
        </Link>
      </div>
      {error ? (
        <div style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", color: C.red }}>{error}</div>
      ) : null}
      {items.length === 0 ? (
        <EmptyPanelHint>
          Nothing journaled yet — decisions and reflections appear here as
          they persist.
        </EmptyPanelHint>
      ) : (
        <div
          ref={listRef}
          style={{ display: "flex", flexDirection: "column", maxHeight: 260, overflowY: "auto", border: `1px solid ${C.borderSoft}`, borderRadius: "var(--radius-lg)" }}
        >
          {items.map((item) => (
            <JournalRailRow
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onSelect={() =>
                setSelectedId((current) => (current === item.id ? null : item.id))
              }
            />
          ))}
        </div>
      )}
      {selected?.kind === "decision" ? <DirectorPanel item={selected} /> : null}
      {selected?.kind === "reflection" ? (
        <ChroniclePanel
          items={items}
          activeId={selected.id}
          onSelect={setSelectedId}
        />
      ) : null}
      {selected?.kind === "world-event" ? (
        <Panel>
          <PanelEyebrow color={C.amberDeep}>World event armed</PanelEyebrow>
          <KV label="direction">{selected.direction}</KV>
          <KV label="fires in">
            {selected.afterSeconds != null ? `~${selected.afterSeconds}s` : "—"}
            {selected.dueAt ? ` (due ${new Date(selected.dueAt).toLocaleTimeString()})` : ""}
          </KV>
        </Panel>
      ) : null}
    </div>
  );
}

/** CHRONICLE tab: the reflection timeline for the whole session — how the
 *  story document evolved, one reflection at a time. */
export function ChroniclePanel({
  items,
  activeId,
  onSelect,
}: {
  items: SessionJournalItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const reflections = items.filter((i): i is JournalReflectionItem => i.kind === "reflection");
  if (reflections.length === 0) {
    return (
      <Panel>
        <PanelEyebrow color={C.amberDeep}>Chronicler</PanelEyebrow>
        <EmptyPanelHint>
          No reflections recorded. Voice sessions journal the chronicler from
          the scene driver; older sessions predate the journal.
        </EmptyPanelHint>
      </Panel>
    );
  }
  const openId =
    activeId && reflections.some((r) => r.id === activeId)
      ? activeId
      : reflections[reflections.length - 1]!.id;

  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <PanelEyebrow color={C.amberDeep}>Chronicler · {reflections.length} reflection{reflections.length > 1 ? "s" : ""}</PanelEyebrow>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {reflections.map((r, i) => {
          const open = r.id === openId;
          return (
            <div key={r.id} style={{ borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none", padding: "10px 0" }}>
              <button type="button" onClick={() => onSelect(r.id)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "baseline", gap: "var(--space-10)", width: "100%" }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", color: open ? C.amberDeep : C.textLow, fontWeight: 700 }}>
                  {open ? "▾" : "▸"} R{String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontFamily: FONT_BODY, fontSize: "var(--font-size-sm)", color: r.error ? C.red : open ? C.text : C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
                  {r.error ? `failed — ${r.error}` : r.note ?? (r.chronicleAfter?.story || "no note")}
                </span>
                <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", color: C.textLow, flexShrink: 0 }}>
                  {[r.model, r.latencyMs != null ? `${(r.latencyMs / 1000).toFixed(1)}s` : null].filter(Boolean).join(" · ")}
                </span>
              </button>
              {open ? (
                <div style={{ paddingTop: "var(--space-10)" }}>
                  <ReflectionDetail item={r} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
