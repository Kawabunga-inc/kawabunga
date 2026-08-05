"use client";

import type { SceneAudioDevicesController } from "../hooks/use-scene-audio-devices";
import styles from "./scene-player.module.css";

type Props = {
  audio: SceneAudioDevicesController;
  meterLevel?: number;
  connectionError?: string | null;
  live?: boolean;
  busy?: boolean;
  onInputChange(deviceId: string): Promise<void> | void;
  onOutputChange(deviceId: string): Promise<void> | void;
  onEnter?(): Promise<void> | void;
  onLeave?(): Promise<void> | void;
  onClose?(): void;
};

function permissionLabel(permission: SceneAudioDevicesController["permission"]) {
  if (permission === "granted") return "allowed";
  if (permission === "denied") return "blocked";
  if (permission === "prompt") return "not decided";
  if (permission === "unsupported") return "unsupported";
  return "checking";
}

function Meter({ level }: { level: number }) {
  const active = Math.max(0, Math.min(12, Math.round(level * 12)));
  return (
    <div className={styles.audioMeter} aria-label={`Microphone level ${Math.round(level * 100)} percent`}>
      {Array.from({ length: 12 }, (_, index) => (
        <i key={index} data-active={index < active} />
      ))}
    </div>
  );
}

export function SceneAudioSetup({
  audio,
  meterLevel,
  connectionError,
  live = false,
  busy = false,
  onInputChange,
  onOutputChange,
  onEnter,
  onLeave,
  onClose,
}: Props) {
  const level = live ? (meterLevel ?? 0) : audio.previewLevel;
  const microphoneReady = live || audio.previewActive;
  const status = permissionLabel(audio.permission);
  const message = audio.error ?? connectionError;

  return (
    <section className={styles.audioSetup} aria-label="Audio setup">
      <header className={styles.audioSetupHeader}>
        <div>
          <p>Audio setup</p>
          <span>Choose and test what the scene hears and where it speaks.</span>
        </div>
        {onClose ? (
          <button type="button" className={styles.audioCloseButton} onClick={onClose} aria-label="Close audio setup">
            ×
          </button>
        ) : null}
      </header>

      <div className={styles.audioDeviceBlock}>
        <div className={styles.audioDeviceHeading}>
          <div>
            <span className={styles.audioDeviceIcon} aria-hidden="true">↗</span>
            <p>Microphone</p>
          </div>
          <span data-state={audio.permission}>{status}</span>
        </div>
        <label className={styles.audioSelectLabel}>
          <span>Input device</span>
          <select
            value={audio.selectedInputId}
            onChange={(event) => void onInputChange(event.target.value)}
            disabled={busy || audio.checkingInput}
          >
            {audio.inputs.some((device) => device.deviceId === "default")
              ? null
              : <option value="default">System default microphone</option>}
            {audio.inputs.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
            ))}
          </select>
        </label>
        <div className={styles.audioMeterRow}>
          <Meter level={level} />
          <span>{microphoneReady ? (level > 0.03 ? "Signal detected" : "Speak to test") : "Not checked"}</span>
        </div>
        {!live ? (
          <button
            type="button"
            className={styles.audioTestButton}
            onClick={() => void audio.checkInput()}
            disabled={busy || audio.checkingInput}
          >
            {audio.checkingInput ? "Checking microphone…" : microphoneReady ? "Check again" : "Check microphone"}
          </button>
        ) : null}
      </div>

      <div className={styles.audioDeviceBlock}>
        <div className={styles.audioDeviceHeading}>
          <div>
            <span className={styles.audioDeviceIcon} aria-hidden="true">↘</span>
            <p>Speaker</p>
          </div>
          <span data-state={audio.outputSwitchSupported ? "granted" : "unknown"}>
            {audio.outputSwitchSupported ? "selectable" : "system managed"}
          </span>
        </div>
        <label className={styles.audioSelectLabel}>
          <span>Output device</span>
          <select
            value={audio.selectedOutputId}
            onChange={(event) => void onOutputChange(event.target.value)}
            disabled={busy || !audio.outputSwitchSupported}
          >
            {audio.outputs.some((device) => device.deviceId === "default")
              ? null
              : <option value="default">System default speaker</option>}
            {audio.outputs.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
            ))}
          </select>
        </label>
        <div className={styles.audioOutputActions}>
          <button
            type="button"
            className={styles.audioTestButton}
            onClick={() => void audio.testOutput()}
            disabled={busy || audio.testingOutput}
          >
            {audio.testingOutput ? "Playing test…" : "Test speaker"}
          </button>
          {audio.outputPickerSupported ? (
            <button
              type="button"
              className={styles.audioTextButton}
              onClick={() => void audio.chooseOutput()}
              disabled={busy}
            >
              Choose speaker…
            </button>
          ) : null}
        </div>
      </div>

      <dl className={styles.audioSummary}>
        <div><dt>Browser permission</dt><dd>{status}</dd></div>
        <div><dt>Audio in</dt><dd title={audio.selectedInputLabel}>{audio.selectedInputLabel}</dd></div>
        <div><dt>Audio out</dt><dd title={audio.selectedOutputLabel}>{audio.selectedOutputLabel}</dd></div>
      </dl>

      {message ? <p className={styles.audioError} role="alert">{message}</p> : null}
      {audio.permission === "denied" ? (
        <p className={styles.audioHelp}>
          Open the site controls beside the address bar, set Microphone to Allow, then choose Check microphone.
        </p>
      ) : null}

      {onEnter ? (
        <div className={styles.audioPanelActions}>
          <button
            type="button"
            className={styles.audioEnterButton}
            onClick={() => void onEnter()}
            disabled={busy || audio.checkingInput}
          >
            {busy ? "Opening the scene…" : "Enter with these devices"}
          </button>
          {onLeave ? (
            <button type="button" className={styles.audioLeaveButton} onClick={() => void onLeave()}>
              Leave quietly
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
