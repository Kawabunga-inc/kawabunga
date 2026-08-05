import { notFound, redirect } from "next/navigation";
import { getSceneSessionStore, getSceneStore } from "@kawabunga/db";
import { ScenePlayer } from "@/components/scene-player/scene-player";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SceneSessionPage({
  params,
}: {
  params: Promise<{ sceneId: string; sessionId: string }>;
}) {
  const { sceneId, sessionId } = await params;
  const viewer = await auth();
  if (!viewer?.user?.id) {
    redirect(
      `/auth/signin?callbackUrl=${encodeURIComponent(`/scenes/${sceneId}/session/${sessionId}`)}`,
    );
  }

  const [scene, session, orchestratorScene] = await Promise.all([
    getSceneStore().getSceneById(sceneId),
    getSceneSessionStore().getSession(sessionId),
    getSceneStore().resolveOrchestratorScene(sceneId),
  ]);
  if (
    !scene ||
    !session ||
    session.sceneId !== sceneId ||
    session.userId !== viewer.user.id
  ) {
    notFound();
  }

  return <ScenePlayer
    sceneId={sceneId}
    sessionId={sessionId}
    title={scene.title}
    startedAt={session.startedAt}
    endedAt={session.endedAt ?? null}
    ambience={orchestratorScene?.defaultAmbience ?? null}
    arcLength={orchestratorScene?.arc?.length ?? 0}
    staff={viewer.user.role === "admin"}
    adminBaseUrl={process.env.NEXT_PUBLIC_ADMIN_BASE_URL ?? "http://localhost:3001"}
    sessionEnded={session.status !== "active"}
  />;
}
