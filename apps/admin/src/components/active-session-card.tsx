"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  C,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
} from "@/components/session-workbench-theme";
import type { SessionIndexRow } from "@/lib/session-index-data";

function elapsedLabel(startedAt: string, nowMs: number): string {
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return "— elapsed";
  const totalSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours > 0 ? `${hours}h ` : ""}${minutes}m ${String(seconds).padStart(2, "0")}s elapsed`;
}

function relativeLabel(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const thenMs = Date.parse(iso);
  if (!Number.isFinite(thenMs)) return "—";
  const totalSeconds = Math.max(0, Math.floor((nowMs - thenMs) / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s ago`;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}m ago`;
}

function Stat({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "mint" | "amber" | "muted";
  testId?: string;
}) {
  return (
    <div
      style={{
        minWidth: 72,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <span
        style={{
          color: C.textLow,
          fontFamily: FONT_MONO,
          fontSize: "var(--font-size-xs)",
          letterSpacing: "0.12em",
          lineHeight: "12px",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        data-testid={testId}
        style={{
          color:
            tone === "mint"
              ? C.mint
              : tone === "amber"
                ? C.amber
                : tone === "muted"
                  ? C.textMid
                  : C.text,
          fontFamily: FONT_DISPLAY,
          fontSize: 17,
          fontWeight: 600,
          lineHeight: "22px",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function ActiveSessionCard({
  row,
  initialNow,
}: {
  row: SessionIndexRow;
  initialNow: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.parse(initialNow));

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const latestMs = row.latestActivityAt ? Date.parse(row.latestActivityAt) : NaN;
  const latestAgeMs = Number.isFinite(latestMs)
    ? Math.max(0, nowMs - latestMs)
    : null;
  const arcValue =
    row.arcLength > 0 ? `${row.arcLandedCount ?? 0}/${row.arcLength}` : "—";
  const degradedValue =
    row.decisionCount > 0 ? String(row.degradedCount) : "—";

  return (
    <article
      data-session-id={row.id}
      data-testid="active-session-card"
      style={{
        display: "grid",
        gridTemplateColumns:
          "minmax(250px, 2.5fr) repeat(4, minmax(72px, 0.55fr)) minmax(132px, auto)",
        alignItems: "center",
        gap: "var(--space-24)",
        minWidth: 920,
        padding: "16px 20px",
        border: `1px solid ${C.mintMid}`,
        borderRadius: "var(--radius-card)",
        background: C.mintBg,
      }}
    >
      <div
        style={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "var(--space-8)" }}>
          <span
            aria-hidden="true"
            style={{
              width: 7,
              height: 7,
              flexShrink: 0,
              borderRadius: "var(--radius-pill)",
              background: C.greenDot,
            }}
          />
          <span
            title={row.sceneTitle}
            style={{
              overflow: "hidden",
              color: C.text,
              fontFamily: FONT_DISPLAY,
              fontSize: "var(--font-size-xl)",
              fontWeight: 600,
              lineHeight: "20px",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {row.sceneTitle}
          </span>
        </div>
        <span
          data-testid="active-session-subline"
          style={{
            overflow: "hidden",
            color: C.textMid,
            fontFamily: FONT_MONO,
            fontSize: "var(--font-size-sm)",
            lineHeight: "14px",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {row.userLabel} · {row.mode} · {row.transport} · {elapsedLabel(row.startedAt, nowMs)}
        </span>
      </div>
      <Stat label="Turns" value={row.turnCount} />
      <Stat
        label="Last event"
        value={relativeLabel(row.latestActivityAt, nowMs)}
        tone={latestAgeMs != null && latestAgeMs < 10_000 ? "mint" : undefined}
        testId="active-session-last-event"
      />
      <Stat
        label="Arc"
        value={arcValue}
        tone={row.arcLength === 0 ? "muted" : undefined}
      />
      <Stat
        label="Degraded"
        value={degradedValue}
        tone={row.degradedCount > 0 ? "amber" : "muted"}
      />
      <Link
        href={`/sessions/${encodeURIComponent(row.id)}`}
        style={{
          justifySelf: "end",
          padding: "8px 18px",
          borderRadius: "var(--radius-pill)",
          background: C.mint,
          color: "var(--color-accent-on)",
          fontFamily: FONT_MONO,
          fontSize: "var(--font-size-sm)",
          fontWeight: 700,
          letterSpacing: "0.1em",
          lineHeight: "14px",
          textDecoration: "none",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        Watch live →
      </Link>
    </article>
  );
}
