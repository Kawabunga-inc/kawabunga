import Link from "next/link";
import type { ReactNode } from "react";
import {
  C,
  FONT_BODY,
  FONT_DISPLAY,
  FONT_MONO,
} from "@/components/session-workbench-theme";
import { ActiveSessionCard } from "@/components/active-session-card";
import type {
  SessionIndexRow,
  SessionsIndexData,
} from "@/lib/session-index-data";

type Props = {
  data: SessionsIndexData;
};

const FOOTNOTE =
  'a session is "active" while its status is active and its last event is under 60s old — stale actives demote to Recent automatically';

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  return ms >= 1_000 ? `${(ms / 1_000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function formatRate(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

function arcLabel(row: SessionIndexRow): string {
  return row.arcLength > 0 ? `${row.arcLandedCount ?? 0}/${row.arcLength}` : "—";
}

function degradedLabel(row: SessionIndexRow): string {
  if (row.decisionCount === 0) return "—";
  return `${row.degradedCount}${row.recoveredCount > 0 ? ` (${row.recoveredCount}r)` : ""}`;
}

function SectionHeading({ children, live }: { children: ReactNode; live?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-10)",
        width: "100%",
      }}
    >
      {live ? (
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            flexShrink: 0,
            borderRadius: "var(--radius-pill)",
            background: C.greenDot,
            boxShadow: `0 0 8px ${C.greenDot}`,
          }}
        />
      ) : null}
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: "var(--font-size-sm)",
          fontWeight: live ? 700 : 500,
          letterSpacing: "0.16em",
          lineHeight: "14px",
          textTransform: "uppercase",
          color: live ? C.mint : C.textLow,
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
      <span style={{ height: 1, flex: 1, background: C.border }} />
    </div>
  );
}

const thStyle = {
  padding: "9px 12px",
  borderBottom: `1px solid ${C.border}`,
  color: C.textLow,
  fontFamily: FONT_MONO,
  fontSize: "var(--font-size-xs)",
  fontWeight: 500,
  letterSpacing: "0.14em",
  lineHeight: "12px",
  textAlign: "left" as const,
  textTransform: "uppercase" as const,
  whiteSpace: "nowrap" as const,
};

const tdStyle = {
  padding: "10px 12px",
  borderBottom: `1px solid ${C.borderSoft}`,
  color: C.textHigh,
  fontFamily: FONT_MONO,
  fontSize: "var(--font-size-base)",
  lineHeight: "16px",
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function RecentTable({ rows }: { rows: SessionIndexRow[] }) {
  return (
    <div
      data-testid="sessions-recent-table"
      style={{
        overflowX: "auto",
        border: `1px solid ${C.border}`,
        borderRadius: "var(--radius-card)",
        background: C.panel,
      }}
    >
      <table
        style={{
          width: "100%",
          minWidth: 938,
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: 118 }} />
          <col style={{ width: 220 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 78 }} />
          <col style={{ width: 64 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 88 }} />
          <col style={{ width: 60 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={thStyle}>Session</th>
            <th style={thStyle}>Scene</th>
            <th style={thStyle}>Started</th>
            <th style={thStyle}>Status</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Turns</th>
            <th style={{ ...thStyle, textAlign: "right" }}>p50 audio</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Degraded</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Spec hits</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Arc</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const arcComplete =
              row.arcLength > 0 && (row.arcLandedCount ?? 0) >= row.arcLength;
            return (
              <tr key={row.id} data-session-status={row.status}>
                <td style={tdStyle}>
                  <Link
                    href={`/sessions/${encodeURIComponent(row.id)}`}
                    style={{ color: C.mint, textDecoration: "none" }}
                  >
                    {row.id.slice(0, 8)}
                  </Link>
                </td>
                <td
                  title={row.sceneTitle}
                  style={{ ...tdStyle, fontFamily: FONT_BODY }}
                >
                  {row.sceneTitle}
                </td>
                <td style={{ ...tdStyle, color: C.textMid }}>
                  {formatDate(row.startedAt)}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    color: row.status === "error" ? C.red : C.textMid,
                  }}
                >
                  {row.status}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{row.turnCount}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {formatMs(row.p50FirstAudioMs)}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: "right",
                    color: row.degradedCount > 0 ? C.amber : C.textMid,
                  }}
                >
                  {degradedLabel(row)}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {formatRate(row.specHitRate)}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: "right",
                    color: arcComplete ? C.greenDot : C.textHigh,
                  }}
                >
                  {arcLabel(row)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SessionsTable({ data }: Props) {
  if (data.totalCount === 0) {
    return (
      <div
        style={{
          minHeight: "calc(100vh - 112px)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-18)",
          color: C.text,
          fontFamily: FONT_BODY,
        }}
      >
        <PageHeading activeCount={0} />
        <div
          data-testid="sessions-empty"
          style={{ color: C.textMid, fontSize: "var(--font-size-md)" }}
        >
          No sessions recorded yet.
        </div>
        <Footnote />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "calc(100vh - 112px)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-18)",
        color: C.text,
        fontFamily: FONT_BODY,
      }}
    >
      <PageHeading activeCount={data.activeCount} />

      {data.activeCount > 0 ? (
        <section
          aria-label="Active now"
          data-testid="sessions-active-now"
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-18)" }}
        >
          <SectionHeading live>Active now · {data.activeCount}</SectionHeading>
          {data.active.map((row) => (
            <ActiveSessionCard
              key={row.id}
              row={row}
              initialNow={data.renderedAt}
            />
          ))}
        </section>
      ) : null}

      {data.recent.length > 0 ? (
        <section
          aria-label="Recent sessions"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-18)",
            marginTop: data.activeCount > 0 ? "var(--space-6)" : 0,
          }}
        >
          <SectionHeading>Recent</SectionHeading>
          <RecentTable rows={data.recent} />
        </section>
      ) : null}

      <Footnote />
    </div>
  );
}

function Footnote() {
  return (
    <p
      style={{
        margin: 0,
        color: C.textLow,
        fontFamily: FONT_MONO,
        fontSize: "var(--font-size-sm)",
        lineHeight: "16px",
      }}
    >
      {FOOTNOTE}
    </p>
  );
}

function PageHeading({ activeCount }: { activeCount: number }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "var(--space-24)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <span
          style={{
            color: C.textLow,
            fontFamily: FONT_MONO,
            fontSize: "var(--font-size-sm)",
            letterSpacing: "0.16em",
            lineHeight: "14px",
            textTransform: "uppercase",
          }}
        >
          Sessions
        </span>
        <h1
          style={{
            margin: 0,
            color: C.text,
            fontFamily: FONT_DISPLAY,
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            lineHeight: "32px",
          }}
        >
          Sessions
        </h1>
      </div>
      {activeCount > 0 ? (
        <span
          style={{
            color: C.textLow,
            fontFamily: FONT_MONO,
            fontSize: "var(--font-size-sm)",
            lineHeight: "14px",
            textAlign: "right",
          }}
        >
          auto-refreshing every 5s while sessions are active
        </span>
      ) : null}
    </header>
  );
}
