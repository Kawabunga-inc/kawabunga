import { redirect } from "next/navigation";
import {
  getSceneGraphStore,
  getSceneSessionStore,
  getSceneStore,
  type SceneSessionEventRecord,
  type SceneSessionTurnRecord,
} from "@kawabunga/db";
import { DeepTheme } from "@/components/deep-theme";
import { VisitsView, type FreshVisit, type VisitCard } from "@/components/visits-view";
import { auth } from "@/lib/auth";
import {
  paginateSceneVisits,
  sessionDurationLabel,
  sessionOutcome,
  visitsSignInPath,
} from "@/lib/consumer-scenes";
import { classifySessionActivity } from "@/lib/session-activity";
import { sceneTurnsToTranscript } from "@/lib/scene-story";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;
const MAX_VISIBLE = 200;

function requestedCount(value: string | string[] | undefined): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : PAGE_SIZE;
  if (!Number.isFinite(parsed)) return PAGE_SIZE;
  return Math.min(MAX_VISIBLE, Math.max(PAGE_SIZE, Math.ceil(parsed / PAGE_SIZE) * PAGE_SIZE));
}

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string | string[] }>;
}) {
  const viewer = await auth();
  if (!viewer?.user?.id) redirect(visitsSignInPath());

  const query = await searchParams;
  const show = requestedCount(query.show);
  const store = getSceneSessionStore();
  const ownedSessions = await store.listSessionsForUser(viewer.user.id, 1_000);
  const { sessions, hasMore } = paginateSceneVisits(ownedSessions, show, MAX_VISIBLE);
  const sessionIds = sessions.map((session) => session.id);
  const [events, turns] = await Promise.all([
    store.listEventsForSessions(sessionIds),
    store.listTurnsForSessions(sessionIds),
  ]);

  const eventsBySession = new Map<string, SceneSessionEventRecord[]>();
  const turnsBySession = new Map<string, SceneSessionTurnRecord[]>();
  for (const event of events) {
    const rows = eventsBySession.get(event.sessionId) ?? [];
    rows.push(event);
    eventsBySession.set(event.sessionId, rows);
  }
  for (const turn of turns) {
    const rows = turnsBySession.get(turn.sessionId) ?? [];
    rows.push(turn);
    turnsBySession.set(turn.sessionId, rows);
  }

  const activity = new Map(
    sessions.map((session) => [
      session.id,
      classifySessionActivity(
        session,
        eventsBySession.get(session.id) ?? [],
        turnsBySession.get(session.id) ?? [],
      ),
    ]),
  );
  const freshSession = sessions.find((session) => activity.get(session.id)?.isActive) ?? null;
  const earlier = sessions.filter((session) => !activity.get(session.id)?.isActive);
  const sceneIds = Array.from(new Set(sessions.flatMap((session) => session.sceneId ? [session.sceneId] : [])));
  const sceneRows = await Promise.all(
    sceneIds.map(async (sceneId) => {
      const [scene, graph] = await Promise.all([
        getSceneStore().getSceneById(sceneId),
        getSceneGraphStore().getGraph(sceneId),
      ]);
      return [sceneId, scene, graph.nodes.filter((node) => node.kind === "event").length] as const;
    }),
  );
  const sceneById = new Map(sceneRows.map(([id, scene]) => [id, scene]));
  const arcLengthByScene = new Map(sceneRows.map(([id, , arcLength]) => [id, arcLength]));

  const fresh: FreshVisit | null = freshSession?.sceneId
    ? {
        sessionId: freshSession.id,
        sceneId: freshSession.sceneId,
        title: sceneById.get(freshSession.sceneId)?.title ?? "Your scene",
        ageMinutes: Math.max(0, Math.floor((activity.get(freshSession.id)?.ageMs ?? 0) / 60_000)),
      }
    : null;
  const cards: VisitCard[] = earlier.map((session) => {
    const sceneId = session.sceneId!;
    const transcript = sceneTurnsToTranscript(turnsBySession.get(session.id) ?? [], []);
    return {
      sessionId: session.id,
      sceneId,
      title: sceneById.get(sceneId)?.title ?? "A scene visit",
      startedAt: session.startedAt,
      duration: sessionDurationLabel(session),
      outcome: sessionOutcome(session, arcLengthByScene.get(sceneId) ?? 0),
      openingLine: transcript[0]?.text ?? "",
    };
  });
  const viewerInitial =
    viewer.user.name?.trim().charAt(0) || viewer.user.email?.trim().charAt(0) || "";

  return (
    <>
      <DeepTheme />
      <VisitsView
        viewerInitial={viewerInitial}
        fresh={fresh}
        visits={cards}
        hasMore={hasMore}
        nextShow={Math.min(MAX_VISIBLE, show + PAGE_SIZE)}
      />
    </>
  );
}
