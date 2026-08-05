import { describe, expect, it } from "vitest";
import type { SceneSessionRecord } from "@kawabunga/db";
import { authorizeSceneJoin } from "./scene-player-access";

const activeSession: SceneSessionRecord = {
  id: "session-1",
  userId: "user-1",
  sceneId: "scene-1",
  mode: "voice",
  status: "active",
  startedAt: "2026-08-04T00:00:00.000Z",
  lastActiveAt: "2026-08-04T00:00:00.000Z",
};

describe("authorizeSceneJoin", () => {
  it("allows the owner to join an active matching session", () => {
    expect(authorizeSceneJoin(activeSession, "scene-1", "user-1")).toEqual({ ok: true });
  });

  it("forbids another user's session", () => {
    expect(authorizeSceneJoin(activeSession, "scene-1", "user-2")).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("hides a session attached to another scene", () => {
    expect(authorizeSceneJoin(activeSession, "scene-2", "user-1")).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("rejects an ended session", () => {
    expect(
      authorizeSceneJoin({ ...activeSession, status: "ended" }, "scene-1", "user-1"),
    ).toMatchObject({ ok: false, status: 409 });
  });
});
