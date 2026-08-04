import { notFound } from "next/navigation";
import { getSceneSessionStore } from "@kawabunga/db";
import { SessionDetailWorkbench } from "@/components/session-detail-workbench";
import { resolveScene } from "@/lib/scene-orchestration";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const sceneDetail = await getSceneSessionStore().getSessionDetail(sessionId);

  if (!sceneDetail) notFound();

  // The authored arc (for the pulse strip's beat markers) lives on the scene,
  // not the session — resolve it best-effort; sessions without a scene (or
  // with a deleted one) simply render no arc row.
  const scene = sceneDetail.session.sceneId
    ? await resolveScene(sceneDetail.session.sceneId).catch(() => null)
    : null;

  return (
    <SessionDetailWorkbench
      detail={sceneDetail}
      sceneArc={scene?.arc ?? []}
      sceneObjective={scene?.objective ?? null}
    />
  );
}
