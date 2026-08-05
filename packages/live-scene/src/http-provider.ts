import type {
  LiveSceneJournalCursors,
  LiveSceneProvider,
} from "./provider";
import type { SceneSessionJournalFeed } from "./lib/scene-session-journal";
import type { SceneTranscriptMessage } from "./lib/scene-captions";

export type LiveSceneHttpEndpoints = {
  join: string;
  end: string;
  transcript: string;
  journal?: string;
};

async function responseError(response: Response, fallback: string): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return new Error(typeof payload?.error === "string" ? payload.error : fallback);
}

export function createHttpLiveSceneProvider(
  endpoints: LiveSceneHttpEndpoints,
): LiveSceneProvider {
  return {
    async join() {
      const response = await fetch(endpoints.join, { method: "POST" });
      if (!response.ok) throw await responseError(response, "The scene could not be reached.");
      const payload = (await response.json()) as { url?: unknown; token?: unknown };
      if (typeof payload.url !== "string" || typeof payload.token !== "string") {
        throw new Error("The scene could not be reached.");
      }
      return { url: payload.url, token: payload.token };
    },
    async end(reason) {
      const response = await fetch(endpoints.end, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw await responseError(response, "The scene could not be ended.");
    },
    async fetchTranscript() {
      const response = await fetch(endpoints.transcript, { cache: "no-store" });
      if (!response.ok) throw await responseError(response, "Transcript unavailable");
      const payload = (await response.json()) as { messages?: SceneTranscriptMessage[] };
      return { messages: payload.messages ?? [] };
    },
    ...(endpoints.journal
      ? {
          async fetchJournal(cursors: LiveSceneJournalCursors) {
            const query = new URLSearchParams();
            if (cursors.turns) query.set("turnsSince", cursors.turns);
            if (cursors.events) query.set("eventsSince", cursors.events);
            const suffix = query.size ? `?${query}` : "";
            const response = await fetch(`${endpoints.journal}${suffix}`, { cache: "no-store" });
            if (!response.ok) {
              throw await responseError(
                response,
                `Session journal unavailable (${response.status})`,
              );
            }
            return (await response.json()) as SceneSessionJournalFeed;
          },
        }
      : {}),
  };
}
