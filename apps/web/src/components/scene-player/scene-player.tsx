"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DeepTheme } from "@/components/deep-theme";
import { useLiveScene } from "@/hooks/use-live-scene";
import { useSceneCaptions } from "@/hooks/use-scene-captions";
import { SceneWaveformView } from "./scene-waveform-view";
import styles from "./scene-player.module.css";

type Props = {
  sceneId: string;
  sessionId: string;
  title: string;
  startedAt: string;
  ambience: string | null;
};

function elapsedLabel(startedAt: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ScenePlayer({ sceneId, sessionId, title, startedAt, ambience }: Props) {
  const captions = useSceneCaptions();
  const receiveTranscript = useCallback(
    (message: Parameters<typeof captions.receive>[0]) => captions.receive(message),
    [captions],
  );
  const live = useLiveScene({ sceneId, sessionId, onTranscript: receiveTranscript });
  const [elapsed, setElapsed] = useState(() => elapsedLabel(startedAt));
  const landerHref = useMemo(() => `/scenes/${encodeURIComponent(sceneId)}`, [sceneId]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(elapsedLabel(startedAt)), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  if (live.stage === "connected" || live.stage === "reconnecting") {
    return (
      <main className={styles.player} data-theme="deep" data-player-state={live.stage}>
        <DeepTheme />
        <SceneWaveformView
          title={title}
          elapsed={elapsed}
          ambience={ambience}
          stage={live.stage}
          agentLevel={live.agentLevel}
          micLevel={live.micLevel}
          captionsVisible={captions.state.visible}
          current={captions.current}
          previous={captions.previous}
          onLeave={() => void live.leave()}
          onToggleCaptions={() => captions.setVisible(!captions.state.visible)}
        />
      </main>
    );
  }

  if (live.stage === "ended") {
    return (
      <main className={styles.player} data-theme="deep" data-player-state="ended">
        <DeepTheme />
        <div className={styles.quietCard}>
          <div className={styles.quietEmber} aria-hidden="true" />
          <p className={styles.kicker}>A quiet remains</p>
          <h1>The scene has ended.</h1>
          <p>Your visit is safe. Return when you would like to step inside again.</p>
          <Link href={landerHref}>Visit again</Link>
        </div>
      </main>
    );
  }

  const failed = live.stage === "denied" || live.stage === "error";
  return (
    <main className={styles.player} data-theme="deep" data-player-state={live.stage}>
      <DeepTheme />
      <div className={styles.preparingGlow} aria-hidden="true" />
      <section className={styles.gate} aria-live="polite">
        <div className={styles.gateEmber} aria-hidden="true" />
        {live.stage === "preparing" ? (
          <>
            <p className={styles.kicker}>A living scene</p>
            <h1>The scene is being prepared</h1>
            <p>{title} will begin here.</p>
          </>
        ) : failed ? (
          <>
            <p className={styles.kicker}>The threshold is quiet</p>
            <h1>
              {live.stage === "denied"
                ? "The scene can hear nothing — allow the microphone to enter"
                : "The path into the scene has gone quiet"}
            </h1>
            <p>
              {live.stage === "denied"
                ? "Microphone access stays with this visit. Try again when you are ready."
                : live.error ?? "Please try the path again."}
            </p>
            <div className={styles.gateActions}>
              <button type="button" onClick={() => void live.begin()}>Try again</button>
              <button type="button" className={styles.secondary} onClick={() => void live.leave()}>
                Leave quietly
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.kicker}>One last step</p>
            <h1>{live.stage === "connecting" ? "Opening the scene" : "Let the scene hear you"}</h1>
            <p>Your mic turns on when you enter — just speak.</p>
            <div className={styles.gateActions}>
              <button type="button" disabled={live.stage === "connecting"} onClick={() => void live.begin()}>
                {live.stage === "connecting" ? "Listening for the world…" : "Allow microphone & enter"}
              </button>
              <Link href={landerHref}>Not yet</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
