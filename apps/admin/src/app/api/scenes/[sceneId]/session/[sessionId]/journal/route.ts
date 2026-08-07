import { NextResponse } from "next/server";
import { fetchLiveSceneJournal } from "@kawabunga/live-scene/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sceneId: string; sessionId: string }> },
) {
  const viewer = await auth();
  if (!viewer?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (viewer.user.role !== "admin") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { sceneId, sessionId } = await params;
  const query = new URL(request.url).searchParams;
  const result = await fetchLiveSceneJournal({
    sceneId,
    sessionId,
    turnsSince: query.get("turnsSince"),
    eventsSince: query.get("eventsSince"),
  });
  return NextResponse.json(result.body, { status: result.status });
}
