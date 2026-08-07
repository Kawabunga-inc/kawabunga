"use server";

import { revalidatePath } from "next/cache";
import { getArtifactAssetStore } from "@kawabunga/db";
import { auth } from "@/lib/auth";
import { isValidVoiceSlug, slugifyVoiceName } from "@/lib/voice-slug";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function createArtifactAsset(input: {
  name: string;
  slug?: string;
  description?: string | null;
  shape: "round" | "rect";
  radiusM?: number | null;
  widthM?: number | null;
  heightM?: number | null;
  soundSource?: boolean;
  tags?: string[];
}): Promise<ActionResult<{ id: string }>> {
  try {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Name is required." };

    const slug = (input.slug?.trim() || slugifyVoiceName(name)).toLowerCase();
    if (!isValidVoiceSlug(slug)) {
      return { ok: false, error: `Invalid slug "${slug}".` };
    }

    const store = getArtifactAssetStore();
    if (await store.getBySlug(slug)) {
      return { ok: false, error: `A prop with slug "${slug}" already exists.` };
    }

    const session = await auth().catch(() => null);
    const created = await store.create({
      slug,
      name,
      description: input.description?.trim() || null,
      // Footprint is either round or rectangular — never both.
      defaultRadiusM: input.shape === "round" ? input.radiusM ?? null : null,
      defaultWidthM: input.shape === "rect" ? input.widthM ?? null : null,
      defaultHeightM: input.shape === "rect" ? input.heightM ?? null : null,
      soundSource: input.soundSource ?? false,
      tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
      source: "manual",
      createdBy: session?.user?.id ?? null,
    });
    revalidatePath("/artifacts");
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function updateArtifactAssetMeta(
  artifactId: string,
  input: {
    name?: string;
    description?: string | null;
      shape?: "round" | "rect";
    radiusM?: number | null;
    widthM?: number | null;
    heightM?: number | null;
    soundSource?: boolean;
    tags?: string[];
  },
): Promise<ActionResult> {
  try {
    const name = input.name?.trim();
    if (name !== undefined && !name) {
      return { ok: false, error: "Name cannot be empty." };
    }
    const session = await auth().catch(() => null);
    const updated = await getArtifactAssetStore().update(artifactId, {
      ...(name !== undefined ? { name } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.shape === "round"
        ? {
            defaultRadiusM: input.radiusM ?? null,
            defaultWidthM: null,
            defaultHeightM: null,
          }
        : input.shape === "rect"
          ? {
              defaultRadiusM: null,
              defaultWidthM: input.widthM ?? null,
              defaultHeightM: input.heightM ?? null,
            }
          : {}),
      ...(input.soundSource !== undefined ? { soundSource: input.soundSource } : {}),
      ...(input.tags !== undefined
        ? { tags: input.tags.map((t) => t.trim()).filter(Boolean) }
        : {}),
      updatedBy: session?.user?.id ?? null,
    });
    if (!updated) return { ok: false, error: "Prop not found." };
    revalidatePath("/artifacts");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function archiveArtifactAsset(artifactId: string): Promise<ActionResult> {
  try {
    const session = await auth().catch(() => null);
    const updated = await getArtifactAssetStore().archive(artifactId, session?.user?.id ?? null);
    if (!updated) return { ok: false, error: "Prop not found." };
    revalidatePath("/artifacts");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function unarchiveArtifactAsset(artifactId: string): Promise<ActionResult> {
  try {
    const session = await auth().catch(() => null);
    const updated = await getArtifactAssetStore().unarchive(artifactId, session?.user?.id ?? null);
    if (!updated) return { ok: false, error: "Prop not found." };
    revalidatePath("/artifacts");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** Hard delete. Scene prop nodes referencing this asset will fail refId
 * hydration, so the grid only offers this behind a confirm; prefer archive. */
export async function deleteArtifactAsset(artifactId: string): Promise<ActionResult> {
  try {
    const removed = await getArtifactAssetStore().remove(artifactId);
    if (!removed) return { ok: false, error: "Prop not found." };
    revalidatePath("/artifacts");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
