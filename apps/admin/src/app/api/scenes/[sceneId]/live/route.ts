import { NextResponse } from "next/server";
import { createAdminLiveSceneSession } from "@kawabunga/live-scene/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> },
) {
  const viewer = await auth();
  if (!viewer?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (viewer.user.role !== "admin") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { sceneId } = await params;
  const result = await createAdminLiveSceneSession({ sceneId, userId: viewer.user.id });
  if (result.status !== 201 || !("session" in result.body)) {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.redirect(
    new URL(
      `/scenes/${encodeURIComponent(sceneId)}/live?sessionId=${encodeURIComponent(result.body.session.id)}`,
      request.url,
    ),
    303,
  );
}
