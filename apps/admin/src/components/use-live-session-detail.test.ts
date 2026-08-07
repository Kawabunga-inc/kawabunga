// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneSessionDetailRecord } from "@kawabunga/db";
import type { LiveSessionFeedResponse } from "@/lib/live-session-feed";
import { useLiveSessionDetail } from "./use-live-session-detail";

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

function seed(): SceneSessionDetailRecord {
  return {
    session: {
      id: "session-1",
      mode: "voice",
      status: "active",
      metadata: {},
      startedAt: "2026-08-04T10:00:00.000Z",
      endedAt: null,
      lastActiveAt: "2026-08-04T10:00:01.000Z",
    },
    user: null,
    contextBuilds: [],
    turns: [],
    events: [
      {
        id: "event-1",
        sessionId: "session-1",
        turnId: null,
        type: "session.started",
        source: "system",
        payload: {},
        createdAt: "2026-08-04T10:00:01.000Z",
      },
    ],
    audioArtifacts: [],
  };
}

function feed(
  status: "active" | "ended" = "active",
  overrides: Partial<LiveSessionFeedResponse> = {},
): LiveSessionFeedResponse {
  const initial = seed();
  return {
    session: {
      ...initial.session,
      status,
      endedAt: status === "ended" ? "2026-08-04T10:00:03.000Z" : null,
      lastActiveAt: "2026-08-04T10:00:03.000Z",
    },
    turns: [],
    events: [],
    cursors: {
      turns: null,
      events: "2026-08-04T10:00:01.000Z",
    },
    truncated: { turns: false, events: false },
    serverTime: "2026-08-04T10:00:03.000Z",
    ...overrides,
  };
}

function response(payload: LiveSessionFeedResponse) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

async function flushFetches() {
  await act(async () => {
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
  });
}

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useLiveSessionDetail lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T10:00:03.000Z"));
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => response(feed()));
    globalThis.fetch = fetchMock as typeof fetch;
    setVisibility("visible");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("does not fetch while hidden and resumes immediately when visible", async () => {
    setVisibility("hidden");
    const { unmount } = renderHook(() => useLiveSessionDetail(seed()));

    act(() => vi.advanceTimersByTime(6000));
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => setVisibility("visible"));
    await flushFetches();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("stops while paused and resumes with an immediate poll", async () => {
    const { result, unmount } = renderHook(() => useLiveSessionDetail(seed()));
    await flushFetches();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.lastEventAgeMs).toBe(2000);

    act(() => result.current.setPaused(true));
    act(() => vi.advanceTimersByTime(6000));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => result.current.setPaused(false));
    await flushFetches();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("performs exactly one settling fetch when a poll reveals the end", async () => {
    fetchMock
      .mockResolvedValueOnce(response(feed("ended")))
      .mockResolvedValueOnce(response(feed("ended")));
    const { result, unmount } = renderHook(() => useLiveSessionDetail(seed()));

    await flushFetches();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.isLive).toBe(false);

    act(() => vi.advanceTimersByTime(10000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("cleans up polling timers on unmount", async () => {
    const { unmount } = renderHook(() => useLiveSessionDetail(seed()));
    await flushFetches();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();
    vi.advanceTimersByTime(10000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds immediate truncated follow-ups to five", async () => {
    fetchMock.mockImplementation(async () =>
      response(
        feed("active", {
          truncated: { turns: true, events: false },
        }),
      ),
    );
    const { unmount } = renderHook(() => useLiveSessionDetail(seed()));

    await flushFetches();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    unmount();
  });
});
