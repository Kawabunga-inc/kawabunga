import { NextResponse } from "next/server";
import { getSceneSessionStore } from "@kawabunga/db";
import type { LiveSessionFeedResponse } from "@/lib/live-session-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM_BEGINNING = new Date(0).toISOString();
const TURN_CAP = 200;
const EVENT_CAP = 500;

function parseCursor(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid cursor: ${value}`);
  return new Date(timestamp).toISOString();
}

function maxCursor<T>(
  rows: T[],
  requestCursor: string | null,
  timestampFor: (row: T) => string,
): string | null {
  let cursor = requestCursor;
  for (const row of rows) {
    const timestamp = timestampFor(row);
    if (cursor == null || timestamp > cursor) cursor = timestamp;
  }
  return cursor;
}

/**
 * GET /api/scene-sessions/:sessionId/live?turnsSince=&eventsSince=
 *
 * Shared incremental feed for every admin live-session surface. Missing
 * cursors hydrate from the beginning; returned cursors only advance through
 * rows included in this response.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;
  let turnsSince: string | null;
  let eventsSince: string | null;
  try {
    const params = new URL(req.url).searchParams;
    turnsSince = parseCursor(params.get("turnsSince"));
    eventsSince = parseCursor(params.get("eventsSince"));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  try {
    const store = getSceneSessionStore();
    const session = await store.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Scene session not found." },
        { status: 404 },
      );
    }

    const [turnRows, eventRows] = await Promise.all([
      store.listTurnsUpdatedSince(
        sessionId,
        turnsSince ?? FROM_BEGINNING,
        TURN_CAP + 1,
      ),
      store.listEventsSince(
        sessionId,
        eventsSince ?? FROM_BEGINNING,
        EVENT_CAP + 1,
      ),
    ]);
    const turns = turnRows.slice(0, TURN_CAP);
    const events = eventRows.slice(0, EVENT_CAP);

    const response: LiveSessionFeedResponse = {
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
    };
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
