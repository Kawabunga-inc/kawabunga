import { NextRequest, NextResponse } from "next/server";
import { getSceneSessionStore } from "@kawabunga/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventInput = {
  id?: string;
  turnId?: string | null;
  type?: string;
  source?: string;
  payload?: unknown;
  createdAt?: string;
};

type Body = EventInput | { events?: EventInput[] };

/**
 * GET /api/scene-sessions/:sessionId/events?prefix=scene.
 *
 * The live journal feed: returns the session's events (optionally filtered
 * by a type prefix), oldest first. The sandbox polls this while a session
 * runs so the Narrator journal streams in as decisions and reflections
 * persist — same rows the /sessions workbench reads afterward.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;
  const prefix = req.nextUrl.searchParams.get("prefix")?.trim() || undefined;
  try {
    const events = await getSceneSessionStore().listEventsForSessions(
      [sessionId],
      prefix,
    );
    return NextResponse.json({ events });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const events = Array.isArray((body as { events?: EventInput[] }).events)
    ? (body as { events: EventInput[] }).events
    : [body as EventInput];

  if (events.length === 0) {
    return NextResponse.json({ success: true, count: 0 });
  }
  if (events.length > 250) {
    return NextResponse.json(
      { error: "At most 250 events can be appended in one request." },
      { status: 400 },
    );
  }

  try {
    const store = getSceneSessionStore();
    let count = 0;
    for (const event of events) {
      const type = event.type?.trim();
      const source = event.source?.trim();
      if (!type || !source) continue;
      await store.appendEvent({
        id: event.id,
        sessionId,
        turnId: event.turnId ?? null,
        type,
        source,
        payload: event.payload ?? {},
        createdAt: event.createdAt,
      });
      count += 1;
    }
    return NextResponse.json({ success: true, count });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
