"use client";

import type { CSSProperties, ReactNode } from "react";
import { adminTokens } from "@/components/admin-ui";
import { EditableText } from "@/components/editable-text";
import { Menu } from "@/components/menu";
import { TabBar, type TabItem } from "@/components/tab-bar";

/* ── Shared primitives for the scene editor tabs ────────────────────
 * Extracted from scene-editor.tsx when the single-canvas editor became
 * a tabbed one; the styling is parity with the character config
 * sidebar (header + tab band + section treatment).
 */

export const T = {
  fg: adminTokens.fg,
  muted: adminTokens.muted,
  panel: adminTokens.panel,
  panelStrong: adminTokens.panelStrong,
  border: adminTokens.border,
  accent: adminTokens.accent,
  accentSoft: adminTokens.accentSoft,
  danger: adminTokens.danger,
  dangerSoft: adminTokens.dangerFill,
  fontHeading: adminTokens.fontBody,
  fontBody: adminTokens.fontBody,
  fontMono: adminTokens.fontMono,
} as const;

/** Variants edit as one newline-separated block; blank lines separate them. */
export function splitVariants(raw: string): string[] {
  return raw
    .split(/\n\s*\n|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function relativeTime(ts: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) next[key] = trimmed;
      continue;
    }
    if (value !== undefined && value !== null) next[key] = value;
  }
  return next;
}

export function InspectorShellHeader({
  tile,
  title,
  onTitleChange,
  meta,
  menuItems,
  onMenuAction,
}: {
  tile: ReactNode;
  title: string;
  onTitleChange?: (next: string) => void | Promise<void>;
  meta: string;
  menuItems?: Array<{ value: string; label: string; meta?: string }>;
  onMenuAction?: (value: string) => void;
}) {
  return (
    <div
      style={{
        padding: "20px 24px 0",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "var(--space-8)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-10)",
          minWidth: 0,
        }}
      >
        {tile}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
            minWidth: 0,
          }}
        >
          {onTitleChange ? (
            <EditableText
              value={title}
              onChange={onTitleChange}
              ariaLabel="Name"
              style={{
                fontFamily: T.fontHeading,
                fontSize: "var(--font-size-xl)",
                fontWeight: 600,
                color: T.fg,
                letterSpacing: "-0.01em",
              }}
            />
          ) : (
            <h2
              style={{
                margin: 0,
                fontFamily: T.fontHeading,
                fontSize: "var(--font-size-xl)",
                fontWeight: 600,
                color: T.fg,
                letterSpacing: "-0.01em",
                overflowWrap: "anywhere",
              }}
            >
              {title}
            </h2>
          )}
          <span
            style={{
              fontFamily: T.fontMono,
              fontSize: "var(--font-size-xs)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--text-tertiary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {meta}
          </span>
        </div>
      </div>
      {menuItems && menuItems.length > 0 && onMenuAction && (
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <Menu<string>
            value=""
            onChange={onMenuAction}
            items={menuItems}
            ariaLabel="Node actions"
            showChevron={false}
            align="right"
            minWidth={240}
            triggerStyle={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              padding: 0,
              borderRadius: "var(--radius-pill)",
              border:
                "1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)",
              background: "transparent",
              color: "var(--text-tertiary)",
              fontFamily: T.fontMono,
              fontSize: "var(--font-size-base)",
              lineHeight: 1,
              transition: "border-color 120ms ease, background 120ms ease",
            }}
            renderTrigger={() => <span aria-hidden>⋯</span>}
          />
        </div>
      )}
    </div>
  );
}

/** The 34px tab band between header and content — same band as the
 *  character config sidebar (full-bleed borders, 24px left gutter). */
export function InspectorTabBand<K extends string>({
  tabs,
  active,
}: {
  tabs: Array<TabItem<K>>;
  active: K;
}) {
  return (
    <div
      style={{
        display: "flex",
        height: 34,
        marginTop: "var(--space-20)",
        paddingLeft: "var(--space-24)",
        borderTop: "1px solid var(--ink-fill)",
        borderBottom: "1px solid var(--ink-fill)",
        flexShrink: 0,
      }}
    >
      <TabBar items={tabs} active={active} />
    </div>
  );
}

/** Section with the character-sidebar heading treatment. */
export function InspectorSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-12)" }}
    >
      <div
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
      >
        <h3
          style={{
            fontFamily: T.fontHeading,
            fontSize: "var(--font-size-2xl)",
            fontWeight: 600,
            color: T.fg,
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
        {hint && (
          <p
            style={{
              margin: 0,
              color: T.muted,
              fontFamily: T.fontBody,
              fontSize: "var(--font-size-sm)",
              lineHeight: "19px",
            }}
          >
            {hint}
          </p>
        )}
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-10)" }}
      >
        {children}
      </div>
    </section>
  );
}

/** 44px identity tile: character avatar (image or gradient+initial),
 *  glyphs for the other node kinds, ⌂ for the scene itself. */
