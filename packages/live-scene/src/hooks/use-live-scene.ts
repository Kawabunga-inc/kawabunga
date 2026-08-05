"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import type { SceneEndedLifecycleMessage } from "@kawabunga/types";
import { sceneEndedForSession } from "../lib/scene-lifecycle";
import { parseSceneTranscript, type SceneTranscriptMessage } from "../lib/scene-captions";
import type { LiveSceneProvider } from "../provider";

export type LiveSceneStage =
  | "preparing"
  | "permission"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "denied"
  | "error"
  | "ended";

type LiveSceneOptions = {
  sessionId: string;
  provider: LiveSceneProvider;
  onTranscript(message: SceneTranscriptMessage): void;
  onSceneEnded?(message: SceneEndedLifecycleMessage): void;
  disabled?: boolean;
};

type Meter = {
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
  source: MediaStreamAudioSourceNode;
};

function createMeter(context: AudioContext, track: MediaStreamTrack): Meter {
  const source = context.createMediaStreamSource(new MediaStream([track]));
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.72;
  source.connect(analyser);
  return { analyser, data: new Uint8Array(analyser.fftSize), source };
}

function meterLevel(meter: Meter | null): number {
  if (!meter) return 0;
  meter.analyser.getByteTimeDomainData(meter.data);
  let sum = 0;
  for (const sample of meter.data) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / meter.data.length) * 5.5);
}

