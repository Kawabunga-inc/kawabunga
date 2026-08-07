import { NextRequest } from "next/server";
import { getCharacterStore, getVoiceStore, getSceneSessionStore } from "@kawabunga/db";
import {
  createStreamingTtsAdapterForVoice,
  type StreamingTtsProvider,
  type VoiceForRouting,
} from "@kawabunga/engine";
import {
  sandboxVoiceContextCacheKeyForDebug,
  startSandboxVoiceContextCacheWarm,
} from "@/lib/sandbox-voice-context-cache";
import { createEmbeddingSignedUrl } from "@/lib/voices-storage";
import type { Scene } from "@kawabunga/wiki-curator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PrepareBody = {
  sessionId?: string | null;
  turnId?: string | null;
  partialTranscript?: string;
  scene?: Scene;
  tokenBudget?: number;
  startedAtMs?: number;
};

const DEFAULT_TOKEN_BUDGET = 2500;
const MIN_PARTIAL_CHARS = 8;
const TTS_DEFAULT_VOICE_SLUG = "abraham";
const TTS_DEFAULT_PROVIDER: StreamingTtsProvider = "pocket_tts";
type StreamingTtsRouting = ReturnType<typeof createStreamingTtsAdapterForVoice>;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: PrepareBody;
  try {
    body = (await req.json()) as PrepareBody;
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const partial = body.partialTranscript?.trim() ?? "";
  if (partial.length < MIN_PARTIAL_CHARS) {
    return Response.json({ accepted: false, reason: "partial-too-short" });
  }

  const character =
    (await getCharacterStore().getById(id)) ??
    (await getCharacterStore().getBySlug(id));
  if (!character) return jsonError(404, "character not found");

  const tokenBudget = body.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const cacheKey = sandboxVoiceContextCacheKeyForDebug({
    characterId: character.id,
    sessionId: body.sessionId,
    scene: body.scene,
    tokenBudget,
  });
  const startedAt = performance.now();
  const warmPromise = startSandboxVoiceContextCacheWarm({
    characterId: character.id,
    sessionId: body.sessionId,
    query: partial,
    scene: body.scene,
    tokenBudget,
  });

  if (body.sessionId) {
    void warmPromise
      .then(async (entry) => {
        await getSceneSessionStore().appendEvent({
          sessionId: body.sessionId!,
          turnId: body.turnId ?? null,
          type: "context.prepare.ready",
          source: "system",
          payload: {
            cacheKey,
            queryChars: partial.length,
            selectedPages: entry.pages.map((selected) => selected.page.slug),
            tokensUsed: entry.tokensUsed,
            tokensBudget: entry.tokensBudget,
            elapsedMs: Math.round(performance.now() - startedAt),
            clientStartedAtMs: body.startedAtMs ?? null,
          },
        });

      })
      .catch((err) => {
        console.error("[voice-live.prepare] context warm failed", err);
      });
  }

  return Response.json({
    accepted: true,
    cacheKey,
    queryChars: partial.length,
  });
}



function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
