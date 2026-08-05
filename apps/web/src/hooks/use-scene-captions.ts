"use client";

import { useMemo, useReducer } from "react";
import {
  initialSceneCaptionState,
  sceneCaptionReducer,
  selectAgentCaptionLines,
  type SceneTranscriptMessage,
} from "@/lib/scene-captions";

export function useSceneCaptions() {
  const [state, dispatch] = useReducer(sceneCaptionReducer, initialSceneCaptionState);
  const lines = useMemo(() => selectAgentCaptionLines(state), [state]);

  return {
    state,
    current: lines.current,
    previous: lines.previous,
    receive(message: SceneTranscriptMessage) {
      dispatch({ type: "received", message });
    },
    setVisible(visible: boolean) {
      dispatch({ type: "visibility", visible });
    },
    reset() {
      dispatch({ type: "reset" });
    },
  };
}
