import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getChatProviderForModel } from "@kawabunga/engine";
import { getPropAssetStore, getSceneGraphStore, getSceneStore } from "@kawabunga/db";
import { resolveAdminAgentModel } from "@/lib/admin-agent/service";
import { PROP_ICON_KEYS } from "@/components/scene-stage/prop-icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── Generate set from premise ──────────────────────────────────────
 * Reads the scene (premise, opening beat, cast, zones) plus the prop
 * library, and asks the model to propose 4-8 set pieces with world
 * positions. Nothing is persisted — proposals render as ghosts on the
 * canvas and the user accepts or discards each one (the accept path is
 * the acceptGeneratedProp server action).
 *
 * LLM pattern per admin-agent/service.ts: provider-neutral complete(),
 * fence-strip, JSON.parse, zod-validate items individually.
 */

const proposalSchema = z.object({
  name: z.string().trim().min(1).max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/)
    .max(60)
    .optional(),
  description: z.string().trim().min(1).max(300).optional(),
  icon: z.string().trim().optional(),
  radiusM: z.number().positive().max(24).optional(),
  widthM: z.number().positive().max(48).optional(),
  heightM: z.number().positive().max(32).optional(),
  soundSource: z.boolean().optional(),
  position: z.object({
    x: z.number().min(-48).max(48),
    y: z.number().min(-32).max(32),
  }),
  reuseAssetSlug: z.string().trim().optional(),
});

export type GeneratedSetProposal = z.infer<typeof proposalSchema> & { id: string };

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> },
) {
  const { sceneId } = await params;

  const { model } = resolveAdminAgentModel();
  if (!model) {
    return NextResponse.json(
      { error: "Set generation needs OPENAI_API_KEY or ANTHROPIC_API_KEY." },
      { status: 501 },
    );
  }

  const scene = await getSceneStore().getSceneById(sceneId);
  if (!scene) {
    return NextResponse.json({ error: "scene not found" }, { status: 404 });
  }

  const [graph, assets] = await Promise.all([
    getSceneGraphStore().getGraph(sceneId),
    getPropAssetStore().list(),
  ]);

  const cast = graph.nodes.filter((n) => n.kind === "character").map((n) => n.label);
  const zones = graph.nodes.filter((n) => n.kind === "zone").map((n) => n.label);
  const existingProps = graph.nodes
    .filter((n) => n.kind === "prop")
    .map((n) => n.label);

  const system = [
    "You are a set designer for an overhead 2D stage (a top-down theater canvas).",
    "Propose physical set pieces for the scene described by the user.",
    "",
    "Rules:",
    "- Propose 4 to 8 pieces. Skip anything already on stage.",
    "- Coordinates are meters; origin is the stage center, +x right, +y up.",
    "- Keep the arrangement inside x in [-12, 12] and y in [-8, 8] (the default view), spread naturally — do not stack pieces on one spot.",
    "- Sizes are meters: round pieces get radiusM; rectangular pieces get widthM and heightM. A tent is ~4×3, a fire pit radius ~0.75, a table ~2×1.",
    `- icon must be one of: ${PROP_ICON_KEYS.join(", ")}.`,
    "- soundSource: true only for pieces sound naturally emanates from (fire, water).",
    "- If an existing library asset below fits, set reuseAssetSlug to its slug instead of inventing a duplicate.",
    "- slug: short kebab-case identifier for new pieces.",
    "- description: one sentence, written for a model that will read it later.",
    "",
    existingLibraryLine(assets),
    "",
    'Return ONLY valid JSON with this shape: {"items":[{"name":"…","slug":"…","description":"…","icon":"…","radiusM":0.75,"widthM":4,"heightM":3,"soundSource":false,"position":{"x":0,"y":0},"reuseAssetSlug":"…"}]}',
    "Omit fields that do not apply. No prose, no code fences.",
  ].join("\n");

  const user = [
    `Premise: ${scene.prompt || "(none)"}`,
    scene.definition.openingBeat ? `Opening beat: ${scene.definition.openingBeat}` : null,
    scene.definition.objective ? `Objective: ${scene.definition.objective}` : null,
    cast.length ? `Cast: ${cast.join(", ")}` : null,
    zones.length ? `Zones already drawn: ${zones.join(", ")}` : null,
    existingProps.length ? `Set pieces already on stage: ${existingProps.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const provider = getChatProviderForModel(model);
    const response = await provider.complete({
      model,
      system: [{ type: "text", text: system }],
      messages: [{ role: "user", content: user }],
      maxTokens: 1600,
    });

    const cleaned = response.text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "The model returned unparseable output — try again." },
        { status: 502 },
      );
    }

    const rawItems = Array.isArray((parsed as { items?: unknown }).items)
      ? ((parsed as { items: unknown[] }).items)
      : [];

    // Validate items individually — one malformed piece drops, the rest land.
    const proposals: GeneratedSetProposal[] = [];
    for (const raw of rawItems) {
      const result = proposalSchema.safeParse(raw);
      if (!result.success) continue;
      const item = result.data;
      proposals.push({
        ...item,
        // Unknown icon keys fall back to the neutral footprint square.
        icon: item.icon && PROP_ICON_KEYS.includes(item.icon) ? item.icon : undefined,
        id: crypto.randomUUID(),
      });
    }

    if (proposals.length === 0) {
      return NextResponse.json(
        { error: "The model proposed nothing usable — try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ proposals, model: response.model });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function existingLibraryLine(
  assets: Array<{ slug: string; name: string; description: string | null }>,
): string {
  if (assets.length === 0) return "The prop library is currently empty.";
  const lines = assets
    .slice(0, 40)
    .map((a) => `- ${a.slug}: ${a.name}${a.description ? ` — ${a.description}` : ""}`);
  return ["Existing prop library (reuse via reuseAssetSlug when it fits):", ...lines].join("\n");
}
