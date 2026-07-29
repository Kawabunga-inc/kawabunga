"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { StageConfig } from "@kawabunga/types";
import type {
  SceneGraphPayload,
  SceneLibraryCharacter,
  SceneLibraryProp,
} from "@/app/(authenticated)/scenes/[sceneId]/page";
import { resolveAvatarGradient } from "@/lib/avatar-gradients";
import { T } from "@/components/scene-tabs/shared";
import { PropIcon } from "./prop-icons";
import {
  clampToWorld,
  clampZoom,
  defaultPxPerM,
  isPlaced,
  screenToWorld,
  snapTo,
  visibleWorldBounds,
  WORLD,
  WORLD_MAX_X,
  WORLD_MAX_Y,
  worldToScreen,
  zIndexFor,
  type ScreenSize,
  type Viewport,
} from "./stage-math";

type SceneNode = SceneGraphPayload["nodes"][number];

type DragState =
  | { mode: "pan"; startX: number; startY: number; startVp: Viewport; moved: boolean }
  | { mode: "node"; nodeId: string; moved: boolean }
  | { mode: "spawn"; moved: boolean };

/** A generated set-piece proposal rendered as a non-interactive dashed
 *  token until the user accepts or discards it. */
export type StageGhost = {
  id: string;
  label: string;
  icon: string | null;
  radiusM?: number | null;
  widthM?: number | null;
  heightM?: number | null;
  position: { x: number; y: number };
};

/* ── The overhead stage surface ─────────────────────────────────────
 * A single shared world (96×64 m, origin center, +x right, +y up)
 * rendered as DOM tokens over an SVG meter grid. Zones scale with
 * zoom; characters and audio chips stay a fixed screen size for
 * readability. Drag persists on drop; the wheel zooms around the
 * cursor; dragging the ground pans.
 */
