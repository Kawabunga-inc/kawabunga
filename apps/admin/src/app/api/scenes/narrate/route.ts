import { NextRequest, NextResponse } from "next/server";
import { getVoiceStore } from "@kawabunga/db";
import {
  createStreamingTtsAdapterForVoice,
  createTextToSpeechAdapter,
  type StreamingTtsProvider,
  type VoiceForRouting,
} from "@kawabunga/engine";
import { createEmbeddingSignedUrl } from "@/lib/voices-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_VOICE_NAMES = new Set([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
]);

type NarrateBody = {
  text?: string;
  // The scene's narrator voice identifier. Either a library voice id (set by
  // the scene editor's voice picker) or a bare provider voice name like
  // "fable" (authored/static scenes). The endpoint disambiguates.
  voiceId?: string | null;
};

/**
 * POST /api/scenes/narrate
 *
 * Synthesizes narrator speech. A library voice id routes through the SAME
 * streaming TTS pipeline characters use (createStreamingTtsAdapterForVoice)
 * and STREAMS the PCM frames as NDJSON — a header line, then one line per
 * frame — so playback starts on the first frame instead of after the whole
 * synthesis (long scenic passages open in ~one frame's latency and remain
 * barge-in interruptible on the client). The first frame is prefetched
 * BEFORE the response commits: a provider that fails pre-audio still falls
 * back to batch OpenAI TTS with a clean JSON response.
 * A bare OpenAI voice name (or no voice) uses batch OpenAI TTS (mp3 JSON).
 */
export async function POST(req: NextRequest) {
  let body: NarrateBody;
  try {
    body = (await req.json()) as NarrateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }

  const voiceId = body.voiceId?.trim() || null;

  // 1. Library voice → stream through the character TTS pipeline.
  if (voiceId && !OPENAI_VOICE_NAMES.has(voiceId)) {
    const bound = await getVoiceStore().getById(voiceId).catch(() => null);
    if (bound?.status === "ready") {
      try {
        const embeddingUrl =
          bound.provider === "pocket_tts" && bound.embeddingPath
            ? await createEmbeddingSignedUrl(bound.embeddingPath).catch(() => null)
            : null;
        const voiceForRouting: VoiceForRouting = {
          provider: bound.provider as StreamingTtsProvider,
          slug: bound.slug,
          embeddingUrl,
          providerConfig: bound.providerConfig,
        };
        const routing = createStreamingTtsAdapterForVoice(voiceForRouting);
        const iterator = routing.adapter
          .stream({ text, voice: routing.voiceContext })
          [Symbol.asyncIterator]();

        // Prefetch to the FIRST audio frame before committing the response —
        // an adapter that dies pre-audio falls back to batch OpenAI below
        // with clean JSON semantics (we haven't sent headers yet).
        let firstAudio: { pcm: string; sampleRate: number } | null = null;
        while (firstAudio === null) {
          const next = await iterator.next();
          if (next.done) throw new Error("TTS stream ended before any audio");
          const frame = next.value;
          if (frame.type === "audio") {
            firstAudio = { pcm: frame.pcmFloat32Base64, sampleRate: frame.sampleRate };
          } else if (frame.type === "error") {
            throw new Error(frame.message);
          }
        }

        const encoder = new TextEncoder();
        const line = (obj: unknown) => encoder.encode(`${JSON.stringify(obj)}\n`);
        const first = firstAudio;
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(line({ kind: "pcm-stream", provider: routing.provider }));
            controller.enqueue(line(first));
            try {
              while (true) {
                const next = await iterator.next();
                if (next.done) break;
                const frame = next.value;
                if (frame.type === "audio") {
                  controller.enqueue(
                    line({ pcm: frame.pcmFloat32Base64, sampleRate: frame.sampleRate }),
                  );
                } else if (frame.type === "error") {
                  // Mid-stream failure: the client keeps what it played and
                  // surfaces the partial — nothing else we can do post-commit.
                  controller.enqueue(line({ error: frame.message }));
                  break;
                }
              }
            } catch (err) {
              controller.enqueue(
                line({ error: err instanceof Error ? err.message : "narration stream failed" }),
              );
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-store",
          },
        });
      } catch (err) {
        // Fall through to OpenAI batch so narration still plays even if the
        // library voice's provider is misconfigured.
        console.error("[scenes/narrate] library voice failed, falling back", err);
      }
    }
  }

  // 2. Fallback: batch OpenAI TTS using a valid voice name (or "echo").
  const openaiVoice = voiceId && OPENAI_VOICE_NAMES.has(voiceId) ? voiceId : "echo";
  try {
    const { provider, adapter } = createTextToSpeechAdapter("openai");
    const audio = await adapter.synthesize({ text, voice: openaiVoice });
    if (!audio) {
      return NextResponse.json(
        { error: "OpenAI TTS unavailable (missing API key)." },
        { status: 503 },
      );
    }
    return NextResponse.json({
      kind: "mp3",
      provider,
      audioBase64: audio.audioBase64,
      mimeType: audio.mimeType,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Narration failed." },
      { status: 500 },
    );
  }
}
