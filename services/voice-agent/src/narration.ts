import { getVoiceStore } from "@kawabunga/db";
import {
  createStreamingTtsAdapterForVoice,
  type StreamingTtsProvider,
  type VoiceForRouting,
} from "@kawabunga/engine";
import { createEmbeddingSignedUrl } from "@kawabunga/voice-pipeline/voice-embedding-url";
import type { AudioSource } from "@livekit/rtc-node";
import { toAudioFrame } from "./audio-frame";

/**
 * Narrator TTS for the LiveKit scene runner — the server-side twin of the
 * browser player's /api/scenes/narrate path. Resolves the scene's
 * narratorVoice through the SAME library-voice routing characters use
 * (createStreamingTtsAdapterForVoice) and streams PCM frames onto the
 * agent's published output track.
 *
 * Resolution: narratorVoice as a library voice id, then slug. Bare provider
 * names ("fable" — the authored/registry scenes) and unresolvable voices
 * fall back to the given fallback slug (the first roster character's voice)
 * on the default streaming provider, matching the browser player's
 * `scene.narratorVoice ?? scene.characters[0].voice` spirit — narration
 * must degrade to *a* voice, never to silence.
 */

export type NarrationRouting = ReturnType<typeof createStreamingTtsAdapterForVoice>;

const FALLBACK_PROVIDER: StreamingTtsProvider = "pocket_tts";

export async function resolveNarrationRouting(input: {
  narratorVoice?: string | null;
  fallbackVoiceSlug: string;
}): Promise<NarrationRouting | null> {
  const ref = input.narratorVoice?.trim() || null;

  let routing: VoiceForRouting | null = null;
  if (ref) {
    const store = getVoiceStore();
    const bound =
      (await store.getById(ref).catch(() => null)) ??
      (await store.getBySlug(ref).catch(() => null));
    if (bound?.status === "ready") {
      const embeddingUrl =
        bound.provider === "pocket_tts" && bound.embeddingPath
          ? await createEmbeddingSignedUrl(bound.embeddingPath).catch(() => null)
          : null;
      routing = {
        provider: bound.provider as StreamingTtsProvider,
        slug: bound.slug,
        embeddingUrl,
        providerConfig: bound.providerConfig,
      };
    }
  }
  if (!routing) {
    routing = {
      provider: FALLBACK_PROVIDER,
      slug: input.fallbackVoiceSlug,
      embeddingUrl: null,
    };
    if (ref) {
      console.warn(
        `[voice-agent] narrator voice "${ref}" did not resolve to a ready library voice — falling back to ${FALLBACK_PROVIDER}/${input.fallbackVoiceSlug}`,
      );
    }
  }

  try {
    return createStreamingTtsAdapterForVoice(routing);
  } catch (err) {
    console.warn(
      `[voice-agent] narration adapter unavailable (${(err as Error).message}) — narration will be recorded but not voiced`,
    );
    return null;
  }
}

/** Stream one narration line onto the output track. Resolves when the last
 *  frame has been captured (captureFrame paces to real time). Throws on a
 *  TTS error frame so the driver can log the failure. */
export async function streamNarration(input: {
  routing: NarrationRouting;
  text: string;
  audioSource: AudioSource;
  signal?: AbortSignal;
  /** Called when the first audio frame lands (e.g. release with-speaker sfx). */
  onFirstAudio?: () => void;
}): Promise<void> {
  let firstAudio = false;
  for await (const chunk of input.routing.adapter.stream({
    text: input.text,
    voice: input.routing.voiceContext,
    signal: input.signal,
  })) {
    if (input.signal?.aborted) return;
    if (chunk.type === "error") throw new Error(chunk.message);
    if (chunk.type === "audio") {
      if (!firstAudio) {
        firstAudio = true;
        input.onFirstAudio?.();
      }
      await input.audioSource.captureFrame(toAudioFrame(chunk.pcmFloat32Base64, chunk.sampleRate));
    }
  }
}
