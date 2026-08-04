"use client";

/**
 * Scene-level sessions rollup — every recorded session of one scene with
 * journal-derived health columns (degraded decisions, speculation hit rate,
 * arc completion, latency). This is where authoring meets evidence: edit
 * the scene on the canvas, read how it actually played here.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { C, FONT_BODY, FONT_DISPLAY, FONT_MONO } from "@/components/session-workbench-theme";

export type SceneSessionHealthRow = {
  id: string;
  startedAt: string;
  lastActiveAt: string;
  mode: string;
  status: string;
  userLabel: string | null;
  turnCount: number;
  durationLabel: string;
  p50FirstAudioMs: number | null;
  decisionCount: number;
  degradedCount: number;
  recoveredCount: number;
  /** 0..1 over decisions that had a speculation outcome; null = none. */
  specHitRate: number | null;
  avgDecisionMs: number | null;
  reflectionCount: number;
  reflectionFailures: number;
  /** null when the scene has no authored arc. */
  arcLandedCount: number | null;
};

export type SceneSessionsRollupProps = {
  sceneId: string;
  sceneTitle: string;
  sceneObjective: string | null;
  arcLength: number;
  rows: SceneSessionHealthRow[];
};

function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function fmtRate(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function Th({ children, align }: { children: ReactNode; align?: "right" }) {
  return (
    <th
      style={{
        fontFamily: FONT_MONO,
        fontSize: "var(--font-size-xs)",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: C.textLow,
        fontWeight: 500,
        textAlign: align ?? "left",
        padding: "8px 12px",
        borderBottom: `1px solid ${C.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  color,
  mono,
}: {
  children: ReactNode;
  align?: "right";
  color?: string;
  mono?: boolean;
}) {
  return (
    <td
      style={{
        fontFamily: mono ? FONT_MONO : FONT_BODY,
        fontSize: "var(--font-size-sm)",
        color: color ?? C.textHigh,
        textAlign: align ?? "left",
        padding: "9px 12px",
        borderBottom: `1px solid ${C.borderSoft}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "mint" | "amber" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "12px 18px", borderRight: `1px solid ${C.borderSoft}`, minWidth: 0 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", letterSpacing: "0.14em", textTransform: "uppercase", color: C.textLow }}>
        {label}
      </span>
      <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 22, color: tone === "mint" ? C.mint : tone === "amber" ? C.amber : C.text }}>
        {value}
      </span>
    </div>
  );
}

export function SceneSessionsRollup({
  sceneId,
  sceneTitle,
  sceneObjective,
  arcLength,
  rows,
}: SceneSessionsRollupProps) {
  const totalTurns = rows.reduce((sum, r) => sum + r.turnCount, 0);
  const totalDecisions = rows.reduce((sum, r) => sum + r.decisionCount, 0);
  const totalDegraded = rows.reduce((sum, r) => sum + r.degradedCount, 0);
  const specRates = rows.map((r) => r.specHitRate).filter((r): r is number => r != null);
  const overallSpec = specRates.length
    ? specRates.reduce((a, b) => a + b, 0) / specRates.length
    : null;
  const p50s = rows
    .map((r) => r.p50FirstAudioMs)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const medianP50 = p50s.length ? p50s[Math.floor(p50s.length / 2)]! : null;
  const fullArcs = arcLength > 0 ? rows.filter((r) => (r.arcLandedCount ?? 0) >= arcLength).length : 0;

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: FONT_BODY, padding: "24px 32px", display: "flex", flexDirection: "column", gap: "var(--space-16)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", letterSpacing: "0.16em", textTransform: "uppercase", color: C.textLow }}>
          <Link href="/scenes" style={{ color: C.textMid, textDecoration: "none" }}>scenes</Link>
          {" / "}
          <Link href={`/scenes/${encodeURIComponent(sceneId)}`} style={{ color: C.textMid, textDecoration: "none" }}>{sceneId}</Link>
          {" / sessions"}
        </div>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 28, letterSpacing: "-0.01em", margin: 0 }}>
          {sceneTitle} — sessions
        </h1>
        {sceneObjective ? (
          <div style={{ fontFamily: FONT_BODY, fontSize: "var(--font-size-sm)", color: C.textMid }}>
            objective: {sceneObjective}
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", border: `1px solid ${C.border}`, borderRadius: "var(--radius-xl)", background: C.panel, overflow: "hidden" }}>
        <Kpi label="Sessions" value={String(rows.length)} />
        <Kpi label="Turns" value={String(totalTurns)} />
        <Kpi label="Median p50 audio" value={fmtMs(medianP50)} tone="mint" />
        <Kpi
          label="Degraded decisions"
          value={totalDecisions ? `${totalDegraded}/${totalDecisions}` : "—"}
          tone={totalDegraded > 0 ? "amber" : undefined}
        />
        <Kpi label="Spec hit rate" value={fmtRate(overallSpec)} tone="mint" />
        <Kpi label={arcLength > 0 ? "Full-arc sessions" : "Arc"} value={arcLength > 0 ? `${fullArcs}/${rows.length}` : "no arc"} />
      </div>

      {rows.length === 0 ? (
        <div style={{ fontFamily: FONT_BODY, fontSize: "var(--font-size-sm)", color: C.textMid }}>
          No sessions recorded for this scene yet — run it in the sandbox or over LiveKit and they will land here.
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: "var(--radius-xl)", background: C.panel, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <Th>Session</Th>
                <Th>Started</Th>
                <Th>Mode</Th>
                <Th>Status</Th>
                <Th align="right">Turns</Th>
                <Th align="right">Duration</Th>
                <Th align="right">p50 audio</Th>
                <Th align="right">Decisions</Th>
                <Th align="right">Degraded</Th>
                <Th align="right">Spec hits</Th>
                <Th align="right">Dir latency</Th>
                <Th align="right">Reflections</Th>
                {arcLength > 0 ? <Th align="right">Arc</Th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td mono>
                    <Link href={`/sessions/${encodeURIComponent(row.id)}`} style={{ color: C.mint, textDecoration: "none" }}>
                      {row.id.slice(0, 8)}
                    </Link>
                    {row.userLabel ? (
                      <span style={{ color: C.textLow }}> · {row.userLabel}</span>
                    ) : null}
                  </Td>
                  <Td color={C.textMid}>{fmtDate(row.startedAt)}</Td>
                  <Td color={C.textMid}>{row.mode}</Td>
                  <Td color={row.status === "error" ? C.red : row.status === "active" ? C.mint : C.textMid}>
                    {row.status}
                  </Td>
                  <Td align="right" mono>{row.turnCount}</Td>
                  <Td align="right" mono color={C.textMid}>{row.durationLabel}</Td>
                  <Td align="right" mono>{fmtMs(row.p50FirstAudioMs)}</Td>
                  <Td align="right" mono>{row.decisionCount || "—"}</Td>
                  <Td align="right" mono color={row.degradedCount > 0 ? C.amber : C.textMid}>
                    {row.decisionCount ? row.degradedCount : "—"}
                    {row.recoveredCount > 0 ? ` (${row.recoveredCount}r)` : ""}
                  </Td>
                  <Td align="right" mono>{fmtRate(row.specHitRate)}</Td>
                  <Td align="right" mono>{fmtMs(row.avgDecisionMs)}</Td>
                  <Td align="right" mono color={row.reflectionFailures > 0 ? C.red : undefined}>
                    {row.reflectionCount || "—"}
                    {row.reflectionFailures > 0 ? ` (${row.reflectionFailures}✗)` : ""}
                  </Td>
                  {arcLength > 0 ? (
                    <Td align="right" mono color={(row.arcLandedCount ?? 0) >= arcLength ? C.greenDot : undefined}>
                      {row.arcLandedCount ?? 0}/{arcLength}
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontFamily: FONT_MONO, fontSize: "var(--font-size-xs)", color: C.textLow }}>
        health columns come from the scene journal — sessions recorded before the journal show decisions “—”
      </div>
    </div>
  );
}
