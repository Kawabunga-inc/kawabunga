"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 5_000;

/** One page-level refresh loop; never polls individual live-session feeds. */
export function SessionsRefresh({ activeCount }: { activeCount: number }) {
  const router = useRouter();

  useEffect(() => {
    if (activeCount === 0) return;

    let interval: number | null = null;
    const stop = () => {
      if (interval != null) window.clearInterval(interval);
      interval = null;
    };
    const start = () => {
      stop();
      if (document.visibilityState !== "visible") return;
      interval = window.setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    };
    const handleVisibility = () => start();

    start();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeCount, router]);

  return null;
}
