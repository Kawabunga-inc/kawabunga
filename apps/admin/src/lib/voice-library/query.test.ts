import { describe, expect, it } from "vitest";
import { filterLibraryVoices, parseVoiceLibraryQuery } from "./query";
import type { LibraryVoice } from "./types";

function voice(commercialUse?: boolean): LibraryVoice {
  return {
    provider: "pocket_tts",
    externalId: commercialUse === undefined ? "unknown" : String(commercialUse),
    name: "Test voice",
    tags: [],
    cost: { value: 1, unit: "cr/1k", kind: "measured" },
    latency: { value: 365, unit: "ms", kind: "measured" },
    license: { name: "Test license", commercialUse },
    source: { label: "Test" },
    importMode: "embedding",
    availability: "available",
    importState: { kind: "not_imported" },
  };
}

describe("voice library query", () => {
  it("normalizes query-string values and caps pagination", () => {
    const query = parseVoiceLibraryQuery(
      new URLSearchParams("provider=pocket_tts&q=Alba&license=unknown&limit=999"),
    );
    expect(query).toMatchObject({
      provider: "pocket_tts",
      search: "Alba",
      license: "unknown",
      limit: 100,
    });
  });

  it("keeps unverified commercial use distinct from false", () => {
    const voices = [voice(true), voice(false), voice(undefined)];
    expect(
      filterLibraryVoices(voices, {
        license: "unknown",
        sort: "curated",
        limit: 48,
      }).map((item) => item.externalId),
    ).toEqual(["unknown"]);
    expect(
      filterLibraryVoices(voices, {
        license: "noncommercial",
        sort: "curated",
        limit: 48,
      }).map((item) => item.externalId),
    ).toEqual(["false"]);
  });
});
