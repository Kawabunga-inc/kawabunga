"use client";

import type { ReactNode } from "react";

/* ── Top-down prop icon catalog ─────────────────────────────────────
 * Hand-drawn stroke icons for stage set pieces, all viewed from above
 * (the canvas is an overhead stage — a tent is its footprint with a
 * ridge line, not a triangle from the side). 24×24 viewBox, stroked
 * with currentColor so tokens tint them.
 *
 * Keys are stored in prop_assets.icon and scene_nodes.data.icon —
 * additions are cheap, renames need a data pass.
 */

export const PROP_ICONS: Record<string, { label: string; paths: ReactNode }> = {
  tent: {
    label: "Tent",
    paths: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M4 12h16M12 5v14" strokeOpacity="0.55" />
      </>
    ),
  },
  fire: {
    label: "Fire pit",
    paths: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" strokeOpacity="0.55" />
        <path d="M12 4v2M12 18v2M4 12h2M18 12h2" strokeOpacity="0.55" />
      </>
    ),
  },
  table: {
    label: "Table",
    paths: (
      <>
        <rect x="4" y="7" width="16" height="10" rx="1.5" />
        <circle cx="8" cy="12" r="1" strokeOpacity="0.55" />
        <circle cx="16" cy="12" r="1" strokeOpacity="0.55" />
      </>
    ),
  },
  tree: {
    label: "Tree",
    paths: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="1.4" />
        <path d="M12 4.5c2 2.5 2 4.5 0 6M6 15c2.5-.5 4-2 4.5-4M17.5 16c-2-1.5-3.5-1.5-5 0" strokeOpacity="0.55" />
      </>
    ),
  },
  rock: {
    label: "Rock",
    paths: (
      <>
        <path d="M7 5.5 15.5 4l4.5 6-2 8.5-9 1.5L4 13z" />
        <path d="M9 9.5 13 8l3 3.5" strokeOpacity="0.55" />
      </>
    ),
  },
  well: {
    label: "Well",
    paths: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4.5" strokeOpacity="0.55" />
        <path d="M12 7.5v9M7.5 12h9" strokeOpacity="0.35" />
      </>
    ),
  },
  water: {
    label: "Water",
    paths: (
      <>
        <path d="M4 9c2.5-2 5.5-2 8 0s5.5 2 8 0" />
        <path d="M4 14c2.5-2 5.5-2 8 0s5.5 2 8 0" />
        <path d="M6 19c2-1.5 4.5-1.5 6.5 0" strokeOpacity="0.55" />
      </>
    ),
  },
  bedroll: {
    label: "Bedroll",
    paths: (
      <>
        <rect x="6" y="4" width="12" height="16" rx="4" />
        <path d="M6 9h12" strokeOpacity="0.55" />
        <circle cx="12" cy="6.8" r="0.9" strokeOpacity="0.55" />
      </>
    ),
  },
  door: {
    label: "Threshold",
    paths: (
      <>
        <path d="M5 6v12M19 6v12" />
        <path d="M5 12h14" strokeOpacity="0.4" strokeDasharray="2 2.4" />
        <path d="M8 12a6 6 0 0 1 8 0" strokeOpacity="0.55" />
      </>
    ),
  },
  boat: {
    label: "Boat",
    paths: (
      <>
        <path d="M12 3c3.2 2.2 4.6 5.6 4.6 9S15.2 18.8 12 21c-3.2-2.2-4.6-5.6-4.6-9S8.8 5.2 12 3z" />
        <path d="M12 6v12M9.2 9h5.6M9.2 15h5.6" strokeOpacity="0.55" />
      </>
    ),
  },
  altar: {
    label: "Altar",
    paths: (
      <>
        <rect x="6" y="6" width="12" height="12" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="0.5" strokeOpacity="0.55" />
        <path d="M6 6 4 4M18 6l2-2M6 18l-2 2M18 18l2 2" strokeOpacity="0.4" />
      </>
    ),
  },
  cart: {
    label: "Cart",
    paths: (
      <>
        <rect x="5" y="6" width="14" height="10" rx="1.5" />
        <circle cx="8.5" cy="19" r="1.6" />
        <circle cx="15.5" cy="19" r="1.6" />
        <path d="M9 6v10M15 6v10" strokeOpacity="0.4" />
      </>
    ),
  },
  torch: {
    label: "Torch",
    paths: (
      <>
        <circle cx="12" cy="12" r="2.2" />
        <path d="M12 6.5v-2M12 19.5v-2M6.5 12h-2M19.5 12h-2M8.2 8.2 6.8 6.8M15.8 8.2l1.4-1.4M8.2 15.8l-1.4 1.4M15.8 15.8l1.4 1.4" strokeOpacity="0.6" />
      </>
    ),
  },
  rug: {
    label: "Rug",
    paths: (
      <>
        <rect x="4" y="6" width="16" height="12" rx="1" />
        <rect x="7" y="9" width="10" height="6" rx="0.5" strokeOpacity="0.55" />
        <path d="M4 6l-1.5-1.5M20 6l1.5-1.5M4 18l-1.5 1.5M20 18l1.5 1.5" strokeOpacity="0.35" />
      </>
    ),
  },
  jar: {
    label: "Jar",
    paths: (
      <>
        <circle cx="12" cy="12" r="6.5" />
        <circle cx="12" cy="12" r="3" strokeOpacity="0.55" />
      </>
    ),
  },
  bench: {
    label: "Bench",
    paths: (
      <>
        <rect x="4" y="9" width="16" height="6" rx="1.2" />
        <path d="M7 9v6M17 9v6" strokeOpacity="0.4" />
      </>
    ),
  },
};

export const PROP_ICON_KEYS = Object.keys(PROP_ICONS);

export function PropIcon({
  icon,
  size = 16,
  style,
}: {
  icon: string | null | undefined;
  size?: number;
  style?: React.CSSProperties;
}) {
  const entry = icon ? PROP_ICONS[icon] : undefined;
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {entry ? (
        entry.paths
      ) : (
        // Unknown key / no icon: a neutral footprint square.
        <rect x="6" y="6" width="12" height="12" rx="2" strokeDasharray="3 3" />
      )}
    </svg>
  );
}
