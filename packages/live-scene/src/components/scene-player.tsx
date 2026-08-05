"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DeepTheme } from "../deep-theme";
import { useLiveScene } from "../hooks/use-live-scene";
import { useSceneAudioDevices } from "../hooks/use-scene-audio-devices";
import { useSceneCaptions } from "../hooks/use-scene-captions";
import type { SceneEndedLifecycleMessage } from "@kawabunga/types";
import { SceneSessionView } from "./scene-session-view";
import { SceneStoryView } from "./scene-story-view";
import type { SceneView } from "./scene-view-toggle";
import { SceneWaveformView } from "./scene-waveform-view";
import { visitTimeOfDay } from "../lib/scene-story";
import type { LiveSceneProvider, LiveSceneViewerContext } from "../provider";
import { SceneAudioSetup } from "./scene-audio-setup";
import styles from "./scene-player.module.css";

export type ScenePlayerProps = {
  sceneId: string;
  sessionId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  ambience: string | null;
  arcLength: number;
  provider: LiveSceneProvider;
  viewer: LiveSceneViewerContext;
  landerHref: string;
  workbenchHref: string;
  sessionEnded: boolean;
  initialView?: SceneView;
};

function elapsedLabel(startedAt: string, endedAt: string | null = null): string {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ScenePlayer({ sceneId, sessionId, title, startedAt, endedAt, ambience, arcLength, provider, viewer, landerHref, workbenchHref, sessionEnded, initialView = "waveform" }: ScenePlayerProps) {
  const captions = useSceneCaptions({ provider });
  const audio = useSceneAudioDevices();
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
    sessionId,
    provider,
    onTranscript: receiveTranscript,
    onSceneEnded: receiveSceneEnded,
    disabled: sessionEnded,
  });
  const [elapsed, setElapsed] = useState(() => elapsedLabel(startedAt, sessionEnded ? endedAt : null));
  const [view, setView] = useState<SceneView>(() =>
    initialView === "session" && !viewer.isStaff ? "waveform" : initialView,
  );
  const [readEndedStory, setReadEndedStory] = useState(sessionEnded);
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const chapter = useMemo(() => visitTimeOfDay(startedAt), [startedAt]);
  const leave = useCallback(async () => {
    audio.stopPreview();
    await live.leave();
    window.location.assign(landerHref);
  }, [audio, landerHref, live]);
  const enter = useCallback(async () => {
    const selection = await audio.prepareForJoin();
    if (!selection) return;
    await live.begin(selection);
  }, [audio, live]);
  const changeAudioInput = useCallback(async (deviceId: string) => {
    await audio.selectInput(deviceId);
    if (live.stage === "connected" || live.stage === "reconnecting") {
      try {
        await live.switchAudioInput(deviceId);
      } catch (cause) {
        audio.reportError(cause);
      }
    }
  }, [audio, live]);
  const changeAudioOutput = useCallback(async (deviceId: string) => {
    audio.selectOutput(deviceId);
    if (live.stage === "connected" || live.stage === "reconnecting") {
      try {
        await live.switchAudioOutput(deviceId);
      } catch (cause) {
        audio.reportError(cause);
      }
    }
  }, [audio, live]);

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

  const settlingSession = viewer.isStaff && view === "session" && lifecycleEnd != null && !sessionSettled;
  if (live.stage === "connected" || live.stage === "reconnecting" || settlingSession) {
    const currentSpeakerSlug = captions.current?.final ? null : captions.current?.speaker?.slug ?? null;
    return (
      <main className={styles.player} data-theme="deep" data-player-state={live.stage}>
        <DeepTheme />
        <button
          type="button"
          className={styles.audioSettingsButton}
          onClick={() => setAudioSettingsOpen(true)}
        >
          Audio devices
        </button>
        {audioSettingsOpen ? (
          <div className={styles.audioSettingsBackdrop} role="dialog" aria-modal="true" aria-label="Audio devices">
            <SceneAudioSetup
              audio={audio}
              meterLevel={live.micLevel}
              connectionError={live.error}
              live
              onInputChange={changeAudioInput}
              onOutputChange={changeAudioOutput}
              onClose={() => setAudioSettingsOpen(false)}
            />
          </div>
        ) : null}
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
            staff={viewer.isStaff}
            onViewChange={setView}
            onLeave={() => void leave()}
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
            staff={viewer.isStaff}
            ended={false}
            landerHref={landerHref}
            onViewChange={setView}
            onLeave={() => void leave()}
          />
        ) : (
          <SceneSessionView
            sceneId={sceneId}
            sessionId={sessionId}
            title={title}
            elapsed={elapsed}
            arcLength={arcLength}
            workbenchHref={workbenchHref}
            provider={provider}
            micLevel={live.micLevel}
            view={view}
            live={live.stage === "connected" || live.stage === "reconnecting"}
            lifecycleEnd={lifecycleEnd}
            lifecycleAt={lifecycleAt}
            onSettled={settleSession}
            onViewChange={setView}
            onLeave={() => void leave()}
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
  if (live.stage !== "preparing") {
    return (
      <main className={styles.player} data-theme="deep" data-player-state={live.stage}>
        <DeepTheme />
        <div className={styles.preparingGlow} aria-hidden="true" />
        <section className={styles.audioGate} aria-live="polite">
          <div className={styles.audioIntro}>
            <div className={styles.gateEmber} aria-hidden="true" />
            <p className={styles.kicker}>
              {failed ? "Audio needs attention" : "Before you enter"}
            </p>
            <h1>
              {live.stage === "connecting"
                ? "Opening the scene"
                : failed
                  ? "Choose what the scene should hear"
                  : "Set up your audio"}
            </h1>
            <p>
              See the active microphone and speaker, verify the input signal, and test playback before the room opens.
            </p>
          </div>
          <SceneAudioSetup
            audio={audio}
            connectionError={live.error}
            busy={live.stage === "connecting"}
            onInputChange={changeAudioInput}
            onOutputChange={changeAudioOutput}
            onEnter={enter}
            onLeave={leave}
          />
        </section>
      </main>
    );
  }

  return (
    <main className={styles.player} data-theme="deep" data-player-state={live.stage}>
      <DeepTheme />
      <div className={styles.preparingGlow} aria-hidden="true" />
      <section className={styles.gate} aria-live="polite">
        <div className={styles.gateEmber} aria-hidden="true" />
        <p className={styles.kicker}>A living scene</p>
        <h1>The scene is being prepared</h1>
        <p>{title} will begin here.</p>
      </section>
    </main>
  );
}
