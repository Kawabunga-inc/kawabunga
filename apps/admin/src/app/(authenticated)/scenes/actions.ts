"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getAudioAssetStore,
  getArtifactAssetStore,
  getSceneStore,
  getSceneGraphStore,
} from "@kawabunga/db";
import type { StageNodePosition } from "@kawabunga/db";
import type { StageConfig } from "@kawabunga/types";
import { invalidateScenesList } from "@/lib/scenes-cache";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function createScene(input: {
  title: string;
  prompt?: string;
}): Promise<ActionResult<{ id: string }>> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  const scene = await getSceneStore().createScene({
    userId: null,
    title,
    prompt: input.prompt?.trim() || "",
  });

  revalidatePath("/scenes");
  invalidateScenesList();
  redirect(`/scenes/${scene.id}`);
}

export async function updateSceneConfig(
  id: string,
  updates: {
    title?: string;
    prompt?: string;
    status?: "draft" | "active" | "archived";
    openingBeat?: string;
    defaultAmbience?: string | null;
    narratorVoiceId?: string | null;
    /** What the scene is driving toward — the director's authored destination. */
    objective?: string | null;
    /** How hard the director presses toward goals. null = balanced. */
    drive?: "gentle" | "balanced" | "insistent" | null;
    /** Who originates beats between visitor turns. null = user-paced. */
    initiative?: "user" | "shared" | "narrator" | null;
    /** Whether the visitor enters as themselves or an authored role. */
    userRole?: "visitor" | "character" | null;
    userCharacter?: {
      name: string;
      blurb: string;
      relationship?: string;
    } | null;
    /** Whether narrator-addressed world declarations have director authority. */
    userDirector?: boolean | null;
    /** The unseen narrator's authored opening lines, played on entry. */
    openingNarration?: string | null;
    /** Narrator presence. null = minimal (the default). */
    narrator?: "off" | "minimal" | "scenic" | null;
    /** Extra authored openings; one is chosen per session. */
    openingNarrationVariants?: string[] | null;
    /** How the opening is produced. null = authored when a line exists. */
    openingMode?: "authored" | "generated" | "off" | null;
    /** Overhead-canvas stage settings (ground color, snap, viewport, spawn). */
    stage?: StageConfig | null;
  },
): Promise<ActionResult> {
  const {
    title,
    prompt,
    status,
    openingBeat,
    defaultAmbience,
    narratorVoiceId,
    objective,
    drive,
    initiative,
    userRole,
    userCharacter,
    userDirector,
    openingNarration,
    narrator,
    openingNarrationVariants,
    openingMode,
    stage,
  } = updates;

  const definitionPatch: Record<string, unknown> = {};
  if (openingBeat !== undefined) definitionPatch.openingBeat = openingBeat;
  if (defaultAmbience !== undefined) definitionPatch.defaultAmbience = defaultAmbience;
  if (narratorVoiceId !== undefined) definitionPatch.narratorVoiceId = narratorVoiceId;
  if (objective !== undefined) definitionPatch.objective = objective;
  if (drive !== undefined) definitionPatch.drive = drive;
  if (initiative !== undefined) definitionPatch.initiative = initiative;
  if (userRole !== undefined) definitionPatch.userRole = userRole;
  if (userCharacter !== undefined) definitionPatch.userCharacter = userCharacter;
  if (userDirector !== undefined) definitionPatch.userDirector = userDirector;
  if (openingNarration !== undefined) definitionPatch.openingNarration = openingNarration;
  if (narrator !== undefined) definitionPatch.narrator = narrator;
  if (openingNarrationVariants !== undefined) {
    definitionPatch.openingNarrationVariants = openingNarrationVariants;
  }
  if (openingMode !== undefined) definitionPatch.openingMode = openingMode;
  if (stage !== undefined) definitionPatch.stage = stage;

  const updated = await getSceneStore().updateScene(id, {
    title,
    prompt,
    status,
    definition: Object.keys(definitionPatch).length ? definitionPatch : undefined,
  });
  if (!updated) return { ok: false, error: "Scene not found." };

  revalidatePath(`/scenes/${id}`);
  revalidatePath("/scenes");
  invalidateScenesList();
  return { ok: true };
}

export async function addCharacterToScene(
  sceneId: string,
  characterId: string,
): Promise<ActionResult<{ nodeId: string }>> {
  try {
    const node = await getSceneGraphStore().ingestCharacter(sceneId, characterId);
    revalidatePath(`/scenes/${sceneId}`);
    revalidatePath("/scenes");
    invalidateScenesList();
    return { ok: true, data: { nodeId: node.id } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to add character.",
    };
  }
}

