"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SceneSessionDetailRecord } from "@kawabunga/db";
import {
  cursorsForDetail,
  mergeLiveSessionDetail,
  newestLiveActivityMs,
  type LiveSessionCursors,
  type LiveSessionFeedResponse,
} from "@/lib/live-session-feed";

const POLL_MS = 2000;
const AGE_TICK_MS = 1000;
const MAX_TRUNCATED_FOLLOW_UPS = 5;

type AgeBaseline = {
  ageAtSyncMs: number;
  receivedAtMs: number;
};

export type LiveSessionDetailState = {
  detail: SceneSessionDetailRecord;
  isLive: boolean;
  lastEventAgeMs: number | null;
  paused: boolean;
  setPaused: Dispatch<SetStateAction<boolean>>;
};

function feedUrl(sessionId: string, cursors: LiveSessionCursors): string {
  const params = new URLSearchParams();
  if (cursors.turns) params.set("turnsSince", cursors.turns);
  if (cursors.events) params.set("eventsSince", cursors.events);
  const query = params.toString();
  return `/api/scene-sessions/${encodeURIComponent(sessionId)}/live${query ? `?${query}` : ""}`;
}

export function useLiveSessionDetail(
  initialDetail: SceneSessionDetailRecord,
): LiveSessionDetailState {
  const sessionId = initialDetail.session.id;
  const [detail, setDetail] = useState(initialDetail);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const [lastEventAgeMs, setLastEventAgeMs] = useState<number | null>(null);

  const initialDetailRef = useRef(initialDetail);
  initialDetailRef.current = initialDetail;
  const detailRef = useRef(initialDetail);
  const cursorsRef = useRef(cursorsForDetail(initialDetail));
  const activeRef = useRef(initialDetail.session.status === "active");
  const stoppedRef = useRef(!activeRef.current);
  const ageBaselineRef = useRef<AgeBaseline | null>(null);

  useEffect(() => {
    const seed = initialDetailRef.current;
    detailRef.current = seed;
    cursorsRef.current = cursorsForDetail(seed);
    activeRef.current = seed.session.status === "active";
    stoppedRef.current = !activeRef.current;
    ageBaselineRef.current = null;
    setDetail(seed);
    setPaused(false);
    setLastEventAgeMs(null);
  }, [sessionId]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      setVisible(document.visibilityState === "visible");
    };
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const baseline = ageBaselineRef.current;
      if (!baseline) return;
      setLastEventAgeMs(
        baseline.ageAtSyncMs + Math.max(0, Date.now() - baseline.receivedAtMs),
      );
    }, AGE_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (paused || !visible || stoppedRef.current || !activeRef.current) return;

    let cancelled = false;
    let timer: number | null = null;
    const abortController = new AbortController();

    const fetchPage = async (): Promise<LiveSessionFeedResponse> => {
      const response = await fetch(feedUrl(sessionId, cursorsRef.current), {
        cache: "no-store",
        signal: abortController.signal,
      });
      if (!response.ok) {
        throw new Error(`live session fetch failed (${response.status})`);
      }
      const payload = (await response.json()) as LiveSessionFeedResponse;
      if (cancelled) return payload;

      const nextDetail = mergeLiveSessionDetail(detailRef.current, payload);
      detailRef.current = nextDetail;
      cursorsRef.current = payload.cursors;
      setDetail(nextDetail);

      const serverTimeMs = Date.parse(payload.serverTime);
      const newestActivityMs = newestLiveActivityMs(nextDetail);
      if (Number.isFinite(serverTimeMs) && newestActivityMs != null) {
        const baseline = {
          ageAtSyncMs: Math.max(0, serverTimeMs - newestActivityMs),
          receivedAtMs: Date.now(),
        };
        ageBaselineRef.current = baseline;
        setLastEventAgeMs(baseline.ageAtSyncMs);
      } else {
        ageBaselineRef.current = null;
        setLastEventAgeMs(null);
      }
      return payload;
    };

    const poll = async () => {
      let followUps = 0;
      try {
        while (!cancelled) {
          const payload = await fetchPage();
          if (cancelled) return;

          if (payload.session.status !== "active") {
            activeRef.current = false;
            try {
              // One final request catches writes that committed immediately
              // after the status transition observed above.
              await fetchPage();
            } finally {
              stoppedRef.current = true;
            }
            return;
          }

          activeRef.current = true;
          const truncated = payload.truncated.turns || payload.truncated.events;
          if (!truncated || followUps >= MAX_TRUNCATED_FOLLOW_UPS) return;
          followUps += 1;
        }
      } catch (error) {
        if (
          !cancelled &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          console.warn("live session poll failed", error);
        }
      }
    };

    const runAndSchedule = async () => {
      await poll();
      if (
        !cancelled &&
        !stoppedRef.current &&
        activeRef.current
      ) {
        timer = window.setTimeout(() => void runAndSchedule(), POLL_MS);
      }
    };

    void runAndSchedule();
    return () => {
      cancelled = true;
      abortController.abort();
      if (timer != null) window.clearTimeout(timer);
    };
  }, [paused, sessionId, visible]);

  return {
    detail,
    isLive: detail.session.status === "active" && !stoppedRef.current,
    lastEventAgeMs,
    paused,
    setPaused,
  };
}
