import type { SceneSessionJournalFeed } from "./lib/scene-session-journal";
import type { SceneTranscriptMessage } from "./lib/scene-captions";

export type LiveSceneJournalCursors = {
  turns: string | null;
  events: string | null;
};

export interface LiveSceneProvider {
  join(): Promise<{ url: string; token: string }>;
  end(reason: string): Promise<void>;
  fetchTranscript(): Promise<{ messages: SceneTranscriptMessage[] }>;
  fetchJournal?(cursors: LiveSceneJournalCursors): Promise<SceneSessionJournalFeed>;
}

export type LiveSceneViewerContext = {
  isStaff: boolean;
};
