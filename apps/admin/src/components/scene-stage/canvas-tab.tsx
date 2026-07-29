"use client";

import { useCallback, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { StageConfig } from "@kawabunga/types";
import type {
  SceneGraphPayload,
  SceneLibraryCharacter,
} from "@/app/(authenticated)/scenes/[sceneId]/page";
import {
  addPropToScene,
  addZoneToScene,
  updateSceneNode,
} from "@/app/(authenticated)/scenes/actions";
import { AdminButton } from "@/components/admin-ui";
import { resolveAvatarGradient } from "@/lib/avatar-gradients";
import {
  checkboxRowStyle,
  Field,
  fieldLabelStyle,
  InspectorSection,
  InspectorTile,
  inputStyle,
  kickerStyle,
  T,
} from "@/components/scene-tabs/shared";
import { PROP_ICON_KEYS, PROP_ICONS, PropIcon } from "./prop-icons";
import { SceneStage } from "./scene-stage";
import {
  clampToWorld,
  isPlaced,
  snapTo,
  WORLD,
  type Viewport,
} from "./stage-math";

type SceneNode = SceneGraphPayload["nodes"][number];

const GROUND_PRESETS: Array<{ key: string; color: string | null; label: string }> = [
  { key: "default", color: null, label: "default" },
  { key: "sand", color: "#3d3628", label: "sand" },
  { key: "grove", color: "#2b3a2e", label: "grove" },
  { key: "slate", color: "#2c3440", label: "slate" },
  { key: "dusk", color: "#332b3d", label: "dusk" },
];

/* ── Canvas tab: tray · stage · placement/stage inspector ─────────── */
export function CanvasTab({
  sceneId,
  pending,
  graphNodes,
  characterById,
  stage,
  onStageChange,
  selectedNodeId,
  onSelect,
  onNodeSaved,
  onRemoveNode,
}: {
  sceneId: string;
  pending: boolean;
  graphNodes: SceneNode[];
  characterById: Map<string, SceneLibraryCharacter>;
  stage: StageConfig | null;
  onStageChange: (next: StageConfig) => void;
  selectedNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
  onNodeSaved: (nodeId: string, patch: Partial<SceneNode>) => void;
  onRemoveNode: (nodeId: string) => void;
}) {
  const router = useRouter();
  const viewportRef = useRef<Viewport | null>(null);
  const snapM = stage?.snapM ?? WORLD.defaultSnapM;

  const stagePatch = useCallback(
    (patch: Partial<StageConfig>): StageConfig => ({
      groundColor: stage?.groundColor ?? null,
      snapM: stage?.snapM ?? null,
      viewport: stage?.viewport ?? null,
      spawn: stage?.spawn ?? null,
      ...patch,
    }),
    [stage],
  );

  const persistPosition = useCallback(
    (node: SceneNode, next: { x: number; y: number; z?: number; rotation?: number }) => {
      const current = isPlaced(node.position) ? node.position : null;
      const position = {
        x: next.x,
        y: next.y,
        ...(next.z !== undefined || current?.z !== undefined
          ? { z: next.z ?? current?.z }
          : {}),
        ...(next.rotation !== undefined || current?.rotation !== undefined
          ? { rotation: next.rotation ?? current?.rotation }
          : {}),
      };
      onNodeSaved(node.id, { position });
      void updateSceneNode(sceneId, node.id, { position });
    },
    [sceneId, onNodeSaved],
  );

  const viewCenter = useCallback((): { x: number; y: number } => {
    const vp = viewportRef.current;
    return clampToWorld({
      x: snapTo(vp?.cx ?? 0, snapM),
      y: snapTo(vp?.cy ?? 0, snapM),
    });
  }, [snapM]);

  const placeAtCenter = useCallback(
    (node: SceneNode) => {
      persistPosition(node, viewCenter());
      onSelect(node.id);
    },
    [persistPosition, viewCenter, onSelect],
  );

  const addProp = useCallback(() => {
    void (async () => {
      const res = await addPropToScene(sceneId, {
        label: "New prop",
        radiusM: 0.5,
        position: viewCenter(),
      });
      if (res.ok && res.data) onSelect(res.data.nodeId);
      router.refresh();
    })();
  }, [sceneId, viewCenter, onSelect, router]);

  const addZone = useCallback(() => {
    void (async () => {
      const res = await addZoneToScene(sceneId, {
        label: "New zone",
        shape: "rect",
        widthM: 8,
        heightM: 6,
        position: viewCenter(),
      });
      if (res.ok && res.data) onSelect(res.data.nodeId);
      router.refresh();
    })();
  }, [sceneId, viewCenter, onSelect, router]);

  const selected =
    graphNodes.find((n) => n.id === selectedNodeId && isPlaced(n.position)) ?? null;

  // Placeable but not on stage: characters, one-shot audio, props, zones.
  const wings = graphNodes.filter(
    (node) =>
      !isPlaced(node.position) &&
      (node.kind === "character" ||
        node.kind === "prop" ||
        node.kind === "zone" ||
        (node.kind === "audio" && node.data.role === "oneshot")),
  );

  return (
    <div style={canvasLayoutStyle}>
      <div style={trayStyle}>
        <span style={kickerStyle}>In the wings · {wings.length}</span>
        <p style={trayHintStyle}>
          Not on the stage yet — place them, then drag to block. Beds stay
          global; one-shots can be placed as sources.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          {wings.map((node) => {
            const character =
              node.kind === "character" && node.refId
                ? characterById.get(node.refId)
                : undefined;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => placeAtCenter(node)}
                title="Place at the center of the view"
                style={trayRowStyle}
              >
                {node.kind === "character" ? (
                  <span
                    aria-hidden
                    style={{
                      width: 26,
                      height: 26,
                      flexShrink: 0,
                      borderRadius: "var(--radius-pill)",
                      background: character?.image
                        ? `center / cover no-repeat url(${character.image})`
                        : resolveAvatarGradient(
                            character?.thumbnailColor ?? null,
                            character?.slug ?? node.label,
                          ),
                    }}
                  />
                ) : node.kind === "prop" ? (
                  <span
                    aria-hidden
                    style={{ width: 26, display: "inline-flex", justifyContent: "center", color: T.muted }}
                  >
                    <PropIcon
                      icon={typeof node.data.icon === "string" ? node.data.icon : null}
                      size={16}
                    />
                  </span>
                ) : (
                  <span aria-hidden style={{ width: 26, textAlign: "center", color: T.muted }}>
                    {node.kind === "audio" ? "♪" : "▢"}
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {node.label}
                </span>
                <span style={trayPlaceStyle}>place →</span>
              </button>
            );
          })}
          {wings.length === 0 && <p style={trayHintStyle}>Everything is on stage.</p>}
        </div>
        <div style={{ display: "flex", gap: "var(--space-6)" }}>
          <AdminButton type="button" variant="secondary" disabled={pending} onClick={addProp}>
            + prop
          </AdminButton>
          <AdminButton type="button" variant="secondary" disabled={pending} onClick={addZone}>
            + zone
          </AdminButton>
        </div>
      </div>

      <SceneStage
        nodes={graphNodes}
        characterById={characterById}
        stage={stage}
        snapM={snapM}
        selectedNodeId={selectedNodeId}
        onSelect={onSelect}
        onMove={(nodeId, position) => {
          const node = graphNodes.find((n) => n.id === nodeId);
          if (node) persistPosition(node, position);
        }}
        onMoveSpawn={(spawn) => onStageChange(stagePatch({ spawn }))}
        onViewport={(vp) => {
          viewportRef.current = vp;
        }}
      />

      <div style={inspectorColumnStyle}>
        {selected ? (
          <PlacementInspector
            key={selected.id}
            node={selected}
            sceneId={sceneId}
            snapM={snapM}
            onNodeSaved={onNodeSaved}
            onRemoveNode={onRemoveNode}
          />
        ) : (
          <StageSettings
            stage={stage}
            stagePatch={stagePatch}
            onStageChange={onStageChange}
            viewportRef={viewportRef}
          />
        )}
      </div>
    </div>
  );
}

/* ── Placement inspector (a placed node is selected) ───────────────── */

function PlacementInspector({
  node,
  sceneId,
  snapM,
  onNodeSaved,
  onRemoveNode,
}: {
  node: SceneNode;
  sceneId: string;
  snapM: number;
  onNodeSaved: (nodeId: string, patch: Partial<SceneNode>) => void;
  onRemoveNode: (nodeId: string) => void;
}) {
  const position = isPlaced(node.position) ? node.position : { x: 0, y: 0 };
  const [label, setLabel] = useState(node.label);

  const saveData = useCallback(
    (dataPatch: Record<string, unknown>) => {
      const data = { ...node.data, ...dataPatch };
      for (const key of Object.keys(data)) {
        if (data[key] === undefined) delete data[key];
      }
      onNodeSaved(node.id, { data });
      void updateSceneNode(sceneId, node.id, { data });
    },
    [node, sceneId, onNodeSaved],
  );

  const savePosition = useCallback(
    (patch: Partial<{ x: number; y: number; z: number | undefined; rotation: number | undefined }>) => {
      const merged = {
        x: patch.x !== undefined ? snapTo(patch.x, snapM) : position.x,
        y: patch.y !== undefined ? snapTo(patch.y, snapM) : position.y,
        z: "z" in patch ? patch.z : position.z,
        rotation: "rotation" in patch ? patch.rotation : position.rotation,
      };
      const clamped = clampToWorld(merged);
      const next = {
        x: clamped.x,
        y: clamped.y,
        ...(merged.z !== undefined ? { z: merged.z } : {}),
        ...(merged.rotation !== undefined ? { rotation: merged.rotation } : {}),
      };
      onNodeSaved(node.id, { position: next });
      void updateSceneNode(sceneId, node.id, { position: next });
    },
    [node.id, position, sceneId, snapM, onNodeSaved],
  );

  const saveLabel = useCallback(() => {
    const next = label.trim();
    if (!next || next === node.label) return;
    onNodeSaved(node.id, { label: next });
    void updateSceneNode(sceneId, node.id, { label: next });
  }, [label, node, sceneId, onNodeSaved]);

  const removeFromStage = useCallback(() => {
    onNodeSaved(node.id, { position: null });
    void updateSceneNode(sceneId, node.id, { position: null });
  }, [node.id, sceneId, onNodeSaved]);

  const num = (value: unknown): string =>
    typeof value === "number" ? String(value) : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "20px 20px 40px", overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-10)" }}>
        <InspectorTile kind={node.kind} initial={(node.label || "•").charAt(0).toUpperCase()} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <strong style={{ fontFamily: T.fontHeading, fontSize: "var(--font-size-lg)", color: T.fg }}>
            {node.label}
          </strong>
          <span style={{ ...kickerStyle, fontSize: "var(--font-size-2xs)" }}>
            {node.kind} · blocking
          </span>
        </div>
      </div>

      {(node.kind === "prop" || node.kind === "zone") && (
        <Field label="Label">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={saveLabel}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            style={inputStyle}
          />
        </Field>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        <span style={fieldLabelStyle}>Position (m)</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)" }}>
          <NumberField label="x" value={String(position.x)} onCommit={(v) => savePosition({ x: v })} />
          <NumberField label="y" value={String(position.y)} onCommit={(v) => savePosition({ y: v })} />
          <NumberField
            label="z"
            value={num(position.z)}
            placeholder="auto"
            onCommit={(v) => savePosition({ z: v })}
            onClear={() => savePosition({ z: undefined })}
          />
          <NumberField
            label="rotation °"
            value={num(position.rotation)}
            placeholder="0"
            onCommit={(v) => savePosition({ rotation: v })}
            onClear={() => savePosition({ rotation: undefined })}
          />
        </div>
      </div>

      {node.kind === "character" && (
        <NumberField
          label="earshot (m) — dormant until spatial support"
          value={num(node.data.earshotM)}
          placeholder="none"
          onCommit={(v) => saveData({ earshotM: v > 0 ? v : undefined })}
          onClear={() => saveData({ earshotM: undefined })}
        />
      )}

      {node.kind === "audio" && (
        <NumberField
          label="sound range (m) — dormant until spatial support"
          value={num(node.data.rangeM)}
          placeholder="none"
          onCommit={(v) => saveData({ rangeM: v > 0 ? v : undefined })}
          onClear={() => saveData({ rangeM: undefined })}
        />
      )}

      {node.kind === "prop" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
            <span style={fieldLabelStyle}>Icon</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
              {PROP_ICON_KEYS.map((key) => {
                const active =
                  (typeof node.data.icon === "string" ? node.data.icon : null) === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={PROP_ICONS[key].label}
                    aria-label={`Icon: ${PROP_ICONS[key].label}`}
                    onClick={() => saveData({ icon: key, glyph: undefined })}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: 34,
                      borderRadius: "var(--radius-md)",
                      border: active
                        ? "1.5px solid var(--accent-strong)"
                        : "1px solid var(--ink-line)",
                      background: active ? T.accentSoft : "transparent",
                      color: active ? T.fg : T.muted,
                      cursor: "pointer",
                    }}
                  >
                    <PropIcon icon={key} size={17} />
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-6)" }}>
            <NumberField
              label="radius m"
              value={num(node.data.radiusM)}
              placeholder="—"
              onCommit={(v) =>
                saveData({ radiusM: v > 0 ? v : undefined, widthM: undefined, heightM: undefined })
              }
              onClear={() => saveData({ radiusM: undefined })}
            />
            <NumberField
              label="width m"
              value={num(node.data.widthM)}
              placeholder="—"
              onCommit={(v) => saveData({ widthM: v > 0 ? v : undefined, radiusM: undefined })}
              onClear={() => saveData({ widthM: undefined })}
            />
            <NumberField
              label="height m"
              value={num(node.data.heightM)}
              placeholder="—"
              onCommit={(v) => saveData({ heightM: v > 0 ? v : undefined, radiusM: undefined })}
              onClear={() => saveData({ heightM: undefined })}
            />
          </div>
          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={node.data.soundSource === true}
              onChange={(event) =>
                saveData({ soundSource: event.target.checked ? true : undefined })
              }
            />
            Sound source (fire, water — a future positional-audio hint)
          </label>
        </>
      )}

      {node.kind === "zone" && (
        <>
          <Field label="Shape">
            <select
              value={node.data.shape === "ellipse" ? "ellipse" : "rect"}
              onChange={(event) => saveData({ shape: event.target.value })}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="rect">rectangle</option>
              <option value="ellipse">ellipse</option>
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)" }}>
            <NumberField
              label="width m"
              value={num(node.data.widthM)}
              onCommit={(v) => saveData({ widthM: Math.max(0.5, v) })}
            />
            <NumberField
              label="height m"
              value={num(node.data.heightM)}
              onCommit={(v) => saveData({ heightM: Math.max(0.5, v) })}
            />
          </div>
        </>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <AdminButton type="button" variant="secondary" onClick={removeFromStage}>
          Remove from stage
        </AdminButton>
        {(node.kind === "prop" || node.kind === "zone") && (
          <AdminButton type="button" variant="danger" onClick={() => onRemoveNode(node.id)}>
            Delete {node.kind}
          </AdminButton>
        )}
      </div>
      <p style={{ margin: 0, color: T.muted, fontSize: "var(--font-size-xs)", lineHeight: "17px" }}>
        Positions are meters in the world every scene shares. Blocking is
        visual for now — spatial awareness builds on it later.
      </p>
    </div>
  );
}

