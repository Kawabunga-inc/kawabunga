import { NextResponse } from "next/server";
import { getSceneSessionStore } from "@kawabunga/db";
import { auth } from "@/lib/auth";
import { authorizeSceneJoin } from "@/lib/scene-player-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string; sessionId: string }> },
) {
  const viewer = await auth();
  if (!viewer?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { sceneId, sessionId } = await params;
  const sessions = getSceneSessionStore();
  const session = await sessions.getSession(sessionId);
  const access = authorizeSceneJoin(session, sceneId, viewer.user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!session) {
    return NextResponse.json({ error: "Scene session not found." }, { status: 404 });
  }

  await sessions.endSession(sessionId, "ended", {
    ...(session.metadata ?? {}),
    reason: "left",
  });
  await sessions.appendEvent({
    sessionId,
    type: "session.ended",
    source: "web-player",
    payload: { reason: "left" },
  });
  return new NextResponse(null, { status: 204 });
}
