# @kawabunga/live-scene

The production LiveKit scene player shared by the consumer web app and the
admin Run live route. This package is intentionally separate from
`@kawabunga/scene-player`, the legacy browser-SSE sandbox runner.

## Client contract

The package owns no application endpoint. Each host supplies this provider:

```ts
export interface LiveSceneProvider {
  join(): Promise<{ url: string; token: string }>;
  end(reason: string): Promise<void>;
  fetchTranscript(): Promise<{ messages: SceneTranscriptMessage[] }>;
  fetchJournal?(cursors: LiveSceneJournalCursors): Promise<SceneSessionJournalFeed>;
}

export type LiveSceneViewerContext = {
  isStaff: boolean;
};
```

`createHttpLiveSceneProvider` is an optional transport adapter. It accepts all
four URLs from the host app; it does not define or infer routes.

## Server contract

`@kawabunga/live-scene/server` exports framework-neutral shared cores:

- `joinLiveScene` validates the selected owner/staff policy, initializes a
  missing scene snapshot, and mints a token for
  `scene-<sceneId>-<sessionId>`.
- `endLiveScene` closes the session and writes the lifecycle journal event.
- `fetchLiveSceneTranscript` returns stable completed-turn prose.
- `fetchLiveSceneJournal` implements the shared incremental turn/event feed.
- `createAdminLiveSceneSession` creates owner-attributed voice sessions with
  `metadata.source = "admin-live"` for existing live-feed consumers.

Authentication resolution remains inside each Next.js route. Web routes pass
the owner policy. Admin routes server-check the admin role and pass the staff
policy.
