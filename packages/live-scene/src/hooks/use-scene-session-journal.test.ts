// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSceneSessionJournal } from "./use-scene-session-journal";

const feed = {
  session: { id: "session-1", sceneId: "scene-1", mode: "voice", status: "active", startedAt: "2026-08-04T00:00:00.000Z", lastActiveAt: "2026-08-04T00:00:00.000Z" },
  turns: [], events: [], cursors: { turns: null, events: null },
  truncated: { turns: false, events: false }, serverTime: "2026-08-04T00:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("useSceneSessionJournal settling", () => {
  it("fetches once after scene-ended, then settles without continuing live polling", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => feed });
    vi.stubGlobal("fetch", fetchMock);
    const provider = { fetchJournal: vi.fn().mockResolvedValue(feed) };
    const onSettled = vi.fn();
    const { rerender, unmount } = renderHook(
      (props: { live: boolean; settle: boolean }) => useSceneSessionJournal({
        sceneId: "scene-1", sessionId: "session-1", open: true,
        provider,
        live: props.live, settle: props.settle, onSettled,
      }),
      { initialProps: { live: true, settle: false } },
    );
    await waitFor(() => expect(provider.fetchJournal).toHaveBeenCalledTimes(1));

    rerender({ live: false, settle: true });
    await waitFor(() => expect(provider.fetchJournal).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    rerender({ live: false, settle: true });
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(provider.fetchJournal).toHaveBeenCalledTimes(2);
    unmount();
  });
});
