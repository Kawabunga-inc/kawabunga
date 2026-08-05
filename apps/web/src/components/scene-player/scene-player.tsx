"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DeepTheme } from "@/components/deep-theme";
import { useLiveScene } from "@/hooks/use-live-scene";
import { useSceneCaptions } from "@/hooks/use-scene-captions";
import type { SceneEndedLifecycleMessage } from "@kawabunga/types";
import { SceneSessionView } from "./scene-session-view";
import { SceneStoryView } from "./scene-story-view";
import type { SceneView } from "./scene-view-toggle";
import { SceneWaveformView } from "./scene-waveform-view";
import { visitTimeOfDay } from "@/lib/scene-story";
import styles from "./scene-player.module.css";

type Props = {
  sceneId: string;
  sessionId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  ambience: string | null;
  arcLength: number;
  staff: boolean;
  adminBaseUrl: string;
  sessionEnded: boolean;
};

function elapsedLabel(startedAt: string, endedAt: string | null = null): string {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ScenePlayer({ sceneId, sessionId, title, startedAt, endedAt, ambience, arcLength, staff, adminBaseUrl, sessionEnded }: Props) {
  const captions = useSceneCaptions({ sceneId, sessionId });
  const [lifecycleEnd, setLifecycleEnd] = useState<SceneEndedLifecycleMessage | null>(null);
  const [lifecycleAt, setLifecycleAt] = useState<number | null>(null);
  const [sessionSettled, setSessionSettled] = useState(false);
  const receiveTranscript = useCallback(
    (message: Parameters<typeof captions.receive>[0]) => captions.receive(message),
    [captions],
  );
  const receiveSceneEnded = useCallback((message: SceneEndedLifecycleMessage) => {
    setLifecycleEnd(message);
    setLifecycleAt(Date.now());
    setSessionSettled(false);
  }, []);
  const settleSession = useCallback(() => setSessionSettled(true), []);
  const live = useLiveScene({
    sceneId,
    sessionId,
    onTranscript: receiveTranscript,
    onSceneEnded: receiveSceneEnded,
    disabled: sessionEnded,
  });
  const [elapsed, setElapsed] = useState(() => elapsedLabel(startedAt, sessionEnded ? endedAt : null));
  const [view, setView] = useState<SceneView>("waveform");
  const [readEndedStory, setReadEndedStory] = useState(sessionEnded);
  const landerHref = useMemo(() => `/scenes/${encodeURIComponent(sceneId)}`, [sceneId]);
  const chapter = useMemo(() => visitTimeOfDay(startedAt), [startedAt]);

  useEffect(() => {
    if (sessionEnded) return;
    const timer = window.setInterval(() => setElapsed(elapsedLabel(startedAt)), 1_000);
    return () => window.clearInterval(timer);
  }, [endedAt, sessionEnded, startedAt]);

  if (sessionEnded || readEndedStory) {
    return (
      <main className={styles.player} data-theme="deep" data-player-state="ended-story">
        <DeepTheme />
        <SceneStoryView
          title={title}
          elapsed={elapsed}
          chapter={chapter}
          messages={captions.transcript}
          stage="ended"
          micLevel={0}
          currentSpeakerSlug={null}
          view="story"
          ended
          landerHref={landerHref}
          onViewChange={() => undefined}
          onLeave={() => undefined}
        />
      </main>
    );
  }

  const settlingSession = staff && view === "session" && lifecycleEnd != null && !sessionSettled;
  if (live.stage === "connected" || live.stage === "reconnecting" || settlingSession) {
    const currentSpeakerSlug = captions.current?.final ? null : captions.current?.speaker?.slug ?? null;
    return (
      <main className={styles.player} data-theme="deep" data-player-state={live.stage}>
        <DeepTheme />
        {view === "waveform" ? (
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
            view={view}
            staff={staff}
            onViewChange={setView}
            onLeave={() => void live.leave()}
            onToggleCaptions={() => captions.setVisible(!captions.state.visible)}
          />
        ) : view === "story" ? (
          <SceneStoryView
            title={title}
            elapsed={elapsed}
            chapter={chapter}
            messages={captions.transcript}
            stage={live.stage}
            micLevel={live.micLevel}
            currentSpeakerSlug={currentSpeakerSlug}
            view={view}
            staff={staff}
            ended={false}
            landerHref={landerHref}
            onViewChange={setView}
            onLeave={() => void live.leave()}
          />
        ) : (
          <SceneSessionView
            sceneId={sceneId}
            sessionId={sessionId}
            title={title}
            elapsed={elapsed}
            arcLength={arcLength}
            adminBaseUrl={adminBaseUrl}
            micLevel={live.micLevel}
            view={view}
            live={live.stage === "connected" || live.stage === "reconnecting"}
            lifecycleEnd={lifecycleEnd}
            lifecycleAt={lifecycleAt}
            onSettled={settleSession}
            onViewChange={setView}
            onLeave={() => void live.leave()}
          />
        )}
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
          <button type="button" className={styles.readVisitButton} onClick={() => setReadEndedStory(true)}>
            Read your visit
          </button>
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