function NumberField({
  label,
  value,
  placeholder,
  onCommit,
  onClear,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: number) => void;
  onClear?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  // Re-sync when the underlying value changes from outside (drag, snap).
  const lastValue = useRef(value);
  if (lastValue.current !== value) {
    lastValue.current = value;
    if (draft !== value) setDraft(value);
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      if (onClear) onClear();
      else setDraft(value);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) onCommit(parsed);
    else setDraft(value);
  };

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <span style={{ ...fieldLabelStyle, fontSize: "var(--font-size-2xs)" }}>{label}</span>
      <input
        value={draft}
        placeholder={placeholder}
        inputMode="decimal"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        style={{ ...inputStyle, height: 32, fontFamily: T.fontMono, fontSize: "var(--font-size-sm)" }}
      />
    </label>
  );
}

/* ── Stage settings (nothing selected) ─────────────────────────────── */

function StageSettings({
  stage,
  stagePatch,
  onStageChange,
  viewportRef,
}: {
  stage: StageConfig | null;
  stagePatch: (patch: Partial<StageConfig>) => StageConfig;
  onStageChange: (next: StageConfig) => void;
  viewportRef: { current: Viewport | null };
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "20px 20px 40px", overflow: "auto" }}>
      <InspectorSection
        title="Stage"
        hint="Nothing selected — these are the stage defaults. One ground color under everything; zones tint on top of it."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
          <span style={fieldLabelStyle}>Ground color</span>
          <div style={{ display: "flex", gap: "var(--space-6)" }}>
            {GROUND_PRESETS.map((preset) => {
              const active = (stage?.groundColor ?? null) === preset.color;
              return (
                <button
                  key={preset.key}
                  type="button"
                  title={preset.label}
                  aria-label={`Ground color: ${preset.label}`}
                  onClick={() => onStageChange(stagePatch({ groundColor: preset.color }))}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "var(--radius-md)",
                    border: active
                      ? "2px solid var(--accent-strong)"
                      : "1px solid var(--ink-line)",
                    boxShadow: active
                      ? "0 0 0 3px color-mix(in srgb, var(--accent-strong) 22%, transparent)"
                      : undefined,
                    background: preset.color ?? "var(--canvas-surface)",
                    cursor: "pointer",
                  }}
                />
              );
            })}
          </div>
        </div>

        <Field label="Snap">
          <select
            value={String(stage?.snapM ?? WORLD.defaultSnapM)}
            onChange={(event) =>
              onStageChange(stagePatch({ snapM: Number(event.target.value) }))
            }
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="0.25">0.25 m — fine</option>
            <option value="0.5">0.5 m — default</option>
            <option value="1">1 m — coarse</option>
          </select>
        </Field>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <AdminButton
            type="button"
            variant="secondary"
            onClick={() => {
              const vp = viewportRef.current;
              if (!vp) return;
              onStageChange(
                stagePatch({ viewport: { cx: vp.cx, cy: vp.cy, zoom: vp.pxPerM } }),
              );
            }}
          >
            Save current view as default
          </AdminButton>
          <AdminButton
            type="button"
            variant="secondary"
            onClick={() => onStageChange(stagePatch({ spawn: null }))}
          >
            Reset spawn to origin
          </AdminButton>
        </div>
      </InspectorSection>

      <div style={howItWorksStyle}>
        <span style={kickerStyle}>How placement works</span>
        <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          <li style={howItWorksItemStyle}>
            Everything is placeable — cast, props, zones, one-shot cues, even the
            spawn point.
          </li>
          <li style={howItWorksItemStyle}>
            Positions are meters in a {WORLD.widthM}×{WORLD.heightM} m world every
            scene shares; small scenes just use a corner of it.
          </li>
          <li style={howItWorksItemStyle}>
            Stack with z — a cue placed on a prop reads as sounding from it.
          </li>
        </ol>
      </div>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────────── */

const canvasLayoutStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "248px minmax(0, 1fr) 300px",
  gap: 16,
  padding: "16px 20px 20px",
  color: T.fg,
  fontFamily: T.fontBody,
};

const trayStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-10)",
  minHeight: 0,
  overflow: "auto",
  padding: "16px 14px",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  background: T.panel,
};

const trayHintStyle: CSSProperties = {
  margin: 0,
  color: T.muted,
  fontSize: "var(--font-size-xs)",
  lineHeight: "17px",
};

const trayRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-8)",
  width: "100%",
  padding: "7px 9px",
  border: "1px dashed var(--ink-line)",
  borderRadius: "var(--radius-md)",
  background: "transparent",
  color: T.fg,
  fontFamily: T.fontBody,
  fontSize: "var(--font-size-sm)",
  fontWeight: 500,
  cursor: "pointer",
  textAlign: "left",
};

const trayPlaceStyle: CSSProperties = {
  flexShrink: 0,
  color: T.accent,
  fontFamily: T.fontMono,
  fontSize: "var(--font-size-2xs)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const inspectorColumnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  background: T.panel,
  overflow: "hidden",
};

const howItWorksStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-8)",
  padding: "14px 16px",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  background: "color-mix(in srgb, var(--text-primary) 3%, transparent)",
};

const howItWorksItemStyle: CSSProperties = {
  color: T.muted,
  fontSize: "var(--font-size-xs)",
  lineHeight: "17px",
};
