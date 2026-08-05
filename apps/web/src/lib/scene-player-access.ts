import type { SceneSessionRecord } from "@kawabunga/db";

export type SceneJoinAccess =
  | { ok: true }
  | { ok: false; status: 403 | 404 | 409; error: string };

export function authorizeSceneJoin(
  session: SceneSessionRecord | null,
  sceneId: string,
  userId: string,
): SceneJoinAccess {
  if (!session || session.sceneId !== sceneId) {
    return { ok: false, status: 404, error: "Scene session not found." };
  }
  if (session.userId !== userId) {
    return { ok: false, status: 403, error: "This scene session belongs to another visitor." };
  }
  if (session.status !== "active") {
    return { ok: false, status: 409, error: "This scene session has ended." };
  }
  return { ok: true };
}
