"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_SCENE_SESSION_JOURNAL,
  mergeSceneSessionJournal,
  shouldPollSceneSessionJournal,
  type SceneSessionJournalFeed,
  type SceneSessionJournalState,
} from "../lib/scene-session-journal";
import type { LiveSceneProvider } from "../provider";

const POLL_MS = 2_000;

export function useSceneSessionJournal(input: {
  sceneId: string;
  sessionId: string;
  provider: LiveSceneProvider;
  open: boolean;
  live: boolean;
  settle: boolean;
  onSettled(): void;
}): SceneSessionJournalState & { error: string | null } {
  const { provider, open, live, settle, onSettled } = input;
  const [state, setState] = useState(EMPTY_SCENE_SESSION_JOURNAL);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" || document.visibilityState === "visible",
  );
  const inFlight = useRef(false);
  const settledRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const fetchOnce = useCallback(async (): Promise<"fetched" | "busy"> => {
    if (inFlight.current) return "busy";
    inFlight.current = true;
    try {
      if (!provider.fetchJournal) throw new Error("Session journal unavailable");
      const feed: SceneSessionJournalFeed = await provider.fetchJournal(stateRef.current.cursors);
      setState((current) => mergeSceneSessionJournal(current, feed));
      setError(null);
      return "fetched";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return "fetched";
    } finally {
      inFlight.current = false;
    }
  }, [provider]);

  useEffect(() => {
    if (!shouldPollSceneSessionJournal({ open, visible, live })) return;
    void fetchOnce();
    const timer = window.setInterval(() => void fetchOnce(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [fetchOnce, live, open, visible]);

  useEffect(() => {
    if (!settle || settledRef.current) return;
    settledRef.current = true;
    let cancelled = false;
    const settleOnce = async () => {
      const result = await fetchOnce();
      if (cancelled) return;
      if (result === "busy") {
        window.setTimeout(() => void settleOnce(), 25);
        return;
      }
      window.setTimeout(onSettled, 0);
    };
    void settleOnce();
    return () => { cancelled = true; };
  }, [fetchOnce, onSettled, settle]);

  return { ...state, error };
}