export async function addAudioToScene(
  sceneId: string,
  input: {
    assetId: string;
    role: "bed" | "oneshot";
    isDefault?: boolean;
    triggerHint?: string | null;
  },
): Promise<ActionResult<{ nodeId: string }>> {
  const assetId = input.assetId.trim();
  if (!assetId) return { ok: false, error: "Pick a sound from the library." };

  try {
    const asset = await getAudioAssetStore().getById(assetId);
    if (!asset) return { ok: false, error: "Sound not found in the library." };

    const node = await getSceneGraphStore().createNode({
      sceneId,
      kind: "audio",
      refId: asset.id,
      label: asset.name,
      summary: asset.description,
      data: {
        role: input.role,
        ...(input.isDefault && input.role === "bed" ? { isDefault: true } : {}),
        ...(input.triggerHint?.trim()
          ? { triggerHint: input.triggerHint.trim() }
          : {}),
      },
    });
    revalidatePath(`/scenes/${sceneId}`);
    revalidatePath("/scenes");
    invalidateScenesList();
    return { ok: true, data: { nodeId: node.id } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to add audio.",
    };
  }
}

export async function addEventToScene(
  sceneId: string,
  input: {
    label: string;
    summary?: string | null;
    /** Position in the arc — the client passes max(existing)+1. */
    timeIndex: number;
  },
): Promise<ActionResult<{ nodeId: string }>> {
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Beat label is required." };

  try {
    const node = await getSceneGraphStore().createNode({
      sceneId,
      kind: "event",
      label,
      summary: input.summary?.trim() || null,
      data: { timeIndex: Math.trunc(input.timeIndex) },
    });
    revalidatePath(`/scenes/${sceneId}`);
    revalidatePath("/scenes");
    invalidateScenesList();
    return { ok: true, data: { nodeId: node.id } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to add arc beat.",
    };
  }
}

export async function addArtifactToScene(
  sceneId: string,
  input: {
    label: string;
    icon?: string;
    widthM?: number;
    heightM?: number;
    radiusM?: number;
    soundSource?: boolean;
    position?: StageNodePosition | null;
  },
): Promise<ActionResult<{ nodeId: string }>> {
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Prop label is required." };

  try {
    const node = await getSceneGraphStore().createNode({
      sceneId,
      kind: "artifact",
      label,
      data: {
        ...(input.icon?.trim() ? { icon: input.icon.trim() } : {}),
        ...(input.widthM ? { widthM: input.widthM } : {}),
        ...(input.heightM ? { heightM: input.heightM } : {}),
        ...(input.radiusM ? { radiusM: input.radiusM } : {}),
        ...(input.soundSource ? { soundSource: true } : {}),
      },
      position: input.position ?? null,
    });
    revalidatePath(`/scenes/${sceneId}`);
    revalidatePath("/scenes");
    invalidateScenesList();
    return { ok: true, data: { nodeId: node.id } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to add prop.",
    };
  }
}

/** Place a library set piece. The node stays thin (data = {}) — icon
 * and footprint come from the asset at render time; inspector edits
 * write per-placement overrides into data. */
export async function addArtifactFromLibrary(
  sceneId: string,
  input: { assetId: string; position?: StageNodePosition | null },
): Promise<ActionResult<{ nodeId: string }>> {
  try {
    const asset = await getArtifactAssetStore().getById(input.assetId);
    if (!asset) return { ok: false, error: "Prop not found in the library." };

    const node = await getSceneGraphStore().createNode({
      sceneId,
      kind: "artifact",
      refId: asset.id,
      label: asset.name,
      summary: asset.description,
      data: {},
      position: input.position ?? null,
    });
    revalidatePath(`/scenes/${sceneId}`);
    revalidatePath("/scenes");
    invalidateScenesList();
    return { ok: true, data: { nodeId: node.id } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to place prop.",
    };
  }
}

/** Accept one generated set-piece proposal: resolve or create the
 * library asset (source "generated", provenance = the scene premise),
 * then place a ref-backed node at the proposed position. */
export async function acceptGeneratedArtifact(
  sceneId: string,
  proposal: {
    name: string;
    slug?: string;
    description?: string;
    radiusM?: number;
    widthM?: number;
    heightM?: number;
    soundSource?: boolean;
    position: { x: number; y: number };
    reuseAssetSlug?: string;
  },
): Promise<ActionResult<{ nodeId: string; assetId: string }>> {
  try {
    const scene = await getSceneStore().getSceneById(sceneId);
    if (!scene) return { ok: false, error: "Scene not found." };

    const store = getArtifactAssetStore();
    const slug = (proposal.reuseAssetSlug ?? proposal.slug ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      || proposal.name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug) return { ok: false, error: "Proposal has no usable slug." };

    let asset = await store.getBySlug(slug);
    if (!asset) {
      asset = await store.create({
        slug,
        name: proposal.name.trim(),
        description: proposal.description?.trim() || null,
        defaultRadiusM: proposal.radiusM ?? null,
        defaultWidthM: proposal.radiusM ? null : proposal.widthM ?? null,
        defaultHeightM: proposal.radiusM ? null : proposal.heightM ?? null,
        soundSource: proposal.soundSource ?? false,
        source: "generated",
        generationPrompt: scene.prompt || null,
      });
    }

    // Snap to the half-meter grid and clamp to the world.
    const snap = (v: number) => Math.round(v * 2) / 2;
    const position = {
      x: Math.min(48, Math.max(-48, snap(proposal.position.x))),
      y: Math.min(32, Math.max(-32, snap(proposal.position.y))),
    };

    const node = await getSceneGraphStore().createNode({
      sceneId,
      kind: "artifact",
      refId: asset.id,
      label: asset.name,
      summary: asset.description,
      data: {},
      position,
    });
    revalidatePath(`/scenes/${sceneId}`);
    revalidatePath("/scenes");
    revalidatePath("/artifacts");
    invalidateScenesList();
    return { ok: true, data: { nodeId: node.id, assetId: asset.id } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to accept proposal.",
    };
  }
}

