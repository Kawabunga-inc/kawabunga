"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const INPUT_STORAGE_KEY = "kawabunga:live-scene:audio-input";
const OUTPUT_STORAGE_KEY = "kawabunga:live-scene:audio-output";

export type SceneAudioPermission =
  | "granted"
  | "prompt"
  | "denied"
  | "unsupported"
  | "unknown";

export type SceneAudioDevice = {
  deviceId: string;
  label: string;
};

export type SceneAudioSelection = {
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
};

type PreviewMeter = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
};

type OutputSelectableMediaDevices = MediaDevices & {
  selectAudioOutput?: (options?: { deviceId?: string }) => Promise<MediaDeviceInfo>;
};

type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

function storedDevice(key: string): string {
  if (typeof window === "undefined") return "default";
  return window.localStorage.getItem(key) || "default";
}

function persistDevice(key: string, deviceId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, deviceId || "default");
}

export function audioInputConstraint(deviceId: string): MediaTrackConstraints | true {
  return deviceId && deviceId !== "default"
    ? { deviceId: { exact: deviceId } }
    : true;
}

export function sceneAudioDeviceLabel(
  device: Pick<MediaDeviceInfo, "deviceId" | "label">,
  kind: "Microphone" | "Speaker",
  index: number,
): string {
  if (device.label.trim()) return device.label.trim();
  if (device.deviceId === "default") return `System default ${kind.toLowerCase()}`;
  return `${kind} ${index + 1}`;
}

export function sceneAudioError(cause: unknown): string {
  if (cause instanceof DOMException) {
    if (cause.name === "NotAllowedError" || cause.name === "PermissionDeniedError") {
      return "Microphone access is blocked. Allow it in the site controls beside the address bar, then check again.";
    }
    if (cause.name === "NotFoundError" || cause.name === "DevicesNotFoundError") {
      return "No microphone is available. Connect one or choose another input device.";
    }
    if (cause.name === "NotReadableError" || cause.name === "TrackStartError") {
      return "The microphone is busy or unavailable to this browser. Close other audio apps and try again.";
    }
    if (cause.name === "OverconstrainedError") {
      return "The selected microphone is no longer available. Choose another input device.";
    }
  }
  return cause instanceof Error ? cause.message : "Audio setup could not be completed.";
}

function createAudioContext(): AudioContext {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new AudioContextConstructor();
}

function meterLevel(meter: PreviewMeter): number {
  meter.analyser.getByteTimeDomainData(meter.data);
  let sum = 0;
  for (const sample of meter.data) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / meter.data.length) * 5.5);
}