export function SceneStage({
  nodes,
  characterById,
  propAssetById,
  ghosts,
  stage,
  snapM,
  selectedNodeId,
  onSelect,
  onMove,
  onMoveSpawn,
  onViewport,
}: {
  nodes: SceneNode[];
  characterById: Map<string, SceneLibraryCharacter>;
  propAssetById?: Map<string, SceneLibraryProp>;
  ghosts?: StageGhost[];
  stage: StageConfig | null;
  snapM: number;
  selectedNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
  onMove: (nodeId: string, position: { x: number; y: number }) => void;
  onMoveSpawn: (position: { x: number; y: number }) => void;
  /** Reports the live viewport so "save this view" can capture it. */
  onViewport?: (vp: Viewport) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<ScreenSize>({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  // Mirror of dragPos for pointer-up commits — the persist callbacks
  // must run outside the setState updater (React forbids parent
  // setState mid-render).
  const dragPosRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const updateDragPos = useCallback(
    (next: { id: string; x: number; y: number } | null) => {
      dragPosRef.current = next;
      setDragPos(next);
    },
    [],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // First layout: adopt the scene's saved viewport, else frame the
  // default 24×16 m view on the origin.
  useEffect(() => {
    if (viewport || size.width === 0) return;
    const saved = stage?.viewport;
    setViewport(
      saved
        ? { cx: saved.cx, cy: saved.cy, pxPerM: clampZoom(saved.zoom) }
        : { cx: 0, cy: 0, pxPerM: defaultPxPerM(size) },
    );
  }, [viewport, size, stage?.viewport]);

  useEffect(() => {
    if (viewport && onViewport) onViewport(viewport);
  }, [viewport, onViewport]);

  const spawn = stage?.spawn ?? { x: 0, y: 0 };

  const localPoint = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  }, []);

  const handleWheel = useCallback(
    (event: ReactWheelEvent) => {
      if (!viewport) return;
      event.preventDefault();
      const cursor = localPoint(event);
      const anchor = screenToWorld(cursor, viewport, size);
      const nextZoom = clampZoom(viewport.pxPerM * Math.exp(-event.deltaY * 0.0016));
      // Keep the world point under the cursor stationary through the zoom.
      setViewport({
        cx: anchor.x - (cursor.x - size.width / 2) / nextZoom,
        cy: anchor.y + (cursor.y - size.height / 2) / nextZoom,
        pxPerM: nextZoom,
      });
    },
    [viewport, size, localPoint],
  );

  const beginDrag = useCallback(
    (event: ReactPointerEvent, state: DragState) => {
      dragRef.current = state;
      containerRef.current?.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0 || !viewport) return;
      beginDrag(event, {
        mode: "pan",
        startX: event.clientX,
        startY: event.clientY,
        startVp: viewport,
        moved: false,
      });
    },
    [viewport, beginDrag],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !viewport) return;
      if (drag.mode === "pan") {
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        setViewport({
          cx: drag.startVp.cx - dx / drag.startVp.pxPerM,
          cy: drag.startVp.cy + dy / drag.startVp.pxPerM,
          pxPerM: drag.startVp.pxPerM,
        });
        return;
      }
      drag.moved = true;
      const world = screenToWorld(localPoint(event), viewport, size);
      const snapped = clampToWorld({
        x: snapTo(world.x, snapM),
        y: snapTo(world.y, snapM),
      });
      if (drag.mode === "node") {
        updateDragPos({ id: drag.nodeId, x: snapped.x, y: snapped.y });
      } else {
        updateDragPos({ id: "__spawn", x: snapped.x, y: snapped.y });
      }
    },
    [viewport, size, snapM, localPoint, updateDragPos],
  );

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.mode === "pan") {
      if (!drag.moved) onSelect(null);
      return;
    }
    const current = dragPosRef.current;
    if (drag.moved && current) {
      if (drag.mode === "node") onMove(current.id, { x: current.x, y: current.y });
      else onMoveSpawn({ x: current.x, y: current.y });
    }
    updateDragPos(null);
  }, [onSelect, onMove, onMoveSpawn, updateDragPos]);

  const placed = useMemo(
    () =>
      nodes
        .filter((node) => isPlaced(node.position))
        .sort(
          (a, b) => zIndexFor(a.kind, a.position) - zIndexFor(b.kind, b.position),
        ),
    [nodes],
  );

  const ready = viewport && size.width > 0;

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-subtle)",
        background: stage?.groundColor ?? "var(--canvas-surface)",
        cursor: dragRef.current?.mode === "pan" ? "grabbing" : "default",
        touchAction: "none",
      }}
    >
      {ready && (
        <>
          <StageGrid viewport={viewport} size={size} />
          {placed.map((node) => {
            const isDragging = dragPos?.id === node.id;
            const world = isDragging
              ? { x: dragPos.x, y: dragPos.y }
              : { x: node.position!.x, y: node.position!.y };
            const screen = worldToScreen(world, viewport, size);
            return (
              <StageToken
                key={node.id}
                node={node}
                character={
                  node.kind === "character" && node.refId
                    ? characterById.get(node.refId) ?? null
                    : null
                }
                propAsset={
                  node.kind === "prop" && node.refId
                    ? propAssetById?.get(node.refId) ?? null
                    : null
                }
                screen={screen}
                world={world}
                pxPerM={viewport.pxPerM}
                selected={selectedNodeId === node.id}
                dragging={isDragging}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (event.button !== 0) return;
                  onSelect(node.id);
                  beginDrag(event, { mode: "node", nodeId: node.id, moved: false });
                }}
              />
            );
          })}
          {(ghosts ?? []).map((ghost) => (
            <GhostToken
              key={ghost.id}
              ghost={ghost}
              screen={worldToScreen(ghost.position, viewport, size)}
              pxPerM={viewport.pxPerM}
            />
          ))}
          <SpawnMarker
            screen={worldToScreen(
              dragPos?.id === "__spawn" ? { x: dragPos.x, y: dragPos.y } : spawn,
              viewport,
              size,
            )}
            world={dragPos?.id === "__spawn" ? { x: dragPos.x, y: dragPos.y } : spawn}
            dragging={dragPos?.id === "__spawn"}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.button !== 0) return;
              onSelect(null);
              beginDrag(event, { mode: "spawn", moved: false });
            }}
          />
          <div style={hudChipStyle({ left: 12, bottom: 10 })}>
            {`WORLD ${WORLD.widthM}×${WORLD.heightM} M · SNAP ${snapM} M · ${Math.round(
              viewport.pxPerM,
            )} PX/M`}
          </div>
          {placed.length === 0 && (
            <div style={emptyStateStyle}>
              <strong
                style={{
                  fontFamily: T.fontHeading,
                  fontSize: "var(--font-size-lg)",
                  fontWeight: 600,
                  color: T.fg,
                }}
              >
                The stage is bare
              </strong>
              <span
                style={{
                  color: T.muted,
                  fontSize: "var(--font-size-sm)",
                  lineHeight: "19px",
                  textAlign: "center",
                }}
              >
                Every scene shares this one world. Place the cast and set pieces
                from the rail — drag to block them, scroll to zoom.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Grid ──────────────────────────────────────────────────────────── */

function StageGrid({ viewport, size }: { viewport: Viewport; size: ScreenSize }) {
  const bounds = visibleWorldBounds(viewport, size);
  const minor: string[] = [];
  const major: string[] = [];
  const labels: Array<{ x: number; y: number; text: string }> = [];

  const showMinor = viewport.pxPerM >= 14;
  const labelStep = viewport.pxPerM >= 22 ? 4 : 8;

  for (let x = Math.ceil(bounds.minX); x <= Math.floor(bounds.maxX); x += 1) {
    const sx = worldToScreen({ x, y: 0 }, viewport, size).x;
    const top = worldToScreen({ x, y: bounds.maxY }, viewport, size).y;
    const bottom = worldToScreen({ x, y: bounds.minY }, viewport, size).y;
    const path = `M${sx.toFixed(1)} ${top.toFixed(1)}V${bottom.toFixed(1)}`;
    if (x % 4 === 0) {
      major.push(path);
      if (x % labelStep === 0) {
        labels.push({ x: sx + 4, y: bottom - 6, text: x > 0 ? `+${x}` : String(x) });
      }
    } else if (showMinor) {
      minor.push(path);
    }
  }
  for (let y = Math.ceil(bounds.minY); y <= Math.floor(bounds.maxY); y += 1) {
    const sy = worldToScreen({ x: 0, y }, viewport, size).y;
    const left = worldToScreen({ x: bounds.minX, y }, viewport, size).x;
    const right = worldToScreen({ x: bounds.maxX, y }, viewport, size).x;
    const path = `M${left.toFixed(1)} ${sy.toFixed(1)}H${right.toFixed(1)}`;
    if (y % 4 === 0) {
      major.push(path);
      if (y % labelStep === 0 && y !== 0) {
        labels.push({ x: left + 6, y: sy - 4, text: y > 0 ? `+${y}` : String(y) });
      }
    } else if (showMinor) {
      minor.push(path);
    }
  }

  // World boundary + origin crosshair.
  const corner1 = worldToScreen({ x: -WORLD_MAX_X, y: WORLD_MAX_Y }, viewport, size);
  const corner2 = worldToScreen({ x: WORLD_MAX_X, y: -WORLD_MAX_Y }, viewport, size);
  const origin = worldToScreen({ x: 0, y: 0 }, viewport, size);

  return (
    <svg
      aria-hidden
      width={size.width}
      height={size.height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {minor.length > 0 && (
        <path d={minor.join("")} stroke="var(--text-primary)" strokeOpacity={0.05} />
      )}
      <path d={major.join("")} stroke="var(--text-primary)" strokeOpacity={0.1} />
      <rect
        x={corner1.x}
        y={corner1.y}
        width={corner2.x - corner1.x}
        height={corner2.y - corner1.y}
        fill="none"
        stroke="var(--accent-strong)"
        strokeOpacity={0.35}
        strokeDasharray="6 6"
      />
      <path
        d={`M${origin.x - 10} ${origin.y}H${origin.x + 10}M${origin.x} ${origin.y - 10}V${origin.y + 10}`}
        stroke="var(--accent-strong)"
        strokeOpacity={0.5}
      />
      {labels.map((label) => (
        <text
          key={`${label.text}-${label.x.toFixed(0)}-${label.y.toFixed(0)}`}
          x={label.x}
          y={label.y}
          fill="var(--text-tertiary)"
          fillOpacity={0.8}
          style={{ fontFamily: T.fontMono, fontSize: 9 }}
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
}

/* ── Tokens ────────────────────────────────────────────────────────── */

function StageToken({
  node,
  character,
  propAsset,
  screen,
  world,
  pxPerM,
  selected,
  dragging,
  onPointerDown,
}: {
  node: SceneNode;
  character: SceneLibraryCharacter | null;
  propAsset?: SceneLibraryProp | null;
  screen: { x: number; y: number };
  world: { x: number; y: number };
  pxPerM: number;
  selected: boolean;
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent) => void;
}) {
  const rotation =
    typeof node.position?.rotation === "number" ? node.position.rotation : 0;
  const zIndex = zIndexFor(node.kind, node.position ?? null) + (dragging ? 100 : 0);
  const base: CSSProperties = {
    position: "absolute",
    left: screen.x,
    top: screen.y,
    zIndex,
    cursor: dragging ? "grabbing" : "grab",
  };
  const coordText = `${world.x.toFixed(1)}, ${world.y.toFixed(1)}`;

  if (node.kind === "zone") {
    const widthM = typeof node.data.widthM === "number" ? node.data.widthM : 8;
    const heightM = typeof node.data.heightM === "number" ? node.data.heightM : 6;
    const ellipse = node.data.shape === "ellipse";
    const color = typeof node.data.color === "string" ? node.data.color : "var(--accent-strong)";
    return (
      <div
        onPointerDown={onPointerDown}
        style={{
          ...base,
          width: Math.max(24, widthM * pxPerM),
          height: Math.max(24, heightM * pxPerM),
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          borderRadius: ellipse ? "50%" : 14,
          border: `1.5px dashed color-mix(in srgb, ${color} ${selected ? 70 : 40}%, transparent)`,
          background: `color-mix(in srgb, ${color} ${selected ? 12 : 7}%, transparent)`,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: ellipse ? "50%" : 10,
            top: ellipse ? 8 : 6,
            transform: ellipse ? "translateX(-50%)" : undefined,
            fontFamily: T.fontMono,
            fontSize: "var(--font-size-2xs)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: `color-mix(in srgb, ${color} 80%, var(--text-primary))`,
            whiteSpace: "nowrap",
          }}
        >
          zone · {node.label}
        </span>
      </div>
    );
  }

  if (node.kind === "prop") {
    // Placement data overrides; the library asset supplies defaults.
    const radiusM =
      typeof node.data.radiusM === "number"
        ? node.data.radiusM
        : propAsset?.defaultRadiusM ?? null;
    const widthM =
      typeof node.data.widthM === "number"
        ? node.data.widthM
        : propAsset?.defaultWidthM ?? null;
    const heightM =
      typeof node.data.heightM === "number"
        ? node.data.heightM
        : propAsset?.defaultHeightM ?? null;
    const w = radiusM ? radiusM * 2 * pxPerM : widthM ? widthM * pxPerM : 36;
    const h = radiusM ? radiusM * 2 * pxPerM : heightM ? heightM * pxPerM : 36;
    const icon =
      (typeof node.data.icon === "string" ? node.data.icon : null) ??
      propAsset?.icon ??
      null;
    const legacyGlyph = typeof node.data.glyph === "string" ? node.data.glyph : null;
    const iconSize = Math.min(26, Math.max(12, Math.min(w, h) * 0.55));
    return (
      <div
        onPointerDown={onPointerDown}
        style={{
          ...base,
          width: Math.max(26, w),
          height: Math.max(26, h),
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          borderRadius: radiusM ? "50%" : "var(--radius-md)",
          border: `1px solid ${selected ? "var(--accent-strong)" : "var(--ink-line)"}`,
          background: T.panelStrong,
          boxShadow: selected
            ? "0 0 0 3px color-mix(in srgb, var(--accent-strong) 25%, transparent)"
            : "0 2px 8px color-mix(in srgb, var(--text-primary) 12%, transparent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {!icon && legacyGlyph ? (
          <span aria-hidden style={{ color: T.muted, fontSize: Math.min(18, Math.max(11, pxPerM * 0.5)) }}>
            {legacyGlyph}
          </span>
        ) : (
          <PropIcon icon={icon} size={iconSize} style={{ color: T.muted }} />
        )}
        <TokenLabel text={node.label} coords={selected ? coordText : null} offset={Math.max(15, h / 2)} />
      </div>
    );
  }

  if (node.kind === "character") {
    const earshotM =
      typeof node.data.earshotM === "number" ? node.data.earshotM : null;
    return (
      <div onPointerDown={onPointerDown} style={{ ...base, width: 0, height: 0 }}>
        {selected && earshotM && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: -earshotM * pxPerM,
              top: -earshotM * pxPerM,
              width: earshotM * 2 * pxPerM,
              height: earshotM * 2 * pxPerM,
              borderRadius: "50%",
              border: "1.5px dashed color-mix(in srgb, var(--accent-strong) 45%, transparent)",
              background: "color-mix(in srgb, var(--accent-strong) 5%, transparent)",
              pointerEvents: "none",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            left: -20,
            top: -20,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: `2px solid ${selected ? "var(--accent-strong)" : "var(--background)"}`,
            boxShadow: selected
              ? "0 0 0 4px color-mix(in srgb, var(--accent-strong) 22%, transparent), 0 6px 16px color-mix(in srgb, var(--text-primary) 25%, transparent)"
              : "0 4px 12px color-mix(in srgb, var(--text-primary) 20%, transparent)",
            background: character?.image
              ? `center / cover no-repeat url(${character.image})`
              : resolveAvatarGradient(
                  character?.thumbnailColor ?? null,
                  character?.slug ?? node.label,
                ),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-on)",
            fontFamily: T.fontHeading,
            fontWeight: 600,
            fontSize: "var(--font-size-base)",
          }}
        >
          {character?.image ? null : (node.label || "•").charAt(0).toUpperCase()}
        </div>
        <TokenLabel text={node.label} coords={selected ? coordText : null} offset={24} />
      </div>
    );
  }

  // audio one-shot (or anything else placed): compact chip.
  const rangeM = typeof node.data.rangeM === "number" ? node.data.rangeM : null;
  return (
    <div onPointerDown={onPointerDown} style={{ ...base, width: 0, height: 0 }}>
      {selected && rangeM && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: -rangeM * pxPerM,
            top: -rangeM * pxPerM,
            width: rangeM * 2 * pxPerM,
            height: rangeM * 2 * pxPerM,
            borderRadius: "50%",
            border: "1.5px dashed color-mix(in srgb, var(--status-draft) 55%, transparent)",
            background: "color-mix(in srgb, var(--status-draft) 6%, transparent)",
            pointerEvents: "none",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          transform: "translate(-50%, -50%)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 10px",
          borderRadius: "var(--radius-pill)",
          border: `1px solid ${selected ? "var(--accent-strong)" : "var(--ink-line)"}`,
          background: T.panelStrong,
          boxShadow: selected
            ? "0 0 0 3px color-mix(in srgb, var(--accent-strong) 22%, transparent)"
            : "0 2px 8px color-mix(in srgb, var(--text-primary) 12%, transparent)",
          whiteSpace: "nowrap",
          color: T.fg,
          fontFamily: T.fontBody,
          fontSize: "var(--font-size-xs)",
          fontWeight: 500,
        }}
      >
        <span aria-hidden style={{ color: T.muted }}>♪</span>
        {node.label}
        {selected && (
          <span style={{ fontFamily: T.fontMono, fontSize: "var(--font-size-2xs)", color: T.muted }}>
            {coordText}
          </span>
        )}
      </div>
    </div>
  );
}

function TokenLabel({
  text,
  coords,
  offset,
}: {
  text: string;
  coords: string | null;
  offset: number;
}) {
  return (
    <span
      style={{
        position: "absolute",
        left: "50%",
        top: offset + 4,
        transform: "translateX(-50%)",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: "var(--radius-pill)",
        border: "1px solid var(--ink-line)",
        background: T.panelStrong,
        color: T.fg,
        fontFamily: T.fontBody,
        fontSize: "var(--font-size-2xs)",
        fontWeight: 600,
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {text}
      {coords && (
        <span style={{ fontFamily: T.fontMono, fontWeight: 400, color: T.muted }}>{coords}</span>
      )}
    </span>
  );
}

function GhostToken({
  ghost,
  screen,
  pxPerM,
}: {
  ghost: StageGhost;
  screen: { x: number; y: number };
  pxPerM: number;
}) {
  const w = ghost.radiusM
    ? ghost.radiusM * 2 * pxPerM
    : ghost.widthM
      ? ghost.widthM * pxPerM
      : 36;
  const h = ghost.radiusM
    ? ghost.radiusM * 2 * pxPerM
    : ghost.heightM
      ? ghost.heightM * pxPerM
      : 36;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: screen.x,
        top: screen.y,
        zIndex: 90,
        width: Math.max(26, w),
        height: Math.max(26, h),
        transform: "translate(-50%, -50%)",
        borderRadius: ghost.radiusM ? "50%" : "var(--radius-md)",
        border: "1.5px dashed color-mix(in srgb, var(--accent-strong) 55%, transparent)",
        background: "color-mix(in srgb, var(--accent-strong) 6%, transparent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "color-mix(in srgb, var(--accent-strong) 70%, var(--text-tertiary))",
        pointerEvents: "none",
      }}
    >
      <PropIcon icon={ghost.icon} size={Math.min(24, Math.max(12, Math.min(w, h) * 0.5))} />
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: Math.max(15, h / 2) + 4,
          transform: "translateX(-50%)",
          fontFamily: T.fontMono,
          fontSize: "var(--font-size-2xs)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {ghost.label} · proposed
      </span>
    </div>
  );
}

function SpawnMarker({
  screen,
  world,
  dragging,
  onPointerDown,
}: {
  screen: { x: number; y: number };
  world: { x: number; y: number };
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        left: screen.x,
        top: screen.y,
        zIndex: 25,
        width: 0,
        height: 0,
        cursor: dragging ? "grabbing" : "grab",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: -15,
          top: -15,
          width: 30,
          height: 30,
          borderRadius: "50%",
          border: "2px dashed var(--accent-strong)",
          background: "color-mix(in srgb, var(--background) 70%, transparent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent-strong)",
          fontSize: 13,
        }}
      >
        ↓
      </div>
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: 19,
          transform: "translateX(-50%)",
          fontFamily: T.fontMono,
          fontSize: "var(--font-size-2xs)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--accent-strong)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        spawn · {world.x.toFixed(1)}, {world.y.toFixed(1)}
      </span>
    </div>
  );
}

function hudChipStyle(anchor: CSSProperties): CSSProperties {
  return {
    position: "absolute",
    ...anchor,
    zIndex: 200,
    padding: "4px 10px",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border-subtle)",
    background: "color-mix(in srgb, var(--background) 82%, transparent)",
    color: "var(--text-tertiary)",
    fontFamily: T.fontMono,
    fontSize: "var(--font-size-2xs)",
    letterSpacing: "0.1em",
    pointerEvents: "none",
  };
}

const emptyStateStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "38%",
  transform: "translate(-50%, -50%)",
  zIndex: 150,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  width: 340,
  padding: "22px 26px",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-subtle)",
  background: "color-mix(in srgb, var(--background) 88%, transparent)",
  boxShadow: "0 16px 44px color-mix(in srgb, var(--text-primary) 14%, transparent)",
  pointerEvents: "none",
};
