import type { SceneSessionRecord } from "@kawabunga/db";

export const WEB_PUBLISHABLE_SCENE_STATUS = "active" as const;

export function isPublishableScene(status: string): boolean {
  return status === WEB_PUBLISHABLE_SCENE_STATUS;
}

export function descriptionExcerpt(value: string, sentenceLimit = 3): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const sentences = normalized.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [normalized];
  return sentences
    .slice(0, sentenceLimit)
    .map((sentence) => sentence.trim())
    .join(" ");
}

export function characterInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export function latestArcBeatLabel(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const arcLanded = (snapshot as { arcLanded?: unknown }).arcLanded;
  if (!Array.isArray(arcLanded)) return null;

  for (let index = arcLanded.length - 1; index >= 0; index -= 1) {
    const label = arcLanded[index];
    if (typeof label === "string" && label.trim()) return label.trim();
  }
  return null;
}

export function latestSessionForUser(
  sessions: SceneSessionRecord[],
  userId: string,
): SceneSessionRecord | null {
  return sessions.find((session) => session.userId === userId) ?? null;
}

export function safeCallbackPath(
  value: string | string[] | undefined | null,
): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/dashboard";
  }
  return value;
}
