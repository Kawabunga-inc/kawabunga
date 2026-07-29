import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getSceneGraphStore, getSceneStore } from "@kawabunga/db";
import { STAGE_ART_STYLES, isStageArtStyle } from "@/lib/stage-art-styles";
import {
  ARTIFACT_IMAGES_BUCKET,
  getSupabaseStorageClient,
} from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* ── Generate the scene's terrain plate ─────────────────────────────
 * POST /api/scenes/:sceneId/generate-background  { style, styleDirection? }
 *
 * One background per art style, covering the full 96×64 world rect at
 * 1536×1024 (the world's exact 3:2). Terrain ONLY — artifacts layer
 * above it with alpha, so the prompt forbids objects/structures and no
 * placement snapshot is passed: baking today's layout into the ground
 * would leave stale voids and shadows the moment something is dragged.
 * Zones ride along as text hints so the terrain feels authored.
 *
 * The route deliberately does NOT write the scene definition — the
 * editor autosaves the full stage object from client state, so a
 * server-side write here would be clobbered by the next stale
 * autosave. The client merges the returned URL into stage.backgrounds.
 */

const IMAGE_MODEL = process.env.IMAGE_GEN_MODEL?.trim() || "gpt-image-2";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sceneId: string }> },
) {
  const { sceneId } = await ctx.params;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Background generation needs OPENAI_API_KEY." },
      { status: 501 },
    );
  }

  let body: { style?: string; styleDirection?: string };
  try {
    body = (await req.json()) as { style?: string; styleDirection?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const style = body.style;
  if (!isStageArtStyle(style)) {
    return NextResponse.json(
      { error: `style must be one of: ${Object.keys(STAGE_ART_STYLES).join(", ")}` },
      { status: 400 },
    );
  }
  const styleDirection = body.styleDirection?.trim().slice(0, 300) || null;

  const scene = await getSceneStore().getSceneById(sceneId);
  if (!scene) {
    return NextResponse.json({ error: "scene not found" }, { status: 404 });
  }
  const graph = await getSceneGraphStore().getGraph(sceneId);

  // Zones as text hints: semantic and stable, unlike artifact positions.
  const zoneHints = graph.nodes
    .filter((n) => n.kind === "zone")
    .map((n) => {
      const pos = n.position;
      const region =
        pos == null
          ? null
          : pos.y > 8
            ? "to the north"
            : pos.y < -8
              ? "to the south"
              : pos.x > 12
                ? "to the east"
                : pos.x < -12
                  ? "to the west"
                  : "near the center";
      return region ? `${n.label} ${region}` : n.label;
    });

  const prompt = [
    "Orthographic top-down terrain plate for a 2D stage map, seen directly from above (bird's-eye, 90 degrees).",
    `The setting: ${scene.prompt || scene.title}.`,
    zoneHints.length
      ? `Suggest these areas in the ground itself (paths, wear, vegetation changes): ${zoneHints.join("; ")}.`
      : null,
    "Terrain and ground only: soil, stone, sand, grass, paths, subtle vegetation and natural variation. Absolutely no objects, buildings, tents, furniture, creatures, people, text, icons, or UI.",
    STAGE_ART_STYLES[style].prompt + (styleDirection ? `, ${styleDirection}.` : "."),
    "Full-bleed edge to edge, no border, no vignette, gentle non-repeating variation so it reads as one continuous ground.",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        n: 1,
        // 3:2 — the exact aspect of the 96×64 m world rect it covers.
        size: "1536x1024",
        quality: "medium",
        output_format: "png",
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `background generation failed: ${detail.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const b64 = payload.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { error: "background generation returned no image" },
        { status: 502 },
      );
    }

    // Opaque full-bleed plate — no knockout. Re-encode to keep the
    // pipeline uniform and cap any oversized model output.
    const processed = await sharp(Buffer.from(b64, "base64"))
      .resize(1536, 1024, { fit: "cover" })
      .png()
      .toBuffer();

    const objectPath = `backgrounds/${sceneId}/${style}-${Date.now()}.png`;
    const supabase = getSupabaseStorageClient();
    const { error: uploadError } = await supabase.storage
      .from(ARTIFACT_IMAGES_BUCKET)
      .upload(objectPath, processed, {
        contentType: "image/png",
        cacheControl: "public, max-age=31536000, immutable",
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json(
        { error: `upload failed: ${uploadError.message}` },
        { status: 500 },
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from(ARTIFACT_IMAGES_BUCKET)
      .getPublicUrl(objectPath);

    return NextResponse.json({ url: publicUrlData.publicUrl, style, model: IMAGE_MODEL });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
