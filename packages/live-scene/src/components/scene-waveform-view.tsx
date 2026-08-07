"use client";

import type { CSSProperties } from "react";
import type { SceneTranscriptMessage } from "../lib/scene-captions";
import type { LiveSceneStage } from "../hooks/use-live-scene";
import { SceneViewToggle, type SceneView } from "./scene-view-toggle";
import styles from "./scene-player.module.css";

type Props = {
  title: string;
  elapsed: string;
  ambience: string | null;
  stage: LiveSceneStage;
  agentLevel: number;
  micLevel: number;
  captionsVisible: boolean;
  current: SceneTranscriptMessage | null;
  previous: SceneTranscriptMessage | null;
  view: SceneView;
  staff: boolean;
  onLeave(): void;
  onViewChange(view: SceneView): void;
  onToggleCaptions(): void;
};

function humanizeAmbience(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function WaveTicks({ level }: { level: number }) {
  return (
    <span className={styles.waveTicks} aria-hidden="true">
      {[0.38, 0.82, 0.56, 1, 0.48].map((weight, index) => (
        <i
          key={index}
          style={{ height: `${Math.max(4, 4 + level * 11 * weight)}px` }}
        />
      ))}
    </span>
  );
}

export function SceneWaveformView({
  title,
  elapsed,
  ambience,
  stage,
  agentLevel,
  micLevel,
  captionsVisible,
  current,
  previous,
  view,
  staff,
  onLeave,
  onViewChange,
  onToggleCaptions,
}: Props) {
  const narrator = current?.speaker?.slug === "narrator";
  const speakerName = current?.speaker?.name ?? "The scene";
  const intensity = Math.max(0.04, agentLevel);
  const visualStyle = {
    "--ring-outer-scale": 1 + intensity * 0.075,
    "--ring-middle-scale": 1 + intensity * 0.1,
    "--ring-inner-scale": 1 + intensity * 0.13,
    "--core-scale": 1 + intensity * 0.32,
    "--core-glow": `${24 + intensity * 58}px`,
    "--halo-opacity": Math.min(1, 0.42 + intensity * 0.7),
  } as CSSProperties;

  return (
    <section className={styles.waveformView} style={visualStyle} aria-label="Live scene waveform">
      <div className={styles.atmosphere} aria-hidden="true" />
      <header className={styles.topbar}>
        <p>{title}</p>
        <SceneViewToggle value={view} staff={staff} onChange={onViewChange} />
        <div className={styles.topbarActions}>
          <time suppressHydrationWarning>{elapsed}</time>
          <button type="button" onClick={onLeave}>Leave quietly</button>
        </div>
      </header>

      {stage === "reconnecting" ? (
        <div className={styles.reconnecting} role="status">
          <span aria-hidden="true" /> Reconnecting to the scene…
        </div>
      ) : null}

      <div className={styles.halo} aria-hidden="true">
        <span className={styles.ringOuter} />
        <span className={styles.ringMiddle} />
        <span className={styles.ringInner} />
        <span className={styles.core} />
      </div>

      {captionsVisible ? (
        <div className={`${styles.captions} ${narrator ? styles.narrator : ""}`} aria-live="polite">
          {previous ? (
            <p className={styles.previousLine}>
              before this — {previous.speaker?.name ? `${previous.speaker.name}: ` : ""}
              “{previous.text}”
            </p>
          ) : null}
          {!narrator && current ? (
            <div className={styles.speaker}>
              <WaveTicks level={agentLevel} />
              <span>{speakerName}</span>
            </div>
          ) : null}
          <p className={styles.currentLine}>
            {current ? (narrator ? current.text : `“${current.text}”`) : "The scene is listening."}
          </p>
        </div>
      ) : null}

      {ambience ? (
        <p className={styles.ambience}><span aria-hidden="true">≋</span>{humanizeAmbience(ambience)}</p>
      ) : null}

      <div className={`${styles.micPill} ${micLevel > 0.12 ? styles.micActive : ""}`}>
        <span aria-hidden="true" />
        <p>{micLevel > 0.12 ? "Listening — I can hear you" : "Listening — speak whenever you like"}</p>
      </div>

      <button
        type="button"
        className={styles.captionToggle}
        aria-pressed={captionsVisible}
        onClick={onToggleCaptions}
      >
        <span>captions</span>
        <i><b /></i>
      </button>
    </section>
  );
}
