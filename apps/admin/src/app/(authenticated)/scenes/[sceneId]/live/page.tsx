import { notFound } from "next/navigation";
import { getSceneSessionStore, getSceneStore } from "@kawabunga/db";
import { AdminLiveScenePlayer } from "@/components/admin-live-scene-player";
import { auth } from "@/lib/auth";
import { classifySessionActivity } from "@/lib/session-activity";

export const dynamic = "force-dynamic";

export default async function AdminSceneLivePage({
  params,
  searchParams,
}: {
  params: Promise<{ sceneId: string }>;
  searchParams: Promise<{ sessionId?: string | string[] }>;
}) {
  const [{ sceneId }, query, viewer] = await Promise.all([params, searchParams, auth()]);
  if (!viewer?.user?.id || viewer.user.role !== "admin") notFound();

  const requestedSessionId =
    typeof query.sessionId === "string" && query.sessionId.trim()
      ? query.sessionId.trim()
      : null;
  if (!requestedSessionId) notFound();

  const [scene, detail, orchestratorScene] = await Promise.all([
    getSceneStore().getSceneById(sceneId),
    getSceneSessionStore().getSessionDetail(requestedSessionId),
    getSceneStore().resolveOrchestratorScene(sceneId),
  ]);
  const session = detail?.session ?? null;
  if (!scene || !session || session.sceneId !== sceneId) notFound();
  const activity = classifySessionActivity(session, detail?.events ?? [], detail?.turns ?? []);

  return (
    <AdminLiveScenePlayer
      sceneId={sceneId}
      sessionId={session.id}
      title={scene.title}
      startedAt={session.startedAt}
      endedAt={session.endedAt ?? null}
      ambience={orchestratorScene?.defaultAmbience ?? null}
      arcLength={orchestratorScene?.arc?.length ?? 0}
      sessionEnded={!activity.isActive}
    />
  );
}
