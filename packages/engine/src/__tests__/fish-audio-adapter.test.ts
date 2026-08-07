import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FISH_AUDIO_SAMPLE_RATE,
  FishAudioStreamingAdapter,
  type StreamingTtsChunk,
} from "../audio";

/**
 * The Fish adapter is the only one that receives raw binary PCM rather than
 * framed JSON, which makes chunk boundaries its distinctive hazard: the
 * transport is free to split a 16-bit sample down the middle. These tests
 * pin that behaviour, plus the misconfiguration paths that should surface as
 * an error chunk rather than a throw (the voice-stream route treats a thrown
 * adapter as a dead session, an error chunk as a skippable line).
 */

/** A response whose body yields exactly the byte groups given. */
function streamingResponse(groups: Uint8Array[], init?: { ok?: boolean; status?: number }) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const g of groups) controller.enqueue(g);
      controller.close();
    },
  });
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    body,
    text: async () => "",
  } as unknown as Response;
}

/** int16le bytes for the given samples. */
function pcm(samples: number[]): Uint8Array {
  const buf = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => buf.writeInt16LE(s, i * 2));
  return new Uint8Array(buf);
}

async function collect(
  it: AsyncIterable<StreamingTtsChunk>,
): Promise<StreamingTtsChunk[]> {
  const out: StreamingTtsChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

/** Concatenate every audio chunk back into one waveform. */
function waveform(chunks: StreamingTtsChunk[]): number[] {
  const out: number[] = [];
  for (const c of chunks) {
    if (c.type !== "audio") continue;
    const buf = Buffer.from(c.pcmFloat32Base64, "base64");
    const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    out.push(...f32);
  }
  return out;
}

const VOICE = { slug: "probe", providerConfig: { voiceId: "ref-123" } };

describe("FishAudioStreamingAdapter", () => {
  beforeEach(() => {
    process.env.FISH_AUDIO_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.FISH_AUDIO_API_KEY;
    delete process.env.FISH_AUDIO_MODEL_ID;
    vi.unstubAllGlobals();
  });

  it("decodes s16le into float32 at the pipeline's rate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamingResponse([pcm([0, 16384, -16384, 32767])])),
    );
    const chunks = await collect(
      new FishAudioStreamingAdapter().stream({ text: "hello", voice: VOICE }),
    );
    expect(chunks.every((c) => c.type === "audio")).toBe(true);
    expect(chunks[0]).toMatchObject({ samples: 4, sampleRate: FISH_AUDIO_SAMPLE_RATE });
    const w = waveform(chunks);
    expect(w[0]).toBe(0);
    expect(w[1]).toBeCloseTo(0.5, 4);
    expect(w[2]).toBeCloseTo(-0.5, 4);
    expect(w[3]).toBeCloseTo(1, 4);
  });

  it("reassembles a sample split across a chunk boundary", async () => {
    const whole = pcm([1000, -2000, 3000, -4000, 5000]);
    // Cut on an ODD byte so the third sample is torn in half.
    const split = [whole.slice(0, 5), whole.slice(5)];
    expect(split[0]!.byteLength % 2).toBe(1); // the tear is real

    vi.stubGlobal("fetch", vi.fn(async () => streamingResponse(split)));
    const torn = waveform(
      await collect(new FishAudioStreamingAdapter().stream({ text: "hi", voice: VOICE })),
    );

    vi.stubGlobal("fetch", vi.fn(async () => streamingResponse([whole])));
    const intact = waveform(
      await collect(new FishAudioStreamingAdapter().stream({ text: "hi", voice: VOICE })),
    );

    // Byte-for-byte identical audio regardless of where the transport cut.
    expect(torn).toEqual(intact);
    expect(torn).toHaveLength(5);
  });

  it("drops a trailing orphan byte rather than emitting a bogus sample", async () => {
    // A truncated stream ending mid-sample: 3 bytes = 1 sample + 1 orphan.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamingResponse([pcm([1234]).slice(0, 3)])),
    );
    const chunks = await collect(
      new FishAudioStreamingAdapter().stream({ text: "hi", voice: VOICE }),
    );
    expect(waveform(chunks)).toHaveLength(1);
    expect(chunks.some((c) => c.type === "error")).toBe(false);
  });

  it("sends the model as a header and the voice as reference_id", async () => {
    const fetchMock = vi.fn(async () => streamingResponse([pcm([1])]));
    vi.stubGlobal("fetch", fetchMock);
    await collect(
      new FishAudioStreamingAdapter().stream({
        text: "  spaced  ",
        voice: { slug: "v", providerConfig: { voiceId: "ref-123", modelId: "s1" } },
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).model).toBe("s1");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      text: "spaced", // trimmed before billing — Fish charges by byte
      reference_id: "ref-123",
      format: "pcm",
      sample_rate: FISH_AUDIO_SAMPLE_RATE,
    });
  });

  it("reports misconfiguration as an error chunk, not a throw", async () => {
    delete process.env.FISH_AUDIO_API_KEY;
    const noKey = await collect(
      new FishAudioStreamingAdapter().stream({ text: "hi", voice: VOICE }),
    );
    expect(noKey[0]).toMatchObject({ type: "error" });
    expect((noKey[0] as { message: string }).message).toContain("FISH_AUDIO_API_KEY");

    process.env.FISH_AUDIO_API_KEY = "test-key";
    const noVoice = await collect(
      new FishAudioStreamingAdapter().stream({ text: "hi", voice: { slug: "v" } }),
    );
    expect((noVoice[0] as { message: string }).message).toContain("providerConfig.voiceId");
  });

  it("surfaces an HTTP failure with its status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => streamingResponse([], { ok: false, status: 402 })),
    );
    const chunks = await collect(
      new FishAudioStreamingAdapter().stream({ text: "hi", voice: VOICE }),
    );
    expect((chunks[0] as { message: string }).message).toContain("402");
  });

  it("emits nothing for empty text rather than billing for silence", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const chunks = await collect(
      new FishAudioStreamingAdapter().stream({ text: "   ", voice: VOICE }),
    );
    expect(chunks).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
