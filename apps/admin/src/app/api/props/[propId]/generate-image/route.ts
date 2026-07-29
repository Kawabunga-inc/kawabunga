import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getPropAssetStore } from "@kawabunga/db";
import { stripNearBlackBackground } from "@/lib/image-alpha";
import { STAGE_ART_STYLES, isStageArtStyle } from "@/lib/stage-art-styles";
import {
  PROP_IMAGES_BUCKET,
  getSupabaseStorageClient,
} from "@/lib/supabase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* ── Generate a top-down sprite rendition for a prop asset ──────────
 * POST /api/props/:propId/generate-image  { style: "pixel" | ... }
 *
 * One rendition per art style, stored in prop_assets.images[style] so
 * a shared asset can look different per scene. gpt-image-2 dropped
 * native transparent backgrounds, so the sprite is prompted onto pure
 * black and the alpha is recovered with the same near-black knockout
 * the character thumbnails use.
 */

// Overridable so a newer model is a .env change, not a deploy.
const IMAGE_MODEL = process.env.IMAGE_GEN_MODEL?.trim() || "gpt-image-2";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ propId: string }> },
) {
  const { propId } = await ctx.params;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Sprite generation needs OPENAI_API_KEY." },
      { status: 501 },
    );
  }

  let body: { style?: string };
  try {
    body = (await req.json()) as { style?: string };
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

  const store = getPropAssetStore();
  const asset = await store.getById(propId);
  if (!asset) {
    return NextResponse.json({ error: "prop not found" }, { status: 404 });
  }

  const prompt = [
    `Top-down overhead view of ${asset.name}, seen directly from above (bird's-eye, 90 degrees), as a single game map asset.`,
    asset.description ? `It is ${asset.description}` : null,
    STAGE_ART_STYLES[style].prompt + ".",
    // Pure black ground so the knockout can recover alpha; no cast
    // shadows because they'd survive the knockout as gray fringes.
    "Centered, the object fills most of the frame, isolated on a completely pure black (#000000) background, no cast shadows, no ground texture, no text, no border.",
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
        size: "1024x1024",
        quality: "medium",
        output_format: "png",
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `image generation failed: ${detail.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    const b64 = payload.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { error: "image generation returned no image" },
        { status: 502 },
      );
    }

    // Knock out the black ground, trim dead margins, cap at 768px —
    // stage tokens render well under that.
    const knocked = await stripNearBlackBackground(Buffer.from(b64, "base64"));
    const processed = await sharp(knocked)
      .trim()
      .resize(768, 768, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();

    const objectPath = `${asset.id}/${style}-${Date.now()}.png`;
    const supabase = getSupabaseStorageClient();
    const { error: uploadError } = await supabase.storage
      .from(PROP_IMAGES_BUCKET)
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
      .from(PROP_IMAGES_BUCKET)
      .getPublicUrl(objectPath);

    const updated = await store.update(asset.id, {
      images: { ...asset.images, [style]: publicUrlData.publicUrl },
    });

    return NextResponse.json({ asset: updated, style, model: IMAGE_MODEL });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
