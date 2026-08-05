import {
  getSceneSessionStore,
  getSceneStore,
  type SceneSessionRecord,
} from "@kawabunga/db";
import {
  buildSceneSessionSnapshot,
  createInitialSceneState,
} from "@kawabunga/orchestration/client";
import { resolveLiveSceneAgentName } from "@kawabunga/types";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { authorizeSceneJoin, authorizeSceneTranscript } from "../lib/scene-player-access";
import { sceneTurnsToTranscript } from "../lib/scene-story";
import type { SceneSessionJournalFeed } from "../lib/scene-session-journal";

const TOKEN_TTL_SECONDS = 60 * 30;
const FROM_BEGINNING = new Date(0).toISOString();
const TURN_CAP = 200;
const EVENT_CAP = 500;

export type LiveSceneServerAccess =
  | { kind: "owner"; userId: string }
  | { kind: "staff" };

export type LiveSceneServerResult<T> = {
  status: number;
  body: T;
};

type ErrorBody = { error: string };

function error(status: number, message: string): LiveSceneServerResult<ErrorBody> {
  return { status, body: { error: message } };
}

function authorizeActiveSession(
  session: SceneSessionRecord | null,
  sceneId: string,
  access: LiveSceneServerAccess,
) {
  if (access.kind === "owner") {
    return authorizeSceneJoin(session, sceneId, access.userId);
  }
  if (!session || session.sceneId !== sceneId) {
    return { ok: false as const, status: 404 as const, error: "Scene session not found." };
  }
  if (session.status !== "active") {
    return { ok: false as const, status: 409 as const, error: "This scene session has ended." };
  }
  return { ok: true as const };
}

function authorizeReadableSession(
  session: SceneSessionRecord | null,
  sceneId: string,
  access: LiveSceneServerAccess,
) {
  if (access.kind === "owner") {
    return authorizeSceneTranscript(session, sceneId, access.userId);
  }
  if (!session || session.sceneId !== sceneId) {
    return { ok: false as const, status: 404 as const, error: "Scene session not found." };
  }
  return { ok: true as const };
}

/**
 * Shared LiveKit join core. App routes resolve authentication, then select the
 * owner or staff policy; this function owns session validation, conditional
 * scene snapshot initialization, and token minting for the canonical room.
 */
export async function joinLiveScene(input: {
  sceneId: string;
  sessionId: string;
  identity: string;
  access: LiveSceneServerAccess;
}): Promise<LiveSceneServerResult<{ url: string; token: string } | ErrorBody>> {
  const sessions = getSceneSessionStore();
  const session = await sessions.getSession(input.sessionId);
  const authorization = authorizeActiveSession(session, input.sceneId, input.access);
  if (!authorization.ok) return error(authorization.status, authorization.error);

  const scene = await getSceneStore().resolveOrchestratorScene(input.sceneId);
  if (!scene) return error(404, "Scene not found.");

  if (session?.initialScene == null && session?.currentScene == null) {
    const snapshot = buildSceneSessionSnapshot(createInitialSceneState(scene));
    await sessions.initializeSceneState({
      sessionId: input.sessionId,
      initialScene: snapshot,
      currentScene: snapshot,
    });
  }

  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) {
    return error(503, "The live scene service is not configured.");
  }

  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    ttl: TOKEN_TTL_SECONDS,
  });
  accessToken.addGrant({
    roomJoin: true,
    room: `scene-${input.sceneId}-${input.sessionId}`,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: false,
    canSubscribe: true,
  });
  accessToken.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: resolveLiveSceneAgentName(process.env.LIVEKIT_AGENT_NAME),
        metadata: JSON.stringify({
          sceneId: input.sceneId,
          sessionId: input.sessionId,
          journalVersion: 1,
        }),
      }),
    ],
  });

  return { status: 200, body: { url, token: await accessToken.toJwt() } };
}

/** Shared end core for consumer-owner and staff routes. */
export async function endLiveScene(input: {
  sceneId: string;
  sessionId: string;
  reason: string;
  source: "web-player" | "admin-live";
  access: LiveSceneServerAccess;
}): Promise<LiveSceneServerResult<{ ok: true } | ErrorBody>> {
  const sessions = getSceneSessionStore();
  const session = await sessions.getSession(input.sessionId);
  const authorization = authorizeActiveSession(session, input.sceneId, input.access);
  if (!authorization.ok) return error(authorization.status, authorization.error);

  const reason = input.reason.trim() || "left";
  await sessions.endSession(input.sessionId, "ended", {
    ...(session?.metadata ?? {}),
    reason,
  });
  await sessions.appendEvent({
    sessionId: input.sessionId,
    type: "session.ended",
    source: input.source,
    payload: { reason },
  });
  return { status: 204, body: { ok: true } };
}

