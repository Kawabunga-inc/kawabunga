import { NextRequest, NextResponse } from "next/server";
import { getSceneGraphStore, getSceneSessionStore, getSceneStore } from "@kawabunga/db";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateBody = {
  id?: string;
  sceneId?: string | null;
  characterId?: string | null;
  mode?: string;
  initialScene?: unknown;
  currentScene?: unknown;
  metadata?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const mode = body.mode?.trim();
  if (!mode) {
    return NextResponse.json({ error: "mode is required." }, { status: 400 });
  }

  try {
    const session = await auth().catch(() => null);
    const record = await getSceneSessionStore().createSession({
      id: body.id,
      userId: session?.user?.id ?? null,
      sceneId: body.sceneId ?? null,
      characterId: body.characterId ?? null,
      mode,
      initialScene: body.initialScene,
      currentScene: body.currentScene,
      metadata: body.metadata ?? {},
    });
    await getSceneSessionStore().appendEvent({
      sessionId: record.id,
      type: "session.started",
      source: "system",
      payload: {
        mode,
        sceneId: body.sceneId ?? null,
        characterId: body.characterId ?? null,
      },
    });
    await appendStageSnapshot(record.id, body.sceneId ?? null);
    return NextResponse.json({ session: record }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* Dormant spatial hook: record the scene's authored blocking (stage
 * config + world-space placements) as an append-only session event.
 * Nothing reads it yet — it exists so sessions carry their starting
 * blocking from day one and future spatial features can backfill.
 * Never blocks session creation. */
async function appendStageSnapshot(sessionId: string, sceneId: string | null) {
  if (!sceneId) return;
  try {
    const [scene, graph] = await Promise.all([
      getSceneStore().getSceneById(sceneId),
      getSceneGraphStore().getGraph(sceneId),
    ]);
    if (!scene) return;

    // In-bounds meters only (legacy pixel rows read as unplaced) — plus
    // anchored sounds, which have no position of their own but emanate
    // from their artifact.
    const placements = graph.nodes
      .filter(
        (node) =>
          (node.position &&
            Math.abs(node.position.x) <= 48 &&
            Math.abs(node.position.y) <= 32) ||
          typeof node.data.anchorNodeId === "string",
      )
      .map((node) => ({
        nodeId: node.id,
        kind: node.kind,
        refId: node.refId,
        label: node.label,
        position: node.position,
        ...(typeof node.data.earshotM === "number" ? { earshotM: node.data.earshotM } : {}),
        ...(typeof node.data.rangeM === "number" ? { rangeM: node.data.rangeM } : {}),
        ...(typeof node.data.anchorNodeId === "string"
          ? { anchorNodeId: node.data.anchorNodeId }
          : {}),
        ...(node.kind === "zone"
          ? {
              shape: node.data.shape,
              widthM: node.data.widthM,
              heightM: node.data.heightM,
            }
          : {}),
      }));

    const stage = scene.definition.stage ?? null;
    if (!stage && placements.length === 0) return;

    await getSceneSessionStore().appendEvent({
      sessionId,
      type: "stage.snapshot",
      source: "system",
      payload: { stage, placements },
    });
  } catch (err) {
    console.warn("stage.snapshot event skipped:", err);
  }
}

export async function GET() {
  try {
    const sessions = await getSceneSessionStore().listSessions(50);
    return NextResponse.json({ sessions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
