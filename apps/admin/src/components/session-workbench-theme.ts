// Shared visual constants for the session workbench and its journal
// components — extracted from session-detail-workbench.tsx so both modules
// read one palette without a circular import.

export const FONT_DISPLAY = "var(--font-display), system-ui, sans-serif";
export const FONT_MONO = "var(--font-mono), ui-monospace, monospace";
export const FONT_BODY = "var(--font-body), system-ui, sans-serif";

export const C = {
  bg: "var(--color-background)",
  bgRail: "var(--color-sidebar)",
  border: "var(--color-border-medium)",
  borderSoft: "var(--color-border-subtle)",
  borderStrong:
    "color-mix(in srgb, var(--color-text-primary) 13%, transparent)",
  panel: "var(--ink-wash)",
  panelStrong: "var(--ink-soft)",
  text: "var(--color-text-primary)",
  textHigh: "var(--color-text-secondary)",
  textMid: "var(--color-text-tertiary)",
  textLow: "var(--color-text-tertiary)",
  mint: "var(--color-accent-strong)",
  mintSoft: "var(--color-accent-fill)",
  mintMid: "var(--color-accent-border)",
  mintGlow: "var(--color-accent-glow)",
  mintBg: "var(--color-accent-wash)",
  greenDot: "var(--color-status-live)",
  amber: "var(--color-warning-amber)",
  amberSoft:
    "color-mix(in srgb, var(--color-warning-amber) 16%, transparent)",
  amberDeep: "var(--color-warning-amber)",
  red: "var(--color-status-error)",
} as const;