/** Shared persisted-transcript core. Streaming rows remain LiveKit-owned. */
export async function fetchLiveSceneTranscript(input: {
  sceneId: string;
  sessionId: string;
  access: LiveSceneServerAccess;
}): Promise<LiveSceneServerResult<{ messages: ReturnType<typeof sceneTurnsToTranscript> } | ErrorBody>> {
  const sessions = getSceneSessionStore();
  const [session, scene] = await Promise.all([
    sessions.getSession(input.sessionId),
    getSceneStore().resolveOrchestratorScene(input.sceneId),
  ]);
  const authorization = authorizeReadableSession(session, input.sceneId, input.access);
  if (!authorization.ok) return error(authorization.status, authorization.error);
  if (!scene) return error(404, "Scene not found.");

  const detail = await sessions.getSessionDetail(input.sessionId);
  if (!detail) return error(404, "Scene session not found.");
  return {
    status: 200,
    body: { messages: sceneTurnsToTranscript(detail.turns, scene.characters) },
  };
}

function parseCursor(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid cursor: ${value}`);
  return new Date(timestamp).toISOString();
}

function maxCursor<T>(rows: T[], cursor: string | null, timestampFor: (row: T) => string) {
  let next = cursor;
  for (const row of rows) {
    const timestamp = timestampFor(row);
    if (next == null || timestamp > next) next = timestamp;
  }
  return next;
}

/**
 * Shared staff journal reader. Authentication remains route-owned in each app;
 * once admitted, staff can inspect any matching scene session.
 */
export async function fetchLiveSceneJournal(input: {
  sceneId: string;
  sessionId: string;
  turnsSince: string | null;
  eventsSince: string | null;
}): Promise<LiveSceneServerResult<SceneSessionJournalFeed | ErrorBody>> {
  let turnsSince: string | null;
  let eventsSince: string | null;
  try {
    turnsSince = parseCursor(input.turnsSince);
    eventsSince = parseCursor(input.eventsSince);
  } catch (cause) {
    return error(400, cause instanceof Error ? cause.message : String(cause));
  }

  const store = getSceneSessionStore();
  const session = await store.getSession(input.sessionId);
  if (!session || session.sceneId !== input.sceneId) {
    return error(404, "Scene session not found.");
  }
  const [turnRows, eventRows] = await Promise.all([
    store.listTurnsUpdatedSince(input.sessionId, turnsSince ?? FROM_BEGINNING, TURN_CAP + 1),
    store.listEventsSince(input.sessionId, eventsSince ?? FROM_BEGINNING, EVENT_CAP + 1),
  ]);
  const turns = turnRows.slice(0, TURN_CAP);
  const events = eventRows.slice(0, EVENT_CAP);
  return {
    status: 200,
    body: {
      session,
      turns,
      events,
      cursors: {
        turns: maxCursor(turns, turnsSince, (turn) => turn.updatedAt),
        events: maxCursor(events, eventsSince, (event) => event.createdAt),
      },
      truncated: {
        turns: turnRows.length > TURN_CAP,
        events: eventRows.length > EVENT_CAP,
      },
      serverTime: new Date().toISOString(),
    },
  };
}

/** Creates the canonical admin-live session consumed by A2/B1/B3/B4. */
export async function createAdminLiveSceneSession(input: {
  sceneId: string;
  userId: string;
}): Promise<LiveSceneServerResult<{ session: SceneSessionRecord } | ErrorBody>> {
  const scene = await getSceneStore().getSceneById(input.sceneId);
  if (!scene) return error(404, "Scene not found.");

  const sessions = getSceneSessionStore();
  const session = await sessions.createSession({
    userId: input.userId,
    sceneId: input.sceneId,
    mode: "voice",
    metadata: { source: "admin-live" },
  });
  await sessions.appendEvent({
    sessionId: session.id,
    type: "session.started",
    source: "admin-live",
    payload: { mode: "voice", sceneId: input.sceneId },
  });
  return { status: 201, body: { session } };
}
