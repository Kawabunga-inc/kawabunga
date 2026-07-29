"use client";

import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { StageConfig } from "@kawabunga/types";
import type {
  SceneGraphPayload,
  SceneLibraryCharacter,
  SceneLibraryArtifact,
} from "@/app/(authenticated)/scenes/[sceneId]/page";
import { updateArtifactAssetMeta } from "@/app/(authenticated)/artifacts/actions";
import {
  acceptGeneratedArtifact,
  addArtifactFromLibrary,
  addArtifactToScene,
  addZoneToScene,
  promoteArtifactToLibrary,
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
  textareaStyle,
} from "@/components/scene-tabs/shared";
import { STAGE_ART_STYLES, STAGE_ART_STYLE_KEYS } from "@/lib/stage-art-styles";
import { SceneStage, type StageGhost } from "./scene-stage";
import {
  clampToWorld,
  isPlaced,
  snapTo,
  WORLD,
  type Viewport,
} from "./stage-math";

type SceneNode = SceneGraphPayload["nodes"][number];

/** One generated set-piece proposal from /generate-set. */
type GhostProposal = {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  radiusM?: number;
  widthM?: number;
  heightM?: number;
  soundSource?: boolean;
  position: { x: number; y: number };
  reuseAssetSlug?: string;
};

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
  libraryArtifacts,
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
  libraryArtifacts: SceneLibraryArtifact[];
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
  const artStyle = stage?.artStyle ?? null;
  const styleDirection = stage?.styleDirection ?? null;

  /* ── Automatic sprite generation ──
   * With no icon fallback, renditions ARE the visuals — so placing or
   * accepting a library artifact kicks off generation for the scene's
   * art style when the rendition is missing. Tokens show a dashed
   * footprint until the refresh brings the sprite in. */
  const [artBusyIds, setArtBusyIds] = useState<Set<string>>(new Set());

  const ensureRendition = useCallback(
    (assetId: string, images: Record<string, string>) => {
      if (!artStyle) return;
      if (images[artStyle]) return;
      setArtBusyIds((prev) => {
        if (prev.has(assetId)) return prev;
        const next = new Set(prev);
        next.add(assetId);
        return next;
      });
      void (async () => {
        try {
          await fetch(`/api/artifacts/${encodeURIComponent(assetId)}/generate-image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style: artStyle, styleDirection }),
          });
        } catch {
          // Non-fatal: the footprint stays until a manual regenerate.
        } finally {
          setArtBusyIds((prev) => {
            const next = new Set(prev);
            next.delete(assetId);
            return next;
          });
          router.refresh();
        }
      })();
    },
    [artStyle, styleDirection, router],
  );

  const stagePatch = useCallback(
    (patch: Partial<StageConfig>): StageConfig => ({
      groundColor: stage?.groundColor ?? null,
      artStyle: stage?.artStyle ?? null,
      styleDirection: stage?.styleDirection ?? null,
      backgrounds: stage?.backgrounds ?? null,
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

  const addArtifact = useCallback(() => {
    void (async () => {
      const res = await addArtifactToScene(sceneId, {
        label: "New artifact",
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

  const artifactById = useMemo(() => {
    const map = new Map<string, SceneLibraryArtifact>();
    for (const asset of libraryArtifacts) map.set(asset.id, asset);
    return map;
  }, [libraryArtifacts]);

  const placeFromLibrary = useCallback(
    (assetId: string) => {
      void (async () => {
        const res = await addArtifactFromLibrary(sceneId, {
          assetId,
          position: viewCenter(),
        });
        if (res.ok && res.data) {
          onSelect(res.data.nodeId);
          const asset = artifactById.get(assetId);
          ensureRendition(assetId, asset?.images ?? {});
        }
        router.refresh();
      })();
    },
    [sceneId, viewCenter, onSelect, router, artifactById, ensureRendition],
  );

  // ── Scene background (terrain plate, per style) ──
  const [bgBusy, setBgBusy] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);

  const generateBackground = useCallback(() => {
    if (!artStyle) return;
    setBgBusy(true);
    setBgError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/scenes/${encodeURIComponent(sceneId)}/generate-background`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style: artStyle, styleDirection }),
          },
        );
        const body = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !body.url) {
          setBgError(body.error ?? "Background generation failed.");
        } else {
          // The route returns the URL; persisting flows through client
          // stage state so the autosave never clobbers it.
          onStageChange(
            stagePatch({
              backgrounds: { ...(stage?.backgrounds ?? {}), [artStyle]: body.url },
            }),
          );
        }
      } catch {
        setBgError("Background generation failed.");
      } finally {
        setBgBusy(false);
      }
    })();
  }, [sceneId, artStyle, styleDirection, stage?.backgrounds, stagePatch, onStageChange]);

  // ── Generated set proposals (ghosts until accepted) ──
  const [proposals, setProposals] = useState<GhostProposal[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const generateSet = useCallback(() => {
    setGenerating(true);
    setGenError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/scenes/${encodeURIComponent(sceneId)}/generate-set`,
          { method: "POST" },
        );
        const body = (await res.json()) as {
          proposals?: GhostProposal[];
          error?: string;
        };
        if (!res.ok || !body.proposals) {
          setGenError(body.error ?? "Generation failed.");
        } else {
          setProposals(body.proposals);
        }
      } catch {
        setGenError("Generation failed.");
      } finally {
        setGenerating(false);
      }
    })();
  }, [sceneId]);

  const acceptProposal = useCallback(
    (proposal: GhostProposal) => {
      void (async () => {
        const res = await acceptGeneratedArtifact(sceneId, proposal);
        if (!res.ok) {
          setGenError(res.error);
          return;
        }
        setProposals((prev) => prev.filter((p) => p.id !== proposal.id));
        if (res.data) {
          onSelect(res.data.nodeId);
          // Freshly generated assets have no renditions yet.
          ensureRendition(res.data.assetId, artifactById.get(res.data.assetId)?.images ?? {});
        }
        router.refresh();
      })();
    },
    [sceneId, onSelect, router, artifactById, ensureRendition],
  );

  const ghosts: StageGhost[] = proposals.map((p) => ({
    id: p.id,
    label: p.name,
    radiusM: p.radiusM ?? null,
    widthM: p.widthM ?? null,
    heightM: p.heightM ?? null,
    position: p.position,
  }));

  // Placed library artifacts lacking a rendition for the current style.
  const missingArtAssetIds = useMemo(() => {
    if (!artStyle) return [] as string[];
    const ids = new Set<string>();
    for (const node of graphNodes) {
      if (node.kind !== "artifact" || !node.refId || !isPlaced(node.position)) continue;
      const asset = artifactById.get(node.refId);
      if (asset && !asset.images[artStyle]) ids.add(node.refId);
    }
    return [...ids];
  }, [graphNodes, artifactById, artStyle]);

  const selected =
    graphNodes.find((n) => n.id === selectedNodeId && isPlaced(n.position)) ?? null;

  // Placeable but not on stage: characters, one-shot audio, artifacts, zones.
  const wings = graphNodes.filter(
    (node) =>
      !isPlaced(node.position) &&
      (node.kind === "character" ||
        node.kind === "artifact" ||
        node.kind === "zone" ||
        (node.kind === "audio" &&
          node.data.role === "oneshot" &&
          typeof node.data.anchorNodeId !== "string")),
  );

  return (
    <div style={canvasLayoutStyle}>
      {/* The stage owns the whole surface; panels float above it. */}
      <div style={stageFillStyle}>
        <SceneStage
          nodes={graphNodes}
          characterById={characterById}
          artifactAssetById={artifactById}
          ghosts={ghosts}
          stage={stage}
          snapM={snapM}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
          onMove={(nodeId, position) => {
            const node = graphNodes.find((n) => n.id === nodeId);
            if (node) persistPosition(node, position);
          }}
          onMoveSpawn={(spawn) => onStageChange(stagePatch({ spawn }))}
          onResizeCommit={(nodeId, dims) => {
            const node = graphNodes.find((n) => n.id === nodeId);
            if (!node) return;
            // The scaled dimensions become placement overrides — the
            // library asset's defaults stay untouched.
            const data = { ...node.data, ...dims };
            if (dims.radiusM !== undefined) {
              delete data.widthM;
              delete data.heightM;
            } else {
              delete data.radiusM;
            }
            onNodeSaved(nodeId, { data });
            void updateSceneNode(sceneId, nodeId, { data });
          }}
          onViewport={(vp) => {
            viewportRef.current = vp;
          }}
        />
      </div>

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
                ) : node.kind === "artifact" ? (
                  <ArtifactThumb
                    asset={node.refId ? artifactById.get(node.refId) ?? null : null}
                    artStyle={artStyle}
                  />
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
          <AdminButton type="button" variant="secondary" disabled={pending} onClick={addArtifact}>
            + artifact
          </AdminButton>
          <AdminButton type="button" variant="secondary" disabled={pending} onClick={addZone}>
            + zone
          </AdminButton>
        </div>

        <span style={{ ...kickerStyle, marginTop: 8 }}>
          Artifacts · {libraryArtifacts.length}
          {artBusyIds.size > 0 ? ` · painting ${artBusyIds.size}…` : ""}
        </span>
        <AdminButton
          type="button"
          variant="primary"
          disabled={generating}
          onClick={generateSet}
          title="Propose set pieces from the scene premise"
        >
          {generating ? "Generating set…" : "✦ Generate set from premise"}
        </AdminButton>
        {genError && (
          <p style={{ ...trayHintStyle, color: T.danger }}>{genError}</p>
        )}
        {proposals.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            {proposals.map((proposal) => (
              <div
                key={proposal.id}
                style={{
                  ...trayRowStyle,
                  cursor: "default",
                  borderStyle: "dashed",
                  borderColor: "color-mix(in srgb, var(--accent-strong) 45%, transparent)",
                }}
              >
                <span
                  aria-hidden
                  style={{ width: 26, display: "inline-flex", justifyContent: "center", color: T.muted }}
                >
                  ✦
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {proposal.name}
                </span>
                <button
                  type="button"
                  onClick={() => acceptProposal(proposal)}
                  title="Accept — adds to the library and places it"
                  style={proposalActionStyle("var(--accent-strong)")}
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setProposals((prev) => prev.filter((p) => p.id !== proposal.id))
                  }
                  title="Discard proposal"
                  style={proposalActionStyle(T.muted)}
                >
                  ×
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: "var(--space-6)" }}>
              <button
                type="button"
                onClick={() => {
                  for (const proposal of [...proposals]) acceptProposal(proposal);
                }}
                style={{ ...trayPlaceStyle, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
              >
                accept all
              </button>
              <button
                type="button"
                onClick={() => setProposals([])}
                style={{ ...trayPlaceStyle, color: T.muted, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
              >
                clear
              </button>
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          {libraryArtifacts.map((asset) => {
            const busy = artBusyIds.has(asset.id);
            const needsArt = artStyle !== null && !asset.images[artStyle];
            return (
              <div key={asset.id} style={{ ...trayRowStyle, cursor: "default", padding: 0 }}>
                <button
                  type="button"
                  onClick={() => placeFromLibrary(asset.id)}
                  title={asset.description ?? "Place at the center of the view"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-8)",
                    flex: 1,
                    minWidth: 0,
                    padding: "7px 0 7px 9px",
                    border: "none",
                    background: "transparent",
                    color: T.fg,
                    fontFamily: T.fontBody,
                    fontSize: "var(--font-size-sm)",
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <ArtifactThumb asset={asset} artStyle={artStyle} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {asset.name}
                  </span>
                  <span style={trayPlaceStyle}>place →</span>
                </button>
                {/* Media generation is a child of the artifact: paint this
                    asset's sprite for the scene's current art style. */}
                {(needsArt || busy) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => ensureRendition(asset.id, asset.images)}
                    title={
                      busy
                        ? "Painting…"
                        : `Generate ${artStyle} art for ${asset.name}`
                    }
                    style={{
                      flexShrink: 0,
                      alignSelf: "stretch",
                      width: 34,
                      border: "none",
                      borderLeft: "1px dashed var(--ink-line)",
                      background: "transparent",
                      color: busy ? T.muted : T.accent,
                      cursor: busy ? "wait" : "pointer",
                      fontSize: "var(--font-size-sm)",
                    }}
                  >
                    {busy ? "…" : "✦"}
                  </button>
                )}
              </div>
            );
          })}
          {libraryArtifacts.length === 0 && (
            <p style={trayHintStyle}>
              The library is empty — add reusable set pieces at /artifacts, or
              generate a set from the premise.
            </p>
          )}
        </div>
      </div>

      <div style={inspectorColumnStyle}>
        {selected ? (
          <PlacementInspector
            key={selected.id}
            node={selected}
            graphNodes={graphNodes}
            asset={selected.refId ? artifactById.get(selected.refId) ?? null : null}
            artStyle={artStyle}
            styleDirection={styleDirection}
            onPromoted={(assetId) => {
              onNodeSaved(selected.id, { refId: assetId });
              ensureRendition(assetId, {});
              router.refresh();
            }}
            sceneId={sceneId}
            snapM={snapM}
            onNodeSaved={onNodeSaved}
            onRemoveNode={onRemoveNode}
          />
        ) : (
          <StageSettings
            stage={stage}
            graphNodes={graphNodes}
            stagePatch={stagePatch}
            onStageChange={onStageChange}
            viewportRef={viewportRef}
            missingArtAssetIds={missingArtAssetIds}
            artBusyCount={artBusyIds.size}
            onGenerateMissing={() => {
              for (const assetId of missingArtAssetIds) {
                ensureRendition(assetId, artifactById.get(assetId)?.images ?? {});
              }
            }}
            bgBusy={bgBusy}
            bgError={bgError}
            onGenerateBackground={generateBackground}
          />
        )}
      </div>
    </div>
  );
}

/* ── Placement inspector (a placed node is selected) ───────────────── */

function PlacementInspector({
  node,
  graphNodes,
  asset,
  artStyle,
  styleDirection,
  onPromoted,
  sceneId,
  snapM,
  onNodeSaved,
  onRemoveNode,
}: {
  node: SceneNode;
  graphNodes: SceneNode[];
  asset: SceneLibraryArtifact | null;
  artStyle: string | null;
  styleDirection: string | null;
  onPromoted: (assetId: string) => void;
  sceneId: string;
  snapM: number;
  onNodeSaved: (nodeId: string, patch: Partial<SceneNode>) => void;
  onRemoveNode: (nodeId: string) => void;
}) {
  const router = useRouter();
  const position = isPlaced(node.position) ? node.position : { x: 0, y: 0 };
  const locked = node.data.locked === true;
  const [label, setLabel] = useState(node.label);
  const [spriteBusy, setSpriteBusy] = useState(false);
  const [spriteError, setSpriteError] = useState<string | null>(null);

  // The image prompt is the artifact itself: name + description + the
  // scene's style clause. Description lives on the asset for library
  // artifacts (renditions regenerate from it) and on the node summary
  // for ad-hoc ones (promotion copies it across).
  const [mediaPrompt, setMediaPrompt] = useState(
    asset ? asset.description ?? "" : node.summary ?? "",
  );
  const saveMediaPrompt = useCallback(() => {
    const next = mediaPrompt.trim() || null;
    if (asset) {
      if (next === (asset.description ?? null)) return;
      void updateArtifactAssetMeta(asset.id, { description: next }).then(() =>
        router.refresh(),
      );
    } else {
      if (next === (node.summary ?? null)) return;
      onNodeSaved(node.id, { summary: next });
      void updateSceneNode(sceneId, node.id, { summary: next });
    }
  }, [mediaPrompt, asset, node, sceneId, onNodeSaved, router]);

  // Ad-hoc artifact → library asset + first rendition, one click. The
  // media prompt is persisted to the node summary FIRST (awaited, not
  // fire-and-forget) because promotion reads it server-side as the
  // asset description. The parent attaches the refId and kicks
  // generation.
  const promoteAndGenerate = useCallback(() => {
    setSpriteBusy(true);
    setSpriteError(null);
    void (async () => {
      try {
        const next = mediaPrompt.trim() || null;
        if (next !== (node.summary ?? null)) {
          onNodeSaved(node.id, { summary: next });
          await updateSceneNode(sceneId, node.id, { summary: next });
        }
        const res = await promoteArtifactToLibrary(sceneId, node.id);
        if (!res.ok) setSpriteError(res.error);
        else if (res.data) onPromoted(res.data.assetId);
      } finally {
        setSpriteBusy(false);
      }
    })();
  }, [sceneId, node, mediaPrompt, onNodeSaved, onPromoted]);

  // Generate this asset's sprite for the scene's art style without
  // leaving the canvas — same endpoint the /artifacts page uses; the
  // refresh pulls the new rendition into the library payload.
  const generateSprite = useCallback(() => {
    if (!asset || !artStyle) return;
    setSpriteBusy(true);
    setSpriteError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/artifacts/${encodeURIComponent(asset.id)}/generate-image`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style: artStyle, styleDirection }),
          },
        );
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          setSpriteError(body.error ?? "Generation failed.");
        } else {
          router.refresh();
        }
      } catch {
        setSpriteError("Generation failed.");
      } finally {
        setSpriteBusy(false);
      }
    })();
  }, [asset, artStyle, styleDirection, router]);

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
            {node.kind}{asset ? ` · library: ${asset.slug}` : ""} · blocking
          </span>
        </div>
      </div>

      {(node.kind === "artifact" || node.kind === "zone") && (
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

      {node.kind === "artifact" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
          <span style={fieldLabelStyle}>
            Scene art{artStyle ? ` · ${STAGE_ART_STYLES[artStyle]?.label ?? artStyle}` : ""}
          </span>
          {!artStyle ? (
            <p style={spriteHintStyle}>
              No art style set — artifacts render as footprints. Style and
              direction live in Stage settings (click empty ground).
            </p>
          ) : !asset ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
                <textarea
                  value={mediaPrompt}
                  onChange={(event) => setMediaPrompt(event.target.value)}
                  onBlur={saveMediaPrompt}
                  rows={2}
                  placeholder="What is it? e.g. a low woven black-goat-hair tent, open on one side"
                  style={textareaStyle}
                />
                <p style={spriteHintStyle}>
                  The image prompt is built from this: “top-down view of{" "}
                  <em>{(label || node.label).trim() || "…"}</em>
                  {mediaPrompt.trim() ? <> — <em>{mediaPrompt.trim()}</em></> : null},{" "}
                  {STAGE_ART_STYLES[artStyle]?.label.toLowerCase() ?? artStyle} style.”
                </p>
              </div>
              <AdminButton
                type="button"
                variant="primary"
                disabled={spriteBusy || (!mediaPrompt.trim() && !label.trim())}
                onClick={promoteAndGenerate}
              >
                {spriteBusy ? "Saving…" : "✦ Save to library & generate art"}
              </AdminButton>
              {spriteError && <p style={spriteErrorStyle}>{spriteError}</p>}
            </>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
                <textarea
                  value={mediaPrompt}
                  onChange={(event) => setMediaPrompt(event.target.value)}
                  onBlur={saveMediaPrompt}
                  rows={2}
                  placeholder="What is it? e.g. a low woven black-goat-hair tent, open on one side"
                  style={textareaStyle}
                />
                <p style={spriteHintStyle}>
                  The image prompt is built from this: “top-down view of{" "}
                  <em>{(label || node.label).trim() || "…"}</em>
                  {mediaPrompt.trim() ? <> — <em>{mediaPrompt.trim()}</em></> : null},{" "}
                  {STAGE_ART_STYLES[artStyle]?.label.toLowerCase() ?? artStyle} style.”
                </p>
              </div>
              {asset.images[artStyle] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.images[artStyle]}
                  alt={`${asset.name} — ${artStyle} sprite`}
                  style={{
                    width: 96,
                    height: 96,
                    objectFit: "contain",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--ink-line)",
                    background:
                      "repeating-conic-gradient(color-mix(in srgb, var(--text-primary) 6%, transparent) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px",
                  }}
                />
              )}
              <AdminButton
                type="button"
                variant="secondary"
                disabled={spriteBusy}
                onClick={generateSprite}
              >
                {spriteBusy
                  ? "Generating…"
                  : asset.images[artStyle]
                    ? "↻ Regenerate sprite"
                    : "✦ Generate sprite"}
              </AdminButton>
              {spriteError && <p style={spriteErrorStyle}>{spriteError}</p>}
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        <span style={fieldLabelStyle}>Position (m)</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)" }}>
          <NumberField label="x" value={String(position.x)} disabled={locked} onCommit={(v) => savePosition({ x: v })} />
          <NumberField label="y" value={String(position.y)} disabled={locked} onCommit={(v) => savePosition({ y: v })} />
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

      {node.kind === "artifact" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-6)" }}>
            <NumberField
              label="radius m"
              value={num(node.data.radiusM)}
              placeholder={asset?.defaultRadiusM != null ? `${asset.defaultRadiusM} (library)` : "—"}
              onCommit={(v) =>
                saveData({ radiusM: v > 0 ? v : undefined, widthM: undefined, heightM: undefined })
              }
              onClear={() => saveData({ radiusM: undefined })}
            />
            <NumberField
              label="width m"
              value={num(node.data.widthM)}
              placeholder={asset?.defaultWidthM != null ? `${asset.defaultWidthM} (library)` : "—"}
              onCommit={(v) => saveData({ widthM: v > 0 ? v : undefined, radiusM: undefined })}
              onClear={() => saveData({ widthM: undefined })}
            />
            <NumberField
              label="height m"
              value={num(node.data.heightM)}
              placeholder={asset?.defaultHeightM != null ? `${asset.defaultHeightM} (library)` : "—"}
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

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <span style={fieldLabelStyle}>Attached sounds</span>
            {graphNodes
              .filter(
                (n) => n.kind === "audio" && n.data.anchorNodeId === node.id,
              )
              .map((sound) => (
                <div
                  key={sound.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-8)",
                    padding: "6px 9px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    background: "color-mix(in srgb, var(--status-draft) 8%, transparent)",
                  }}
                >
                  <span aria-hidden style={{ color: T.muted }}>♪</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--font-size-sm)" }}>
                    {sound.label}
                  </span>
                  {typeof sound.data.rangeM === "number" && (
                    <span style={{ fontFamily: T.fontMono, fontSize: "var(--font-size-2xs)", color: T.muted }}>
                      {sound.data.rangeM}m
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Detach ${sound.label}`}
                    title="Detach — back to a free one-shot"
                    onClick={() => {
                      const data = { ...sound.data };
                      delete data.anchorNodeId;
                      onNodeSaved(sound.id, { data });
                      void updateSceneNode(sceneId, sound.id, { data });
                    }}
                    style={{
                      flexShrink: 0,
                      width: 22,
                      height: 22,
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--ink-line)",
                      background: "transparent",
                      color: T.muted,
                      cursor: "pointer",
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            <select
              value=""
              onChange={(event) => {
                const sound = graphNodes.find((n) => n.id === event.target.value);
                if (!sound) return;
                // Anchoring takes the sound off the open stage — it
                // emanates from this artifact and follows it.
                const data = { ...sound.data, anchorNodeId: node.id };
                onNodeSaved(sound.id, { data, position: null });
                void updateSceneNode(sceneId, sound.id, { data, position: null });
                event.target.value = "";
              }}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="" disabled>
                {graphNodes.some(
                  (n) =>
                    n.kind === "audio" &&
                    n.data.role === "oneshot" &&
                    typeof n.data.anchorNodeId !== "string",
                )
                  ? "Attach a one-shot sound…"
                  : "No free one-shots — add them in the Environment tab"}
              </option>
              {graphNodes
                .filter(
                  (n) =>
                    n.kind === "audio" &&
                    n.data.role === "oneshot" &&
                    typeof n.data.anchorNodeId !== "string",
                )
                .map((sound) => (
                  <option key={sound.id} value={sound.id}>
                    {sound.label}
                  </option>
                ))}
            </select>
          </div>
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
        {(node.kind === "artifact" || node.kind === "zone") && (
          <AdminButton
            type="button"
            variant="secondary"
            onClick={() => saveData({ locked: locked ? undefined : true })}
          >
            {locked ? "🔓 Unlock placement" : "🔒 Lock in place"}
          </AdminButton>
        )}
        <AdminButton
          type="button"
          variant="secondary"
          disabled={locked}
          title={locked ? "Unlock first" : undefined}
          onClick={removeFromStage}
        >
          Remove from stage
        </AdminButton>
        {(node.kind === "artifact" || node.kind === "zone") && (
          <AdminButton
            type="button"
            variant="danger"
            disabled={locked}
            title={locked ? "Unlock first" : undefined}
            onClick={() => onRemoveNode(node.id)}
          >
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
  disabled,
  onCommit,
  onClear,
}: {
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
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
        disabled={disabled}
        inputMode="decimal"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        style={{
          ...inputStyle,
          height: 32,
          fontFamily: T.fontMono,
          fontSize: "var(--font-size-sm)",
          ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}),
        }}
      />
    </label>
  );
}

/* ── Stage settings (nothing selected) ─────────────────────────────── */

function StageSettings({
  stage,
  graphNodes,
  stagePatch,
  onStageChange,
  viewportRef,
  missingArtAssetIds,
  artBusyCount,
  onGenerateMissing,
  bgBusy,
  bgError,
  onGenerateBackground,
}: {
  stage: StageConfig | null;
  graphNodes: SceneNode[];
  stagePatch: (patch: Partial<StageConfig>) => StageConfig;
  onStageChange: (next: StageConfig) => void;
  viewportRef: { current: Viewport | null };
  missingArtAssetIds: string[];
  artBusyCount: number;
  onGenerateMissing: () => void;
  bgBusy: boolean;
  bgError: string | null;
  onGenerateBackground: () => void;
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

        <Field label="Art style">
          <select
            value={stage?.artStyle ?? ""}
            onChange={(event) =>
              onStageChange(stagePatch({ artStyle: event.target.value || null }))
            }
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value="">none — footprints only</option>
            {STAGE_ART_STYLE_KEYS.map((key) => (
              <option key={key} value={key}>
                {STAGE_ART_STYLES[key].label}
              </option>
            ))}
          </select>
        </Field>

        {stage?.artStyle && (
          <Field label="Style direction">
            <textarea
              value={stage?.styleDirection ?? ""}
              onChange={(event) =>
                onStageChange(
                  stagePatch({ styleDirection: event.target.value || null }),
                )
              }
              rows={2}
              placeholder="Seeded into every artifact's image prompt — e.g. dusty golden hour, Bronze Age Canaan, weathered materials"
              style={textareaStyle}
            />
          </Field>
        )}

        {stage?.artStyle && (
          <>
            <AdminButton
              type="button"
              variant="secondary"
              disabled={bgBusy}
              onClick={onGenerateBackground}
            >
              {bgBusy
                ? "Painting terrain…"
                : stage.backgrounds?.[stage.artStyle]
                  ? "↻ Regenerate background"
                  : "✦ Generate background"}
            </AdminButton>
            {bgError && (
              <p
                style={{
                  margin: 0,
                  color: T.danger,
                  fontSize: "var(--font-size-xs)",
                  lineHeight: "17px",
                }}
              >
                {bgError}
              </p>
            )}
          </>
        )}

        {stage?.artStyle && (
          <AdminButton
            type="button"
            variant="secondary"
            disabled={missingArtAssetIds.length === 0 || artBusyCount > 0}
            onClick={onGenerateMissing}
          >
            {artBusyCount > 0
              ? `Painting ${artBusyCount}…`
              : missingArtAssetIds.length === 0
                ? "All placed artifacts have art"
                : `✦ Generate missing art (${missingArtAssetIds.length})`}
          </AdminButton>
        )}

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

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
        <span style={kickerStyle}>Environment · root audio</span>
        {graphNodes.filter((n) => n.kind === "audio" && n.data.role === "bed").length === 0 ? (
          <p style={{ margin: 0, color: T.muted, fontSize: "var(--font-size-xs)", lineHeight: "17px" }}>
            No ambience beds yet — the scene plays in silence. Add beds in the
            Environment tab.
          </p>
        ) : (
          graphNodes
            .filter((n) => n.kind === "audio" && n.data.role === "bed")
            .map((bed) => (
              <div
                key={bed.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-8)",
                  padding: "6px 9px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <span aria-hidden style={{ color: T.muted }}>≋</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--font-size-sm)" }}>
                  {bed.label}
                </span>
                {bed.data.isDefault === true && (
                  <span style={{ fontFamily: T.fontMono, fontSize: "var(--font-size-2xs)", letterSpacing: "0.08em", color: T.accent }}>
                    DEFAULT
                  </span>
                )}
              </div>
            ))
        )}
        <p style={{ margin: 0, color: T.muted, fontSize: "var(--font-size-xs)", lineHeight: "17px" }}>
          Root scene audio — beds loop under everything, unplaced. One-shots
          attach to artifacts from the artifact&apos;s inspector.
        </p>
      </div>

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
  position: "relative",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  color: T.fg,
  fontFamily: T.fontBody,
};

const stageFillStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
};

/** Floating glass panel over the stage — translucent surface + blur so
 *  the terrain reads through without fighting the controls. */
function floatingPanelStyle(side: "left" | "right", width: number): CSSProperties {
  return {
    position: "absolute",
    top: 16,
    [side]: 16,
    width,
    maxHeight: "calc(100% - 32px)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "auto",
    zIndex: 500,
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--border-subtle)",
    background: "color-mix(in srgb, var(--surface-1) 88%, transparent)",
    backdropFilter: "blur(14px) saturate(1.1)",
    boxShadow: "0 12px 40px color-mix(in srgb, black 35%, transparent)",
  };
}

const trayStyle: CSSProperties = {
  ...floatingPanelStyle("left", 248),
  gap: "var(--space-10)",
  padding: "16px 14px",
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

function proposalActionStyle(color: string): CSSProperties {
  return {
    flexShrink: 0,
    width: 24,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius-pill)",
    border: "1px solid var(--ink-line)",
    background: "transparent",
    color,
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
  };
}

const trayPlaceStyle: CSSProperties = {
  flexShrink: 0,
  color: T.accent,
  fontFamily: T.fontMono,
  fontSize: "var(--font-size-2xs)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

/** 26px tray tile: the current style's sprite when it exists, else a
 *  dashed footprint square (the same "art pending" language the stage
 *  tokens use). */
function ArtifactThumb({
  asset,
  artStyle,
}: {
  asset: SceneLibraryArtifact | null;
  artStyle: string | null;
}) {
  const sprite = asset && artStyle ? asset.images[artStyle] ?? null : null;
  if (sprite) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={sprite}
        alt=""
        aria-hidden
        style={{ width: 26, height: 26, objectFit: "contain", flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: 22,
        height: 22,
        margin: 2,
        flexShrink: 0,
        borderRadius: 5,
        border: "1.5px dashed color-mix(in srgb, var(--text-primary) 35%, transparent)",
      }}
    />
  );
}

const spriteHintStyle: CSSProperties = {
  margin: 0,
  color: T.muted,
  fontSize: "var(--font-size-xs)",
  lineHeight: "17px",
};

const spriteErrorStyle: CSSProperties = {
  margin: 0,
  color: T.danger,
  fontSize: "var(--font-size-xs)",
  lineHeight: "17px",
};

const inspectorColumnStyle: CSSProperties = floatingPanelStyle("right", 300);

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
