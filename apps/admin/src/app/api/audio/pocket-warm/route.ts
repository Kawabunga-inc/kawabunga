import { NextRequest, NextResponse } from "next/server";
import { getCharacterStore, getVoiceStore } from "@kawabunga/db";
import {
  getPocketTtsAuthHeaders,
  getPocketTtsBaseUrl,
} from "@kawabunga/engine";
import { createEmbeddingSignedUrl } from "@/lib/voices-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type WarmBody = {
  characterId?: string;
};

/**
 * Wake a slept Pocket service and block until the model + selected voice are
 * resident. The sandbox starts this during its pre-session experience so a
 * Railway cold boot never lands on the first spoken turn.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as WarmBody;
  const characterId = body.characterId?.trim();
  if (!characterId) {
    return NextResponse.json(
      { error: "characterId is required." },
      { status: 400 },
    );
  }

  const characterStore = getCharacterStore();
  const character =
    (await characterStore.getById(characterId)) ??
    (await characterStore.getBySlug(characterId));
  if (!character) {
    return NextResponse.json(
      { error: "character not found." },
      { status: 404 },
    );
  }

  let voice = character.slug || "abraham";
  let voiceUrl: string | null = null;
  if (character.voiceId) {
    const bound = await getVoiceStore().getById(character.voiceId);
    if (bound?.provider === "pocket_tts" && bound.status === "ready") {
      voice = bound.slug;
      voiceUrl = bound.embeddingPath
        ? await createEmbeddingSignedUrl(bound.embeddingPath).catch(() => null)
        : null;
    } else if (bound && bound.provider !== "pocket_tts") {
      return NextResponse.json({
        ok: true,
        skipped: true,
        provider: bound.provider,
        reason: "selected voice does not use Pocket TTS",
      });
    }
  }

  const baseUrl = getPocketTtsBaseUrl();
  const startedAt = performance.now();
  try {
    const upstream = await fetch(`${baseUrl}/warm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getPocketTtsAuthHeaders(),
      },
      body: JSON.stringify({ voice, voiceUrl }),
      cache: "no-store",
      signal: AbortSignal.timeout(115_000),
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const text = await upstream.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // Preserve a non-JSON upstream error body for diagnostics.
    }
    if (!upstream.ok) {
      return NextResponse.json(
        {
          ok: false,
          baseUrl,
          voice,
          status: upstream.status,
          latencyMs,
          error: payload,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      baseUrl,
      voice,
      latencyMs,
      payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        baseUrl,
        voice,
        latencyMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
