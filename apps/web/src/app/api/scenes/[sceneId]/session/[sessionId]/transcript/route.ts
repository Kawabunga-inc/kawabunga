import { NextResponse } from "next/server";
import { fetchLiveSceneTranscript } from "@kawabunga/live-scene/server";
import { auth } from "@/lib/auth";

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
  const result = await fetchLiveSceneTranscript({
    sceneId,
    sessionId,
    access: { kind: "owner", userId: viewer.user.id },
  });
  return NextResponse.json(result.body, { status: result.status });
}
