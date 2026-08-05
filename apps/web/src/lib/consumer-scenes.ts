import type { SceneSessionRecord } from "@kawabunga/db";
import type { SceneRecord } from "@kawabunga/types";
import { descriptionExcerpt, latestArcBeatLabel, safeCallbackPath } from "./scene-lander";

export const NEW_SCENE_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;

export function visitsSignInPath(): string {
  return `/auth/signin?callbackUrl=${encodeURIComponent(safeCallbackPath("/visits"))}`;
}

export function paginateSceneVisits(
  sessions: SceneSessionRecord[],
  visible: number,
  maxVisible = 200,
): { sessions: SceneSessionRecord[]; hasMore: boolean } {
  const sceneSessions = sessions.filter((session) => Boolean(session.sceneId));
  return {
    sessions: sceneSessions.slice(0, visible),
    hasMore: sceneSessions.length > visible && visible < maxVisible,
  };
}

export function scenePublishedAt(scene: SceneRecord): string {
  const publishedAt = (scene as SceneRecord & { publishedAt?: unknown }).publishedAt;
  return typeof publishedAt === "string" && Number.isFinite(Date.parse(publishedAt))
    ? publishedAt
    : scene.createdAt;
}

export function selectBrowseScenes(scenes: SceneRecord[]): SceneRecord[] {
  return scenes
    .filter((scene) => scene.status === "active")
    .sort((a, b) => {
      const newest = scenePublishedAt(b).localeCompare(scenePublishedAt(a));
      return newest || a.id.localeCompare(b.id);
    });
}

export function isNewScene(scene: SceneRecord, nowMs = Date.now()): boolean {
  const publishedMs = Date.parse(scenePublishedAt(scene));
  const ageMs = nowMs - publishedMs;
  return Number.isFinite(publishedMs) && ageMs >= 0 && ageMs < NEW_SCENE_WINDOW_MS;
}

export function sceneHook(scene: SceneRecord): string {
  return descriptionExcerpt(scene.prompt, 2);
}

export function sceneCharacterCount(scene: SceneRecord): number {
  return scene.definition.nodes.filter((node) => node.kind === "character").length;
}

export function sceneHaloVariant(sceneId: string): 0 | 1 | 2 {
  let hash = 0;
  for (const character of sceneId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return (hash % 3) as 0 | 1 | 2;
}

export function sessionDurationLabel(session: SceneSessionRecord): string {
  const start = Date.parse(session.startedAt);
  const finish = Date.parse(session.endedAt ?? session.lastActiveAt);
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) return "duration unknown";
  const minutes = Math.max(1, Math.round((finish - start) / 60_000));
  return `${minutes} min`;
}

export function sessionOutcome(
  session: SceneSessionRecord,
  arcLength: number,
): { label: string; complete: boolean } | null {
  const label = latestArcBeatLabel(session.currentScene);
  if (!label) return null;
  const landed =
    session.currentScene && typeof session.currentScene === "object"
      ? (session.currentScene as { arcLanded?: unknown }).arcLanded
      : null;
  const landedCount = Array.isArray(landed)
    ? landed.filter((item) => typeof item === "string" && item.trim()).length
    : 0;
  return { label, complete: arcLength > 0 && landedCount >= arcLength };
}
