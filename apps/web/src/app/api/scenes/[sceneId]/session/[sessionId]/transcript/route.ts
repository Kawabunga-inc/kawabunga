import { NextResponse } from "next/server";
import { getSceneSessionStore, getSceneStore } from "@kawabunga/db";
import { auth } from "@/lib/auth";
import { authorizeSceneTranscript } from "@/lib/scene-player-access";
import { sceneTurnsToTranscript } from "@/lib/scene-story";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string; sessionId: string }> },
) {
  const viewer = await auth();
  if (!viewer?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { sceneId, sessionId } = await params;
  const sessions = getSceneSessionStore();
  const [session, scene] = await Promise.all([
    sessions.getSession(sessionId),
    getSceneStore().resolveOrchestratorScene(sceneId),
  ]);
  const access = authorizeSceneTranscript(session, sceneId, viewer.user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!scene) {
    return NextResponse.json({ error: "Scene not found." }, { status: 404 });
  }

  const detail = await sessions.getSessionDetail(sessionId);
  if (!detail) {
    return NextResponse.json({ error: "Scene session not found." }, { status: 404 });
  }
  return NextResponse.json({ messages: sceneTurnsToTranscript(detail.turns, scene.characters) });
}
