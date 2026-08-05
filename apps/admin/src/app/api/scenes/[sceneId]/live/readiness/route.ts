import { GET as getReadiness } from "../../sandbox/readiness/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ sceneId: string }> },
) {
  return getReadiness(request, context);
}