/* Promote an ad-hoc artifact node to a library asset so its media can
 * be generated (renditions live on artifact_assets, keyed by style).
 * The node keeps its placement and dimension overrides; the asset takes
 * the label, summary, and dimensions as its defaults. */
export async function promoteArtifactToLibrary(
  sceneId: string,
  nodeId: string,
): Promise<ActionResult<{ assetId: string }>> {
  try {
    const graph = getSceneGraphStore();
    const node = await graph.getNode(nodeId);
    if (!node || node.sceneId !== sceneId) {
      return { ok: false, error: "Scene node not found." };
    }
    if (node.kind !== "artifact") {
      return { ok: false, error: "Only artifacts can be promoted." };
    }
    if (node.refId) return { ok: true, data: { assetId: node.refId } };

    const store = getArtifactAssetStore();
    const base =
      node.label.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") ||
      "artifact";
    let slug = base;
    for (let i = 2; (await store.getBySlug(slug)) !== null; i += 1) {
      slug = `${base}-${i}`;
    }

    const asset = await store.create({
      slug,
      name: node.label,
      description: node.summary,
      defaultRadiusM: typeof node.data.radiusM === "number" ? node.data.radiusM : null,
      defaultWidthM: typeof node.data.widthM === "number" ? node.data.widthM : null,
      defaultHeightM: typeof node.data.heightM === "number" ? node.data.heightM : null,
      soundSource: node.data.soundSource === true,
      source: "manual",
    });

    await graph.updateNode(nodeId, { refId: asset.id });

    revalidatePath(`/scenes/${sceneId}`);
    revalidatePath("/artifacts");
    invalidateScenesList();
    return { ok: true, data: { assetId: asset.id } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to promote artifact.",
    };
  }
}

export async function addZoneToScene(
  sceneId: string,
  input: {
    label: string;
    shape: "rect" | "ellipse";
    widthM: number;
    heightM: number;
    color?: string;
    position?: StageNodePosition | null;
  },
): Promise<ActionResult<{ nodeId: string }>> {
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Zone label is required." };

  try {
    const node = await getSceneGraphStore().createNode({
      sceneId,
      kind: "zone",
      label,
      data: {
        shape: input.shape,
        widthM: input.widthM,
        heightM: input.heightM,
        ...(input.color?.trim() ? { color: input.color.trim() } : {}),
      },
      position: input.position ?? null,
    });
    revalidatePath(`/scenes/${sceneId}`);
    revalidatePath("/scenes");
    invalidateScenesList();
    return { ok: true, data: { nodeId: node.id } };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to add zone.",
    };
  }
}

export async function removeSceneNode(
  sceneId: string,
  nodeId: string,
): Promise<ActionResult> {
  const removed = await getSceneGraphStore().removeNode(nodeId);
  if (!removed) return { ok: false, error: "Node not found." };
  revalidatePath(`/scenes/${sceneId}`);
  revalidatePath("/scenes");
  invalidateScenesList();
  return { ok: true };
}

export async function updateSceneNode(
  sceneId: string,
  nodeId: string,
  updates: {
    label?: string;
    summary?: string | null;
    data?: Record<string, unknown>;
    position?: StageNodePosition | null;
  },
): Promise<ActionResult> {
  const graph = getSceneGraphStore();
  const node = await graph.getNode(nodeId);
  if (!node || node.sceneId !== sceneId) {
    return { ok: false, error: "Scene node not found." };
  }

  const updated = await graph.updateNode(nodeId, updates);
  if (!updated) return { ok: false, error: "Scene node not found." };

  revalidatePath(`/scenes/${sceneId}`);
  revalidatePath("/scenes");
  invalidateScenesList();
  return { ok: true };
}

export async function archiveScene(id: string): Promise<ActionResult> {
  const ok = await getSceneStore().archiveScene(id);
  if (!ok) return { ok: false, error: "Scene not found." };
  revalidatePath("/scenes");
  invalidateScenesList();
  return { ok: true };
}
