"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const ACTIVE_REFRESH_MS = 5_000;
const IDLE_REFRESH_MS = 30_000;

/**
 * One visibility-gated page refresh loop. Active scenes settle quickly;
 * inactive scenes use a modest idle tick so a newly started session appears.
 */
export function SceneOnAirRefresh({ activeCount }: { activeCount: number }) {
  const router = useRouter();

  useEffect(() => {
    let interval: number | null = null;
    const stop = () => {
      if (interval != null) window.clearInterval(interval);
      interval = null;
    };
    const start = () => {
      stop();
      if (document.visibilityState !== "visible") return;
      interval = window.setInterval(
        () => router.refresh(),
        activeCount > 0 ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS,
      );
    };

    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", start);
    };
  }, [activeCount, router]);

  return null;
}
