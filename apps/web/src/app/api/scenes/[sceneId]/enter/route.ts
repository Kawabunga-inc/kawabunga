import { NextRequest, NextResponse } from "next/server";
import { getSceneSessionStore, getSceneStore } from "@kawabunga/db";
import { auth } from "@/lib/auth";
import { isPublishableScene } from "@/lib/scene-lander";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> },
) {
  const { sceneId } = await params;
  const returnPath = `/scenes/${encodeURIComponent(sceneId)}?enter=1`;
  const viewer = await auth();

  if (!viewer?.user?.id) {
    const signInUrl = new URL("/auth/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", returnPath);
    return NextResponse.redirect(signInUrl, 303);
  }

  const scene = await getSceneStore().getSceneById(sceneId);
  if (!scene || !isPublishableScene(scene.status)) {
    return NextResponse.json({ error: "Scene not found." }, { status: 404 });
  }

  const sessions = getSceneSessionStore();
  const session = await sessions.createSession({
    userId: viewer.user.id,
    sceneId,
    mode: "voice",
    metadata: { source: "web-lander" },
  });
  await sessions.appendEvent({
    sessionId: session.id,
    type: "session.started",
    source: "web-lander",
    payload: { mode: "voice", sceneId },
  });

  return NextResponse.redirect(
    new URL(`/scenes/${encodeURIComponent(sceneId)}/session/${session.id}`, request.url),
    303,
  );
}
