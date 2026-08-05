import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpLiveSceneProvider } from "./http-provider";

afterEach(() => vi.unstubAllGlobals());

describe("createHttpLiveSceneProvider", () => {
  it("uses only host-supplied endpoints for the complete connection contract", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "wss://live", token: "token" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        session: null, turns: [], events: [], cursors: { turns: null, events: null },
        truncated: { turns: false, events: false }, serverTime: "now",
      }) });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createHttpLiveSceneProvider({
      join: "/host/join",
      end: "/host/end",
      transcript: "/host/transcript",
      journal: "/host/journal",
    });

    await provider.join();
    await provider.end("left");
    await provider.fetchTranscript();
    await provider.fetchJournal?.({ turns: null, events: null });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/host/join",
      "/host/end",
      "/host/transcript",
      "/host/journal",
    ]);
  });
});