export function InspectorTile({
  kind,
  image,
  gradient,
  initial,
}: {
  kind: string;
  image?: string | null;
  gradient?: string;
  initial?: string;
}) {
  const glyph =
    kind === "scene"
      ? "⌂"
      : kind === "audio"
        ? "♪"
        : kind === "ambience"
          ? "≋"
          : kind === "event"
            ? "◆"
            : kind === "artifact"
              ? "▲"
              : kind === "zone"
                ? "▢"
                : null;
  return (
    <div
      aria-hidden
      style={{
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--ink-line)",
        background:
          kind === "character"
            ? image
              ? `center / cover no-repeat url(${image})`
              : gradient ?? "var(--ink-soft)"
            : "var(--ink-soft)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: kind === "character" ? "var(--accent-on)" : T.muted,
        fontFamily: T.fontHeading,
        fontSize: "var(--font-size-lg)",
        fontWeight: 600,
        overflow: "hidden",
      }}
    >
      {kind === "character" ? (image ? null : initial ?? "•") : glyph}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

export const inspectorScrollStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: "20px 24px 140px",
  display: "flex",
  flexDirection: "column",
  gap: 28,
  color: T.fg,
  fontFamily: T.fontBody,
};

export const inputStyle: CSSProperties = {
  height: 38,
  width: "100%",
  padding: "0 12px",
  background: "var(--control-bg)",
  border: "1px solid var(--control-border)",
  borderRadius: "var(--radius-md)",
  color: T.fg,
  fontFamily: T.fontBody,
  fontSize: "var(--font-size-base)",
  outline: "none",
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  height: "auto",
  minHeight: 86,
  padding: "10px 12px",
  resize: "vertical",
  lineHeight: "20px",
};

export const fieldHintStyle: CSSProperties = {
  margin: 0,
  color: "var(--text-tertiary)",
  fontFamily: T.fontBody,
  fontSize: "var(--font-size-xs)",
  lineHeight: "16px",
};

export const fieldLabelStyle: CSSProperties = {
  color: "var(--text-tertiary)",
  fontFamily: T.fontMono,
  fontSize: "var(--font-size-xs)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

export const checkboxRowStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-8)",
  color: T.muted,
  fontFamily: T.fontBody,
  fontSize: "var(--font-size-sm)",
};

export const kickerStyle: CSSProperties = {
  color: "var(--text-tertiary)",
  fontFamily: T.fontMono,
  fontSize: "var(--font-size-xs)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

export const subtleLinkStyle: CSSProperties = {
  color: T.accent,
  fontFamily: T.fontMono,
  fontSize: "var(--font-size-xs)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  textDecoration: "none",
};

/* ── Tab-panel layout helpers ───────────────────────────────────────
 * Every tab renders inside the same scrollable page well; two-pane
 * tabs (cast / environment / game) put a list column beside a detail
 * panel that hosts the node inspector.
 */

export const tabScrollStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: "28px 32px 120px",
};

export const tabColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 28,
  maxWidth: 680,
  color: T.fg,
  fontFamily: T.fontBody,
};

export const detailPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  background: T.panel,
  overflow: "hidden",
};

/** Two-pane tab body: a fixed list column and a detail panel that
 *  hosts the node inspector (or an empty hint when nothing selected). */
export function ListDetailLayout({
  list,
  detail,
  emptyDetailHint,
}: {
  list: ReactNode;
  detail: ReactNode | null;
  emptyDetailHint: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: "minmax(300px, 380px) minmax(0, 1fr)",
        gap: 24,
        padding: "28px 32px",
        color: T.fg,
        fontFamily: T.fontBody,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          minHeight: 0,
          overflow: "auto",
          paddingBottom: 120,
        }}
      >
        {list}
      </div>
      <div style={{ ...detailPanelStyle, minHeight: 0 }}>
        {detail ?? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
            }}
          >
            <p
              style={{
                margin: 0,
                color: T.muted,
                fontFamily: T.fontBody,
                fontSize: "var(--font-size-sm)",
                textAlign: "center",
              }}
            >
              {emptyDetailHint}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Selectable row in a tab's list column. */
export function NodeRow({
  tile,
  label,
  meta,
  selected,
  onClick,
}: {
  tile: ReactNode;
  label: string;
  meta?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-10)",
        width: "100%",
        padding: "8px 10px",
        border: `1px solid ${selected ? "var(--accent-strong)" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-md)",
        background: selected ? T.accentSoft : T.panel,
        cursor: "pointer",
        textAlign: "left",
        color: T.fg,
        fontFamily: T.fontBody,
      }}
    >
      {tile}
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 0,
          flex: 1,
        }}
      >
        <span
          style={{
            fontSize: "var(--font-size-base)",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        {meta && (
          <span
            style={{
              fontFamily: T.fontMono,
              fontSize: "var(--font-size-2xs)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: T.muted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {meta}
          </span>
        )}
      </span>
    </button>
  );
}