export function useLiveScene({ sessionId, provider, onTranscript, onSceneEnded, disabled = false }: LiveSceneOptions) {
  const [stage, setStage] = useState<LiveSceneStage>(() => disabled ? "ended" : "preparing");
  const [error, setError] = useState<string | null>(null);
  const [agentLevel, setAgentLevel] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const agentMeterRef = useRef<Meter | null>(null);
  const micMeterRef = useRef<Meter | null>(null);
  const audioElementsRef = useRef(new Map<string, HTMLMediaElement>());
  const animationRef = useRef(0);
  const leavingRef = useRef(false);
  const sawAgentRef = useRef(false);
  const transcriptRef = useRef(onTranscript);
  transcriptRef.current = onTranscript;
  const sceneEndedRef = useRef(onSceneEnded);
  sceneEndedRef.current = onSceneEnded;

  const cleanupMedia = useCallback(async () => {
    cancelAnimationFrame(animationRef.current);
    for (const element of audioElementsRef.current.values()) {
      element.pause();
      element.srcObject = null;
      element.remove();
    }
    audioElementsRef.current.clear();
    agentMeterRef.current?.source.disconnect();
    micMeterRef.current?.source.disconnect();
    agentMeterRef.current = null;
    micMeterRef.current = null;
    if (contextRef.current) await contextRef.current.close().catch(() => undefined);
    contextRef.current = null;
  }, []);

  useEffect(() => {
    if (disabled) return;
    const timer = window.setTimeout(() => setStage("permission"), 650);
    return () => window.clearTimeout(timer);
  }, [disabled]);

  useEffect(() => {
    return () => {
      leavingRef.current = true;
      const room = roomRef.current;
      roomRef.current = null;
      void room?.disconnect();
      void cleanupMedia();
    };
  }, [cleanupMedia]);

  const startMeters = useCallback(() => {
    let lastPaint = 0;
    const paint = (now: number) => {
      if (now - lastPaint > 50) {
        lastPaint = now;
        setAgentLevel(meterLevel(agentMeterRef.current));
        setMicLevel(meterLevel(micMeterRef.current));
      }
      animationRef.current = requestAnimationFrame(paint);
    };
    cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(paint);
  }, []);

  const attachRemoteTrack = useCallback((
    track: RemoteTrack,
    publication: RemoteTrackPublication,
  ) => {
    if (track.kind !== Track.Kind.Audio) return;
    sawAgentRef.current = true;
    const element = track.attach();
    element.autoplay = true;
    element.dataset.sceneAudio = publication.trackName;
    element.style.display = "none";
    document.body.appendChild(element);
    audioElementsRef.current.set(publication.trackSid, element);
    void element.play().catch(() => undefined);

    if (publication.trackName === "agent-voice" && contextRef.current) {
      agentMeterRef.current?.source.disconnect();
      agentMeterRef.current = createMeter(contextRef.current, track.mediaStreamTrack);
    }
  }, []);

  const begin = useCallback(async () => {
    if (disabled) return;
    if (stage === "connecting" || stage === "connected") return;
    leavingRef.current = false;
    sawAgentRef.current = false;
    setError(null);
    setStage("connecting");

    let permissionStream: MediaStream | null = null;
    try {
      permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionStream.getTracks().forEach((track) => track.stop());
      permissionStream = null;

      const payload = await provider.join();
      if (!payload.url || !payload.token) throw new Error("The scene could not be reached.");

      const context = new AudioContext();
      contextRef.current = context;
      await context.resume();
      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      roomRef.current = room;

      room
        .on(RoomEvent.TrackSubscribed, attachRemoteTrack)
        .on(RoomEvent.TrackUnsubscribed, (_track, publication) => {
          const element = audioElementsRef.current.get(publication.trackSid);
          element?.remove();
          audioElementsRef.current.delete(publication.trackSid);
          if (publication.trackName === "agent-voice") agentMeterRef.current = null;
        })
        .on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
          if (topic === "odyssey.transcript") {
            const message = parseSceneTranscript(payload);
            if (message) transcriptRef.current(message);
            return;
          }
          const message = sceneEndedForSession(payload, topic, sessionId);
          if (message) {
            sceneEndedRef.current?.(message);
            setStage("ended");
            leavingRef.current = true;
            roomRef.current = null;
            void room.disconnect().finally(() => cleanupMedia());
          }
        })
        .on(RoomEvent.Reconnecting, () => setStage("reconnecting"))
        .on(RoomEvent.Reconnected, () => setStage("connected"))
        .on(RoomEvent.ParticipantDisconnected, () => {
          if (sawAgentRef.current && room.remoteParticipants.size === 0 && !leavingRef.current) {
            setStage("ended");
          }
        })
        .on(RoomEvent.Disconnected, () => {
          if (!leavingRef.current) setStage("ended");
        });

      await room.connect(payload.url, payload.token, { autoSubscribe: true });
      await room.localParticipant.setMicrophoneEnabled(true);
      const micPublication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const micTrack = micPublication?.track?.mediaStreamTrack;
      if (micTrack) micMeterRef.current = createMeter(context, micTrack);

      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication.track) attachRemoteTrack(publication.track, publication);
        }
      }
      startMeters();
      setStage("connected");
    } catch (cause) {
      permissionStream?.getTracks().forEach((track) => track.stop());
      const denied =
        cause instanceof DOMException &&
        (cause.name === "NotAllowedError" ||
          cause.name === "PermissionDeniedError" ||
          cause.name === "NotFoundError" ||
          cause.name === "NotReadableError");
      setError(cause instanceof Error ? cause.message : "The scene could not be reached.");
      setStage(denied ? "denied" : "error");
      leavingRef.current = true;
      const room = roomRef.current;
      roomRef.current = null;
      await room?.disconnect().catch(() => undefined);
      await cleanupMedia();
      leavingRef.current = false;
    }
  }, [attachRemoteTrack, cleanupMedia, disabled, provider, sessionId, stage, startMeters]);

  const leave = useCallback(async () => {
    leavingRef.current = true;
    const room = roomRef.current;
    roomRef.current = null;
    await room?.disconnect().catch(() => undefined);
    await cleanupMedia();
    await provider.end("left").catch(() => undefined);
  }, [cleanupMedia, provider]);

  return { stage, error, agentLevel, micLevel, begin, leave };
}
