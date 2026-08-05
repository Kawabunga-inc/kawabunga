"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  initialSceneStoryFollowState,
  sceneStoryFollowReducer,
} from "@/lib/scene-story-follow";

export function useSceneStoryFollow(newestVersion: string) {
  const [state, dispatch] = useReducer(
    sceneStoryFollowReducer,
    initialSceneStoryFollowState,
  );
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const followNow = useCallback(() => {
    dispatch({ type: "resume" });
    const viewport = viewportRef.current;
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
  }, []);

  const onScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    dispatch({ type: "viewport", atEnd: distance <= 32 });
  }, []);

  useEffect(() => {
    if (!state.following) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [newestVersion, state.following]);

  return { following: state.following, viewportRef, onScroll, followNow };
}
