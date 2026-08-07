import { describe, expect, it } from "vitest";
import { sceneJoinFailureReason, type SceneJoinStage } from "./use-live-scene";

/**
 * A live session row is created the instant "Run live" is clicked — before the
 * microphone prompt, before any LiveKit connect. When joining then failed, the
 * client set local UI state and told the server nothing, so the row stayed
 * `active` with `session.started` as its only event.
 *
 * That signature is identical to an agent that never arrived. Three such rows
 * sat open for hours (one for 4.7) and could not be told apart. These reasons
 * are what makes them distinguishable.
 */
describe("sceneJoinFailureReason", () => {
  const denials = [
    "NotAllowedError", // the visitor clicked Block
    "PermissionDeniedError", // older spelling, still emitted by some browsers
    "NotFoundError", // no input device at all
    "NotReadableError", // device held by another application
  ];

  it("names a microphone denial regardless of which stage reported it", () => {
    for (const name of denials) {
      expect(sceneJoinFailureReason(new DOMException("nope", name), "mic-permission")).toBe(
        "join-failed:mic-denied",
      );
    }
  });

  it("attributes every other failure to the step that threw", () => {
    const stages: SceneJoinStage[] = [
      "mic-permission",
      "token",
      "audio-context",
      "room-connect",
      "mic-publish",
    ];
    for (const stage of stages) {
      expect(sceneJoinFailureReason(new Error("boom"), stage)).toBe(`join-failed:${stage}`);
    }
  });

  it("does not mistake an ordinary error for a permission denial", () => {
    // Same NAME, but a plain Error — the browser only signals denial via
    // DOMException, and a server 500 must not be blamed on the visitor's mic.
    const impostor = new Error("NotAllowedError");
    impostor.name = "NotAllowedError";
    expect(sceneJoinFailureReason(impostor, "token")).toBe("join-failed:token");
  });

  it("survives a non-Error rejection", () => {
    // fetch/WebRTC paths can reject with a string or undefined.
    expect(sceneJoinFailureReason("nope", "room-connect")).toBe("join-failed:room-connect");
    expect(sceneJoinFailureReason(undefined, "mic-publish")).toBe("join-failed:mic-publish");
  });
});
