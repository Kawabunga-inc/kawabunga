import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPocketTtsAuthHeaders,
  getPocketTtsBaseUrl,
  POCKET_TTS_PUBLIC_BASE_URL,
  warmPocketTtsService,
} from "../audio";

const originalPocketUrl = process.env.POCKET_TTS_BASE_URL;
const originalLegacyUrl = process.env.KYUTAI_TTS_BASE_URL;
const originalToken = process.env.POCKET_TTS_API_TOKEN;

afterEach(() => {
  vi.unstubAllGlobals();
  restore("POCKET_TTS_BASE_URL", originalPocketUrl);
  restore("KYUTAI_TTS_BASE_URL", originalLegacyUrl);
  restore("POCKET_TTS_API_TOKEN", originalToken);
});

describe("warmPocketTtsService", () => {
  it("warms the exact voice with shared-service auth", async () => {
    process.env.POCKET_TTS_API_TOKEN = "secret";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          service: "pocket-tts",
          voice: "narrator",
          elapsedMs: 321,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      warmPocketTtsService({
        baseUrl: "https://pocket.internal/",
        voice: {
          slug: "narrator",
          embeddingUrl: "https://signed.example/voice.safetensors",
        },
      }),
    ).resolves.toMatchObject({ ok: true, voice: "narrator", elapsedMs: 321 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://pocket.internal/warm");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer secret",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      voice: "narrator",
      voiceUrl: "https://signed.example/voice.safetensors",
    });
  });

  it("surfaces a bounded provider error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("model failed", { status: 500 })),
    );

    await expect(
      warmPocketTtsService({
        baseUrl: "https://pocket.internal",
        voice: { slug: "narrator" },
      }),
    ).rejects.toThrow("Pocket TTS warm-up 500: model failed");
  });
});

describe("getPocketTtsAuthHeaders", () => {
  it("adds the configured shared bearer token", () => {
    process.env.POCKET_TTS_API_TOKEN = "secret";
    expect(getPocketTtsAuthHeaders()).toEqual({
      Authorization: "Bearer secret",
    });
  });

  it("keeps legacy/local deployments tokenless when unset", () => {
    delete process.env.POCKET_TTS_API_TOKEN;
    expect(getPocketTtsAuthHeaders()).toEqual({});
  });
});

describe("getPocketTtsBaseUrl", () => {
  it("prefers the dedicated Pocket service", () => {
    process.env.POCKET_TTS_BASE_URL = "https://pocket.internal///";
    process.env.KYUTAI_TTS_BASE_URL = "https://legacy.internal";
    expect(getPocketTtsBaseUrl()).toBe("https://pocket.internal");
  });

  it("accepts the legacy shared-service variable during migration", () => {
    delete process.env.POCKET_TTS_BASE_URL;
    process.env.KYUTAI_TTS_BASE_URL = "https://legacy.internal/";
    expect(getPocketTtsBaseUrl()).toBe("https://legacy.internal");
  });

  it("defaults to the dedicated production domain", () => {
    delete process.env.POCKET_TTS_BASE_URL;
    delete process.env.KYUTAI_TTS_BASE_URL;
    expect(getPocketTtsBaseUrl()).toBe(POCKET_TTS_PUBLIC_BASE_URL);
  });
});

function restore(name: string, value: string | undefined) {
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}
