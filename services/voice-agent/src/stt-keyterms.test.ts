import { describe, expect, it } from "vitest";
import type { Scene } from "@kawabunga/types";
import { buildSceneKeyterms, supportsKeyterms } from "./stt-keyterms";

const roster = (
  entries: Array<{ slug: string; name: string }>,
  narrator?: Scene["narrator"],
): Pick<Scene, "characters" | "narrator"> => ({
  characters: entries.map((e) => ({
    characterSlug: e.slug,
    displayName: e.name,
    voice: e.slug,
    blurb: "…",
  })),
  ...(narrator ? { narrator } : {}),
});

describe("buildSceneKeyterms", () => {
  it("biases toward the roster's names — the terms routing depends on", () => {
    const terms = buildSceneKeyterms(
      roster([
        { slug: "abraham", name: "Abraham" },
        { slug: "sarah", name: "Sarah" },
        { slug: "eliezer", name: "Eliezer" },
      ]),
    );
    expect(terms).toContain("Abraham");
    expect(terms).toContain("Sarah");
    expect(terms).toContain("Eliezer");
  });

  it("adds word tokens of multi-word names, since users address one part", () => {
    const terms = buildSceneKeyterms(
      roster([{ slug: "melchizedek", name: "Melchizedek of Salem" }]),
    );
    expect(terms).toContain("Melchizedek of Salem");
    expect(terms).toContain("Melchizedek");
    expect(terms).toContain("Salem");
    // Short connectives add noise, not signal.
    expect(terms).not.toContain("of");
  });

  it("dedupes case-insensitively, keeping the display spelling", () => {
    const terms = buildSceneKeyterms(roster([{ slug: "abraham", name: "Abraham" }]));
    expect(terms.filter((t) => t.toLowerCase() === "abraham")).toEqual(["Abraham"]);
  });

  it("skips slugs that aren't sayable words", () => {
    const terms = buildSceneKeyterms(roster([{ slug: "abraham-v2", name: "Abraham" }]));
    expect(terms).toEqual(["Abraham", "Narrator"]);
  });

  it("includes Narrator unless the scene turns it off", () => {
    expect(buildSceneKeyterms(roster([{ slug: "abraham", name: "Abraham" }]))).toContain(
      "Narrator",
    );
    expect(
      buildSceneKeyterms(roster([{ slug: "abraham", name: "Abraham" }], "scenic")),
    ).toContain("Narrator");
    expect(
      buildSceneKeyterms(roster([{ slug: "abraham", name: "Abraham" }], "off")),
    ).not.toContain("Narrator");
  });

  it("caps the list so the bias stays sharp", () => {
    const big = Array.from({ length: 40 }, (_, i) => ({
      slug: `char${i}`,
      name: `Character Number${i}`,
    }));
    expect(buildSceneKeyterms(roster(big)).length).toBeLessThanOrEqual(50);
  });
});

describe("supportsKeyterms", () => {
  it("opts in only for Deepgram nova-3, whose option shape this matches", () => {
    expect(supportsKeyterms("deepgram/nova-3")).toBe(true);
    expect(supportsKeyterms("deepgram/nova-3-general")).toBe(true);
    expect(supportsKeyterms("deepgram/nova-2")).toBe(false);
    expect(supportsKeyterms("assemblyai/universal-streaming")).toBe(false);
    expect(supportsKeyterms("cartesia/ink-whisper")).toBe(false);
  });
});
