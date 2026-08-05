"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_SCENE_SESSION_JOURNAL,
  mergeSceneSessionJournal,
  shouldPollSceneSessionJournal,
  type SceneSessionJournalFeed,
  type SceneSessionJournalState,
} from "../lib/scene-session-journal";

const POLL_MS = 2_000;

export function useSceneSessionJournal(input: {
  sceneId: string;
  sessionId: string;
  open: boolean;
  live: boolean;
  settle: boolean;
  onSettled(): void;
}): SceneSessionJournalState & { error: string | null } {
  const { sceneId, sessionId, open, live, settle, onSettled } = input;
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
      const query = new URLSearchParams();
      if (stateRef.current.cursors.turns) query.set("turnsSince", stateRef.current.cursors.turns);
      if (stateRef.current.cursors.events) query.set("eventsSince", stateRef.current.cursors.events);
      const suffix = query.size ? `?${query}` : "";
      const response = await fetch(
        `/api/scenes/${encodeURIComponent(sceneId)}/session/${encodeURIComponent(sessionId)}/journal${suffix}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`Session journal unavailable (${response.status})`);
      const feed = (await response.json()) as SceneSessionJournalFeed;
      setState((current) => mergeSceneSessionJournal(current, feed));
      setError(null);
      return "fetched";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return "fetched";
    } finally {
      inFlight.current = false;
    }
  }, [sceneId, sessionId]);

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
