import { describe, expect, it } from "vitest";
import {
  DEFAULT_PORTS,
  formatPortMap,
  resolveDevPorts,
  resolveDevPublicUrls,
} from "./dev-ports.mjs";

describe("resolveDevPorts", () => {
  it("keeps the historical ports when no base is set", () => {
    const { ports, base, warnings } = resolveDevPorts({});
    expect(ports).toEqual(DEFAULT_PORTS);
    expect(base).toBeNull();
    expect(warnings).toEqual([]);
  });

  it("lays the stack out as a contiguous block from the base", () => {
    const { ports, base } = resolveDevPorts({ KAWABUNGA_PORT_BASE: "4200" });
    expect(ports).toEqual({
      web: 4200,
      admin: 4201,
      voiceHost: 4202,
      voiceAgentHealth: 4203,
    });
    expect(base).toBe(4200);
  });

  it("lets an explicit service port override the base", () => {
    const { ports } = resolveDevPorts({
      KAWABUNGA_PORT_BASE: "4200",
      VOICE_HOST_PORT: "9000",
    });
    expect(ports.voiceHost).toBe(9000);
    expect(ports.web).toBe(4200);
  });

  it("warns and falls back rather than crashing on an unusable base", () => {
    for (const bad of ["nope", "0", "65535"]) {
      const { ports, warnings } = resolveDevPorts({ KAWABUNGA_PORT_BASE: bad });
      expect(ports).toEqual(DEFAULT_PORTS);
      expect(warnings).toHaveLength(1);
    }
    // An empty value is "unset", not a typo — no warning.
    expect(resolveDevPorts({ KAWABUNGA_PORT_BASE: "  " }).warnings).toEqual([]);
  });
});

describe("resolveDevPublicUrls", () => {
  const ports = { web: 4200, admin: 4201, voiceHost: 4202, voiceAgentHealth: 4203 };

  it("points the site URL at the resolved web port", () => {
    expect(resolveDevPublicUrls(ports, {}).NEXT_PUBLIC_SITE_URL).toBe("http://localhost:4200");
    expect(
      resolveDevPublicUrls(ports, { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })
        .NEXT_PUBLIC_SITE_URL,
    ).toBe("http://localhost:4200");
  });

  it("never clobbers a deliberate non-local URL", () => {
    const urls = resolveDevPublicUrls(ports, {
      NEXT_PUBLIC_SITE_URL: "https://staging.kawabunga.app",
      NEXT_PUBLIC_VOICE_HOST_URL: "https://voice.kawabunga.app",
    });
    expect(urls.NEXT_PUBLIC_SITE_URL).toBeUndefined();
    expect(urls.NEXT_PUBLIC_VOICE_HOST_URL).toBeUndefined();
  });

  it("re-points an existing local voice-host URL but never invents one", () => {
    expect(
      resolveDevPublicUrls(ports, { NEXT_PUBLIC_VOICE_HOST_URL: "http://localhost:8080" })
        .NEXT_PUBLIC_VOICE_HOST_URL,
    ).toBe("http://localhost:4202");
    // Unset means "use the Vercel fallback route" — setting it would change behavior.
    expect(resolveDevPublicUrls(ports, {}).NEXT_PUBLIC_VOICE_HOST_URL).toBeUndefined();
  });
});

describe("formatPortMap", () => {
  it("lists every service with its URL", () => {
    const lines = formatPortMap({ web: 1, admin: 2, voiceHost: 3, voiceAgentHealth: 4 });
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("http://localhost:1");
  });
});
