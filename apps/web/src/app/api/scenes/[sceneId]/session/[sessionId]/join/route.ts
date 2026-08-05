import { NextResponse } from "next/server";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { getSceneSessionStore, getSceneStore } from "@kawabunga/db";
import {
  buildSceneSessionSnapshot,
  createInitialSceneState,
} from "@kawabunga/orchestration/client";
import { auth } from "@/lib/auth";
import { authorizeSceneJoin } from "@/lib/scene-player-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_TTL_SECONDS = 60 * 30;

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

  const scene = await getSceneStore().resolveOrchestratorScene(sceneId);
  if (!scene) {
    return NextResponse.json({ error: "Scene not found." }, { status: 404 });
  }

  if (session.initialScene == null && session.currentScene == null) {
    const snapshot = buildSceneSessionSnapshot(createInitialSceneState(scene));
    await sessions.initializeSceneState({
      sessionId,
      initialScene: snapshot,
      currentScene: snapshot,
    });
  }

  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "The live scene service is not configured." },
      { status: 503 },
    );
  }

  const room = `scene-${sceneId}-${sessionId}`;
  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity: viewer.user.id,
    ttl: TOKEN_TTL_SECONDS,
  });
  accessToken.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: false,
    canSubscribe: true,
  });

  return NextResponse.json({ url, token: await accessToken.toJwt() });
}