export function useSceneAudioDevices() {
  const [inputs, setInputs] = useState<SceneAudioDevice[]>([]);
  const [outputs, setOutputs] = useState<SceneAudioDevice[]>([]);
  const [selectedInputId, setSelectedInputId] = useState(() => storedDevice(INPUT_STORAGE_KEY));
  const [selectedOutputId, setSelectedOutputId] = useState(() => storedDevice(OUTPUT_STORAGE_KEY));
  const [permission, setPermission] = useState<SceneAudioPermission>("unknown");
  const [previewLevel, setPreviewLevel] = useState(0);
  const [previewActive, setPreviewActive] = useState(false);
  const [checkingInput, setCheckingInput] = useState(false);
  const [testingOutput, setTestingOutput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputSwitchSupported, setOutputSwitchSupported] = useState(false);
  const [outputPickerSupported, setOutputPickerSupported] = useState(false);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewMeterRef = useRef<PreviewMeter | null>(null);
  const previewAnimationRef = useRef(0);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setPermission("unsupported");
      return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices.filter((device) => device.kind === "audioinput");
    const speakers = devices.filter((device) => device.kind === "audiooutput");
    setInputs(
      microphones.map((device, index) => ({
        deviceId: device.deviceId || "default",
        label: sceneAudioDeviceLabel(device, "Microphone", index),
      })),
    );
    setOutputs(
      speakers.map((device, index) => ({
        deviceId: device.deviceId || "default",
        label: sceneAudioDeviceLabel(device, "Speaker", index),
      })),
    );
  }, []);

  const stopPreview = useCallback(() => {
    window.cancelAnimationFrame(previewAnimationRef.current);
    previewStreamRef.current?.getTracks().forEach((track) => track.stop());
    previewStreamRef.current = null;
    previewMeterRef.current?.source.disconnect();
    void previewMeterRef.current?.context.close().catch(() => undefined);
    previewMeterRef.current = null;
    setPreviewLevel(0);
    setPreviewActive(false);
  }, []);

  const startPreviewMeter = useCallback((meter: PreviewMeter) => {
    let lastPaint = 0;
    const paint = (now: number) => {
      if (now - lastPaint > 50) {
        lastPaint = now;
        setPreviewLevel(meterLevel(meter));
      }
      previewAnimationRef.current = window.requestAnimationFrame(paint);
    };
    previewAnimationRef.current = window.requestAnimationFrame(paint);
  }, []);

  const checkInput = useCallback(async (deviceId = selectedInputId): Promise<string | null> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission("unsupported");
      setError("This browser does not provide microphone access.");
      return null;
    }
    setCheckingInput(true);
    setError(null);
    stopPreview();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioInputConstraint(deviceId),
      });
      previewStreamRef.current = stream;
      const context = createAudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      const meter: PreviewMeter = {
        context,
        source,
        analyser,
        data: new Uint8Array(analyser.fftSize),
      };
      previewMeterRef.current = meter;
      setPermission("granted");
      setPreviewActive(true);
      startPreviewMeter(meter);
      await refreshDevices();
      const activeDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId || deviceId || "default";
      setSelectedInputId(activeDeviceId);
      persistDevice(INPUT_STORAGE_KEY, activeDeviceId);
      return activeDeviceId;
    } catch (cause) {
      setPermission(
        cause instanceof DOMException &&
          (cause.name === "NotAllowedError" || cause.name === "PermissionDeniedError")
          ? "denied"
          : "unknown",
      );
      setError(sceneAudioError(cause));
      return null;
    } finally {
      setCheckingInput(false);
    }
  }, [refreshDevices, selectedInputId, startPreviewMeter, stopPreview]);

  const selectInput = useCallback(async (deviceId: string) => {
    const next = deviceId || "default";
    setSelectedInputId(next);
    persistDevice(INPUT_STORAGE_KEY, next);
    if (previewStreamRef.current) await checkInput(next);
  }, [checkInput]);

  const selectOutput = useCallback((deviceId: string) => {
    const next = deviceId || "default";
    setSelectedOutputId(next);
    persistDevice(OUTPUT_STORAGE_KEY, next);
    setError(null);
  }, []);

  const chooseOutput = useCallback(async () => {
    const mediaDevices = navigator.mediaDevices as OutputSelectableMediaDevices;
    if (!mediaDevices.selectAudioOutput) return;
    try {
      const device = await mediaDevices.selectAudioOutput(
        selectedOutputId !== "default" ? { deviceId: selectedOutputId } : undefined,
      );
      selectOutput(device.deviceId);
      await refreshDevices();
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "NotAllowedError")) {
        setError(sceneAudioError(cause));
      }
    }
  }, [refreshDevices, selectOutput, selectedOutputId]);

  const testOutput = useCallback(async () => {
    setTestingOutput(true);
    setError(null);
    let context: AudioContext | null = null;
    let audio: SinkAudioElement | null = null;
    try {
      context = createAudioContext();
      await context.resume();
      const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 523.25;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
      oscillator.connect(gain).connect(destination);
      audio = new Audio() as SinkAudioElement;
      audio.srcObject = destination.stream;
      if (selectedOutputId !== "default" && audio.setSinkId) {
        await audio.setSinkId(selectedOutputId);
      }
      await audio.play();
      oscillator.start();
      oscillator.stop(context.currentTime + 0.6);
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    } catch (cause) {
      setError(sceneAudioError(cause));
    } finally {
      if (audio) {
        audio.pause();
        audio.srcObject = null;
      }
      await context?.close().catch(() => undefined);
      setTestingOutput(false);
    }
  }, [selectedOutputId]);

  const prepareForJoin = useCallback(async (): Promise<SceneAudioSelection | null> => {
    const activeInputId = await checkInput(selectedInputId);
    if (!activeInputId) return null;
    stopPreview();
    return {
      audioInputDeviceId: activeInputId,
      audioOutputDeviceId: selectedOutputId || "default",
    };
  }, [checkInput, selectedInputId, selectedOutputId, stopPreview]);

  const reportError = useCallback((cause: unknown) => setError(sceneAudioError(cause)), []);

  useEffect(() => {
    if (!navigator.mediaDevices) {
      setPermission("unsupported");
      return;
    }
    setOutputSwitchSupported(
      typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype,
    );
    setOutputPickerSupported(
      typeof (navigator.mediaDevices as OutputSelectableMediaDevices).selectAudioOutput === "function",
    );
    void refreshDevices().catch(reportError);
    const onDeviceChange = () => void refreshDevices().catch(reportError);
    navigator.mediaDevices.addEventListener?.("devicechange", onDeviceChange);

    let permissionStatus: PermissionStatus | null = null;
    const syncPermission = () => {
      if (permissionStatus) setPermission(permissionStatus.state);
    };
    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((status) => {
          permissionStatus = status;
          syncPermission();
          status.addEventListener("change", syncPermission);
        })
        .catch(() => setPermission("unknown"));
    }

    return () => {
      navigator.mediaDevices.removeEventListener?.("devicechange", onDeviceChange);
      permissionStatus?.removeEventListener("change", syncPermission);
      stopPreview();
    };
  }, [refreshDevices, reportError, stopPreview]);

  return {
    inputs,
    outputs,
    selectedInputId,
    selectedOutputId,
    selectedInputLabel:
      inputs.find((device) => device.deviceId === selectedInputId)?.label ?? "System default microphone",
    selectedOutputLabel:
      outputs.find((device) => device.deviceId === selectedOutputId)?.label ?? "System default speaker",
    permission,
    previewLevel,
    previewActive,
    checkingInput,
    testingOutput,
    error,
    outputSwitchSupported,
    outputPickerSupported,
    refreshDevices,
    checkInput,
    selectInput,
    selectOutput,
    chooseOutput,
    testOutput,
    prepareForJoin,
    stopPreview,
    reportError,
  };
}

export type SceneAudioDevicesController = ReturnType<typeof useSceneAudioDevices>;
