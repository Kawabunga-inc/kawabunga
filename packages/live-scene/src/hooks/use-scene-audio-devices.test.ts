import { describe, expect, it } from "vitest";
import {
  audioInputConstraint,
  sceneAudioDeviceLabel,
  sceneAudioError,
} from "./use-scene-audio-devices";

describe("scene audio device setup", () => {
  it("uses an exact constraint only for an explicitly selected microphone", () => {
    expect(audioInputConstraint("default")).toBe(true);
    expect(audioInputConstraint("")).toBe(true);
    expect(audioInputConstraint("mic-2")).toEqual({ deviceId: { exact: "mic-2" } });
  });

  it("keeps device identity visible before browser permission reveals labels", () => {
    expect(sceneAudioDeviceLabel({ deviceId: "default", label: "" }, "Microphone", 0))
      .toBe("System default microphone");
    expect(sceneAudioDeviceLabel({ deviceId: "opaque", label: "" }, "Speaker", 1))
      .toBe("Speaker 2");
    expect(sceneAudioDeviceLabel({ deviceId: "mic", label: "Studio Mic" }, "Microphone", 0))
      .toBe("Studio Mic");
  });

  it("turns browser capture failures into actionable recovery guidance", () => {
    expect(sceneAudioError(new DOMException("denied", "NotAllowedError")))
      .toContain("site controls beside the address bar");
    expect(sceneAudioError(new DOMException("missing", "NotFoundError")))
      .toContain("No microphone");
    expect(sceneAudioError(new DOMException("busy", "NotReadableError")))
      .toContain("busy or unavailable");
  });
});
