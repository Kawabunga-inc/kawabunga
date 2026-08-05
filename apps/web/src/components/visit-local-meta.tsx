"use client";

import { useSyncExternalStore } from "react";
import { visitTimeOfDay } from "@/lib/scene-story";

const subscribe = () => () => undefined;

function localLabel(startedAt: string, duration: string): string {
  const date = new Date(startedAt);
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  return `${day} · ${visitTimeOfDay(startedAt)} visit · ${duration}`;
}

export function VisitLocalMeta({
  startedAt,
  duration,
}: {
  startedAt: string;
  duration: string;
}) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const label = hydrated ? localLabel(startedAt, duration) : duration;

  return <span>{label}</span>;
}
