import { NextResponse } from "next/server";
import { endLiveScene } from "@kawabunga/live-scene/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sceneId: string; sessionId: string }> },
) {
  const viewer = await auth();
  if (!viewer?.user?.id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const { sceneId, sessionId } = await params;
  const payload = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const result = await endLiveScene({
    sceneId,
    sessionId,
    reason: typeof payload?.reason === "string" ? payload.reason : "left",
    source: "web-player",
    access: { kind: "owner", userId: viewer.user.id },
  });
  return result.status === 204
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json(result.body, { status: result.status });
}
