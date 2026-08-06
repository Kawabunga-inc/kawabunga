import { describe, expect, it } from "vitest";
import { createPerformanceVoiceRouter, type PerformanceSegmentKind } from "./performance-segments";

function fakeAdapter(
  label: string,
  calls: string[],
  options: { fail?: boolean } = {},
) {
  return {
    async *stream(text: string): AsyncIterable<string> {
      calls.push(`${label}:request:${text}`);
      if (options.fail) throw new Error(`${label} offline`);
      await Promise.resolve();
      yield `${label}:audio:${text}`;
    },
  };
}

async function drainFakeAdapter(
  adapter: ReturnType<typeof fakeAdapter>,
  text: string,
  playback: string[],
): Promise<void> {
  for await (const frame of adapter.stream(text)) playback.push(frame);
}

describe("runVoiceStream performance routing", () => {
  it("drains fake character and narrator adapters in segment order", async () => {
    const calls: string[] = [];
    const playback: string[] = [];
    const character = fakeAdapter("character", calls);
    const narrator = fakeAdapter("narrator", calls);
    const router = createPerformanceVoiceRouter({ narrationAvailable: true });
    let drainChain = Promise.resolve();
    const segments: Array<{ kind: Exclude<PerformanceSegmentKind, "meta">; text: string }> = [
      { kind: "stage", text: "She rises." },
      { kind: "dialogue", text: "You dare?" },
      { kind: "stage", text: "She turns away." },
    ];

    for (const segment of segments) {
      drainChain = drainChain.then(() => router.drain(segment.kind, {
        character: () => drainFakeAdapter(character, segment.text, playback),
        narration: () => drainFakeAdapter(narrator, segment.text, playback),
      }));
    }
    await drainChain;

    expect(calls).toEqual([
      "narrator:request:She rises.",
      "character:request:You dare?",
      "narrator:request:She turns away.",
    ]);
    expect(playback).toEqual([
      "narrator:audio:She rises.",
      "character:audio:You dare?",
      "narrator:audio:She turns away.",
    ]);
  });

  it("falls back once and voices all remaining stage spans as the character", async () => {
    const calls: string[] = [];
    const playback: string[] = [];
    const failures: string[] = [];
    const character = fakeAdapter("character", calls);
    const narrator = fakeAdapter("narrator", calls, { fail: true });
    const router = createPerformanceVoiceRouter({
      narrationAvailable: true,
      onNarrationFailure: (error) => failures.push((error as Error).message),
    });
    const drain = (kind: "stage" | "dialogue", text: string) => router.drain(kind, {
      character: () => drainFakeAdapter(character, text, playback),
      narration: () => drainFakeAdapter(narrator, text, playback),
    });

    await drain("stage", "She rises.");
    await drain("dialogue", "You dare?");
    await drain("stage", "She turns away.");

    expect(calls).toEqual([
      "narrator:request:She rises.",
      "character:request:She rises.",
      "character:request:You dare?",
      "character:request:She turns away.",
    ]);
    expect(playback).toEqual([
      "character:audio:She rises.",
      "character:audio:You dare?",
      "character:audio:She turns away.",
    ]);
    expect(failures).toEqual(["narrator offline"]);
  });

  it("keeps pure dialogue on one unchanged character adapter call", async () => {
    const calls: string[] = [];
    const playback: string[] = [];
    const character = fakeAdapter("character", calls);
    const narrator = fakeAdapter("narrator", calls);
    const router = createPerformanceVoiceRouter({ narrationAvailable: true });

    await router.drain("dialogue", {
      character: () => drainFakeAdapter(character, "I remember.", playback),
      narration: () => drainFakeAdapter(narrator, "I remember.", playback),
    });

    expect(calls).toEqual(["character:request:I remember."]);
    expect(playback).toEqual(["character:audio:I remember."]);
  });
});
