import type { SceneSessionTurnRecord } from "@kawabunga/db";
import type { SceneCharacter } from "@kawabunga/types";
import type { SceneTranscriptMessage } from "./scene-captions";

export function sceneTurnsToTranscript(
  turns: SceneSessionTurnRecord[],
  characters: SceneCharacter[],
): SceneTranscriptMessage[] {
  const names = new Map(characters.map((character) => [character.characterSlug, character.displayName]));
  // Streaming and aborted rows are mutable/incomplete; LiveKit owns those lines.
  return turns.filter((turn) => turn.status === "completed").flatMap((turn) => {
    const messages: SceneTranscriptMessage[] = [];
    const userText = turn.userText?.trim();
    const assistantText = turn.assistantText?.trim();
    if (userText) {
      messages.push({
        role: "user",
        id: `history:${turn.id}:user`,
        text: userText,
        final: true,
        speaker: { slug: "user", name: "You" },
      });
    }
    if (assistantText) {
      const slug = turn.speakerSlug?.trim() || "narrator";
      messages.push({
        role: "agent",
        id: `history:${turn.id}:agent`,
        text: assistantText,
        final: true,
        speaker: {
          slug,
          name: slug === "narrator" ? "Narrator" : names.get(slug) ?? slug,
        },
      });
    }
    return messages;
  });
}

export function visitTimeOfDay(startedAt: string): "morning" | "afternoon" | "evening" | "night" {
  const hour = new Date(startedAt).getHours();
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}
