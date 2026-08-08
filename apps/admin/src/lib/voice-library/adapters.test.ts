import { describe, expect, it } from "vitest";
import { listVoiceLibrary, type VoiceLibraryAdapter } from "./adapters";
import type { LibraryVoice } from "./types";

const pocketVoice: LibraryVoice = {
  provider: "pocket_tts",
  externalId: "alba",
  name: "Alba",
  tags: [],
  cost: { value: 1.04, unit: "cr/1k", kind: "measured" },
  latency: { value: 365, unit: "ms", kind: "measured" },
  license: { name: "CC BY 4.0", commercialUse: true },
  source: { label: "Kyutai" },
  importMode: "embedding",
  availability: "available",
  importState: { kind: "not_imported" },
};

describe("voice library adapter aggregation", () => {
  it("returns healthy providers when one adapter list fails", async () => {
    const healthy: VoiceLibraryAdapter = {
      provider: "pocket_tts",
      status: async () => ({ provider: "pocket_tts", label: "Pocket", availability: "available", count: 1, importModes: ["embedding"] }),
      list: async () => [pocketVoice],
      get: async () => pocketVoice,
    };
    const failing: VoiceLibraryAdapter = {
      provider: "elevenlabs",
      status: async () => ({ provider: "elevenlabs", label: "ElevenLabs", availability: "available", count: null, importModes: ["provider_id"] }),
      list: async () => { throw new Error("provider timeout"); },
      get: async () => null,
    };
    const page = await listVoiceLibrary({
      query: { sort: "curated", limit: 48 },
      catalogVoices: [],
      adapters: [healthy, failing],
    });
    expect(page.voices).toEqual([pocketVoice]);
    expect(page.providers.find((item) => item.provider === "elevenlabs")).toMatchObject({
      availability: "temporarily_down",
      errorCode: "PROVIDER_LIST_FAILED",
    });
  });
});
