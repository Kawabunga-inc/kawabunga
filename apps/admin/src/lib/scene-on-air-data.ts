import "server-only";

import {
  getSceneSessionStore,
  type SceneSessionDetailRecord,
} from "@kawabunga/db";
import {
  selectSceneOnAirSessions,
  type SceneOnAirCandidate,
} from "@/lib/scene-on-air";

export type SceneOnAirData = {
  candidates: SceneOnAirCandidate[];
  selectedDetail: SceneSessionDetailRecord | null;
};

function userLabel(detail: SceneSessionDetailRecord): string {
  const metadata = detail.session.metadata ?? {};
  const metadataLabel =
    typeof metadata.userName === "string" && metadata.userName.trim()
      ? metadata.userName.trim()
      : null;
  return (
    detail.user?.name?.trim() ||
    detail.user?.email ||
    metadataLabel ||
    "anonymous"
  );
}

/** Scene-scoped B3 batch classification plus one server-seeded detail. */
export async function getSceneOnAirData(
  sceneId: string,
  requestedSessionId?: string | null,
): Promise<SceneOnAirData> {
  const store = getSceneSessionStore();
  const sessions = await store.listSessionsForScene(sceneId, 50);
  const sessionIds = sessions.map((session) => session.id);
  const [events, turns] = await Promise.all([
    store.listEventsForSessions(sessionIds),
    store.listTurnsForSessions(sessionIds),
  ]);
  const active = selectSceneOnAirSessions(sessions, events, turns);
  if (active.length === 0) return { candidates: [], selectedDetail: null };

  // Active sets are normally one or two sessions. Hydrating just that small
  // set gives the picker honest user labels while only the selected detail is
  // passed into A2's continuing live feed.
  const details = (
    await Promise.all(active.map((session) => store.getSessionDetail(session.id)))
  ).filter(
    (detail): detail is SceneSessionDetailRecord =>
      detail !== null && detail.session.status === "active",
  );
  const selected =
    details.find((detail) => detail.session.id === requestedSessionId) ??
    details[0] ??
    null;

  return {
    candidates: details.map((detail) => ({
      id: detail.session.id,
      userLabel: userLabel(detail),
      startedAt: detail.session.startedAt,
    })),
    selectedDetail: selected,
  };
}
