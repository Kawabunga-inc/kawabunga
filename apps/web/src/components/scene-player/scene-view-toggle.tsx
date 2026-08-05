"use client";

import type { KeyboardEvent } from "react";
import styles from "./scene-player.module.css";

export type SceneView = "waveform" | "story";

export function SceneViewToggle({
  value,
  onChange,
}: {
  value: SceneView;
  onChange(value: SceneView): void;
}) {
  const chooseAdjacent = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = value === "waveform" ? "story" : "waveform";
    onChange(next);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-scene-view="${next}"]`)?.focus();
    });
  };

  return (
    <div className={styles.viewToggle} role="tablist" aria-label="Scene view" onKeyDown={chooseAdjacent}>
      {(["waveform", "story"] as const).map((view) => (
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
          ) : (
            <>
              <span aria-hidden="true">¶</span>
              Story
            </>
          )}
        </button>
      ))}
    </div>
  );
}
