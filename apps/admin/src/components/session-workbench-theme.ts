// Shared visual constants for the session workbench and its journal
// components — extracted from session-detail-workbench.tsx so both modules
// read one palette without a circular import.

export const FONT_DISPLAY = '"Space Grotesk", system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';
export const FONT_BODY = '"Inter", system-ui, sans-serif';

export const C = {
  bg: "#0C0E14",
  bgRail: "#0A0C12",
  border: "rgba(255,255,255,0.08)",
  borderSoft: "rgba(255,255,255,0.05)",
  borderStrong: "rgba(255,255,255,0.12)",
  panel: "rgba(255,255,255,0.025)",
  panelStrong: "rgba(255,255,255,0.04)",
  text: "rgba(255,255,255,0.94)",
  textHigh: "rgba(255,255,255,0.65)",
  textMid: "rgba(255,255,255,0.45)",
  textLow: "rgba(255,255,255,0.35)",
  mint: "#8FD1CB",
  mintSoft: "rgba(140,231,210,0.12)",
  mintMid: "rgba(140,231,210,0.20)",
  mintBg: "rgba(140,231,210,0.06)",
  greenDot: "#4ADE80",
  amber: "#E5B85A",
  amberSoft: "rgba(229,184,90,0.16)",
  amberDeep: "#C9A04A",
  red: "#F4A8A8",
} as const;
