"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import {
  initialSceneCaptionState,
  sceneCaptionReducer,
  selectAgentCaptionLines,
  selectSceneTranscript,
  type SceneTranscriptMessage,
} from "@/lib/scene-captions";

export function useSceneCaptions({ sceneId, sessionId }: { sceneId: string; sessionId: string }) {
  const [state, dispatch] = useReducer(sceneCaptionReducer, initialSceneCaptionState);
  const [historyReady, setHistoryReady] = useState(false);
  const lines = useMemo(() => selectAgentCaptionLines(state), [state]);
  const transcript = useMemo(() => selectSceneTranscript(state), [state]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/scenes/${encodeURIComponent(sceneId)}/session/${encodeURIComponent(sessionId)}/transcript`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Transcript unavailable");
        return response.json() as Promise<{ messages?: SceneTranscriptMessage[] }>;
      })
      .then((payload) => {
        dispatch({ type: "hydrated", messages: payload.messages ?? [] });
        setHistoryReady(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setHistoryReady(true);
      });
    return () => controller.abort();
  }, [sceneId, sessionId]);

  return {
    state,
    transcript,
    historyReady,
    current: lines.current,
    previous: lines.previous,
    receive(message: SceneTranscriptMessage) {
      dispatch({ type: "received", message });
    },
    hydrate(messages: SceneTranscriptMessage[]) {
      dispatch({ type: "hydrated", messages });
    },
    setVisible(visible: boolean) {
      dispatch({ type: "visibility", visible });
    },
    reset() {
      dispatch({ type: "reset" });
    },
  };
}
