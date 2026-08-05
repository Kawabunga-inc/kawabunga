"use client";

import type { KeyboardEvent } from "react";
import styles from "./scene-player.module.css";

export type SceneView = "waveform" | "story" | "session";

export function SceneViewToggle({
  value,
  staff = false,
  onChange,
}: {
  value: SceneView;
  staff?: boolean;
  onChange(value: SceneView): void;
}) {
  const views: SceneView[] = staff ? ["waveform", "story", "session"] : ["waveform", "story"];
  const chooseAdjacent = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = views[(views.indexOf(value) + offset + views.length) % views.length]!;
    onChange(next);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-scene-view="${next}"]`)?.focus();
    });
  };

  return (
    <div className={styles.viewToggle} role="tablist" aria-label="Scene view" onKeyDown={chooseAdjacent}>
      {views.map((view) => (
        <button
          key={view}
          type="button"
          role="tab"
          data-scene-view={view}
          aria-selected={value === view}
          tabIndex={value === view ? 0 : -1}
          onClick={() => onChange(view)}
        >
          {view === "waveform" ? (
            <>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 6v4M5 3v10M8 5v6M11 2v12M14 6v4" />
              </svg>
              Waveform
            </>
          ) : view === "story" ? (
            <>
              <span aria-hidden="true">¶</span>
              Story
            </>
          ) : (
            <>
              <span aria-hidden="true">◉</span>
              Session <small>ADMIN</small>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
