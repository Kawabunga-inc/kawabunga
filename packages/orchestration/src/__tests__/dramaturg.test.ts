import { describe, expect, it } from "vitest";
import { createInitialSceneState, type Scene } from "../client";
import {
  buildDramaturgMessages,
  expandLandedBeats,
  matchArcLabel,
  parseDramaturgReflection,
  sanitizeDramaturgNote,
} from "../dramaturg";

const scene: Scene = {
  id: "test-scene",
  title: "Test Scene",
  description: "A small scene for dramaturg tests.",
  openingBeat: "The room waits.",
  defaultAmbience: null,
  objective: "Ada admits what the machine really measured.",
  characters: [
    {
      characterSlug: "ada",
      displayName: "Ada",
      voice: "ada-voice",
      blurb: "Precise, curious, wants the truth.",
      motivations: "protect the lab's secret while learning what the user knows",
      behaviorTriggers: [
        { condition: "the machine is mentioned", behavior: "deflect with a question" },
      ],
    },
    {
      characterSlug: "turing",
      displayName: "Turing",
      voice: "turing-voice",
      blurb: "Reserved, playful, hides concern.",
    },
  ],
};

describe("buildDramaturgMessages", () => {
  it("renders objective, authored intentions, dialogue, and the previous note", () => {
    const request = buildDramaturgMessages({
      scene,
      sceneState: createInitialSceneState(scene),
      recentTurns: [
        { speakerSlug: "user", text: "What did the machine measure?" },
        { speakerSlug: "ada", speakerName: "Ada", text: "Why do you ask?" },
      ],
      previousNote: "Ada is stonewalling; give Turing an opening.",
    });

    expect(request.system).toContain("CHRONICLER");
    expect(request.system).toContain("do NOT write dialogue");
    expect(request.system).toContain("THE VISITOR IS A CO-AUTHOR");
    expect(request.system).toContain("trajectory, not a leash");
    expect(request.user).toContain("Objective: Ada admits what the machine really measured.");
    expect(request.user).toContain("wants: protect the lab's secret");
    expect(request.user).toContain("will: deflect with a question (when the machine is mentioned)");
    expect(request.user).toContain("Ada: Why do you ask?");
    expect(request.user).toContain("Your previous note: Ada is stonewalling; give Turing an opening.");
  });

  it("omits objective/previous-note lines when absent", () => {
    const plain: Scene = { ...scene, objective: undefined };
    const request = buildDramaturgMessages({
      scene: plain,
      sceneState: createInitialSceneState(plain),
      recentTurns: [],
    });
    expect(request.user).not.toContain("Objective:");
    expect(request.user).not.toContain("previous note");
    expect(request.user).toContain("(no dialogue yet)");
  });

  it("writes forward under narrator initiative and attributes a played role", () => {
    const configured: Scene = {
      ...scene,
      initiative: "narrator",
      userRole: "character",
      userCharacter: {
        name: "Miriam",
        blurb: "A royal archivist carrying a sealed decree.",
        relationship: "Ada's former patron",
      },
    };
    const request = buildDramaturgMessages({
      scene: configured,
      sceneState: createInitialSceneState(configured),
      recentTurns: [{ speakerSlug: "user", text: "I break the seal." }],
    });
    expect(request.system).toContain("FORWARD AUTHORSHIP IS REQUIRED");
    expect(request.system).toContain("at least one INTENT with a near trigger");
    expect(request.system).toContain("TIMED event within ~60-120s");
    expect(request.user).toContain("Visitor role: Miriam — A royal archivist");
    expect(request.user).toContain("Attribute the user's words and deeds to Miriam");
  });
});

describe("arc in the dramaturg review", () => {
  const arcScene: Scene = {
    ...scene,
    arc: [
      { label: "The machine is named", summary: "someone says its name aloud" },
      { label: "Ada's admission" },
    ],
  };

  it("renders the arc with markers and the LANDED instruction", () => {
    const state = {
      ...createInitialSceneState(arcScene),
      arcLanded: ["The machine is named"],
    };
    const request = buildDramaturgMessages({
      scene: arcScene,
      sceneState: state,
      recentTurns: [],
    });
    expect(request.user).toContain("[landed] The machine is named - someone says its name aloud");
    expect(request.user).toContain("[next]   Ada's admission");
    expect(request.system).toContain("LANDED: <beat label only, copied verbatim");
  });

  it("omits the arc block and instruction for arc-less scenes", () => {
    const request = buildDramaturgMessages({
      scene,
      sceneState: createInitialSceneState(scene),
      recentTurns: [],
    });
    expect(request.user).not.toContain("Scene arc");
    expect(request.system).not.toContain("LANDED:");
  });
});

describe("parseDramaturgReflection", () => {
  it("splits the note from LANDED lines regardless of position", () => {
    const { note, landed } = parseDramaturgReflection(
      "LANDED: The machine is named\nAda is cornered; press the admission now.\nLANDED: Ada's admission",
    );
    expect(note).toBe("Ada is cornered; press the admission now.");
    expect(landed).toEqual(["The machine is named", "Ada's admission"]);
  });

  it("handles note-only and landed-only replies", () => {
    expect(parseDramaturgReflection("Just a note.")).toEqual({
      note: "Just a note.",
      landed: [],
      facts: [],
      gone: [],
      chronicle: null,
    });
    expect(parseDramaturgReflection("landed: Something Happened")).toEqual({
      note: null,
      landed: ["Something Happened"],
      facts: [],
      gone: [],
      chronicle: null,
    });
  });

  it("extracts FACT lines alongside the note and landings", () => {
    const { note, landed, facts } = parseDramaturgReflection(
      [
        "FACT: Sarah admitted she laughed at the promise.",
        "LANDED: The laugh is named",
        "fact:   Eliezer  followed the strangers to the ridge.",
        "Press Abraham on whether he shares her doubt.",
      ].join("\n"),
    );
    expect(facts).toEqual([
      "Sarah admitted she laughed at the promise.",
      "Eliezer followed the strangers to the ridge.",
    ]);
    expect(landed).toEqual(["The laugh is named"]);
    expect(note).toBe("Press Abraham on whether he shares her doubt.");
  });
});

describe("the chronicle in the chronicler reflection", () => {
  it("parses STORY/THREAD/WORLD/INTENT sections alongside the legacy outputs", () => {
    const parsed = parseDramaturgReflection(
      [
        "STORY: A traveler reached Ada's lab at dusk and asked about the machine.",
        "THREAD: Ada has not admitted what the machine measured.",
        "THREAD: The traveler's satchel is still unopened.",
        "WORLD: Rain starting against the windows.",
        "INTENT: when the machine is named again: Ada crosses to cover it.",
        "FACT: The traveler gave the name Elm.",
        "NOTE: Press Ada's secret; the satchel can wait.",
      ].join("\n"),
    );
    expect(parsed.chronicle).toEqual({
      story: "A traveler reached Ada's lab at dusk and asked about the machine.",
      threads: [
        "Ada has not admitted what the machine measured.",
        "The traveler's satchel is still unopened.",
      ],
      world: ["Rain starting against the windows."],
      intents: [
        { trigger: "the machine is named again", direction: "Ada crosses to cover it." },
      ],
      timed: [],
      drafts: [],
    });
    expect(parsed.facts).toEqual(["The traveler gave the name Elm."]);
    expect(parsed.note).toBe("Press Ada's secret; the satchel can wait.");
  });

  it("joins wrapped STORY lines and tolerates arrow-separated intents", () => {
    const parsed = parseDramaturgReflection(
      [
        "STORY: The scene opened quietly.",
        "STORY: Then the machine was mentioned.",
        "INTENT: when the rain is heard -> Turing glances at the window.",
      ].join("\n"),
    );
    expect(parsed.chronicle?.story).toBe(
      "The scene opened quietly. Then the machine was mentioned.",
    );
    expect(parsed.chronicle?.intents).toEqual([
      { trigger: "the rain is heard", direction: "Turing glances at the window." },
    ]);
  });

  it("parses TIMED lines in tolerant formats and clamps via sanitize", () => {
    const parsed = parseDramaturgReflection(
      [
        "TIMED: in ~45s: The rain breaks into a downpour.",
        "TIMED: 90 s - Turing returns from the archive.",
        "TIMED: someday: never parses",
      ].join("\n"),
    );
    expect(parsed.chronicle?.timed).toEqual([
      { afterSeconds: 45, direction: "The rain breaks into a downpour." },
      { afterSeconds: 90, direction: "Turing returns from the archive." },
    ]);
    expect(parsed.note).toBeNull();
  });

  it("parses DRAFT passages", () => {
    const parsed = parseDramaturgReflection(
      [
        "DRAFT: The rain thickens; the lamp halos in the wet glass.",
        "NOTE: Let the weather do the pressing.",
      ].join("\n"),
    );
    expect(parsed.chronicle?.drafts).toEqual([
      "The rain thickens; the lamp halos in the wet glass.",
    ]);
    expect(parsed.note).toBe("Let the weather do the pressing.");
  });

  it("drops malformed INTENT lines instead of leaking them into the note", () => {
    const parsed = parseDramaturgReflection(
      ["INTENT: something without a trigger", "NOTE: Keep pressing."].join("\n"),
    );
    expect(parsed.chronicle).toBeNull();
    expect(parsed.note).toBe("Keep pressing.");
  });

  it("returns a null chronicle for legacy note-only replies", () => {
    const parsed = parseDramaturgReflection("The pacing is fine; hold.");
    expect(parsed.chronicle).toBeNull();
    expect(parsed.note).toBe("The pacing is fine; hold.");
  });

  it("shows the current chronicle for revision and instructs restatement", () => {
    const request = buildDramaturgMessages({
      scene,
      sceneState: createInitialSceneState(scene),
      recentTurns: [],
      chronicle: {
        story: "The traveler arrived at dusk.",
        threads: ["The satchel is unopened."],
        world: ["Rain at the windows."],
        intents: [{ trigger: "thunder", direction: "Ada flinches." }],
        timed: [{ afterSeconds: 60, direction: "The lamp gutters out." }],
        drafts: ["The storm leans on the windows."],
      },
    });
    expect(request.system).toContain("THE CHRONICLE");
    expect(request.system).toContain("restate ALL FOUR sections");
    expect(request.user).toContain("STORY: The traveler arrived at dusk.");
    expect(request.user).toContain("THREAD: The satchel is unopened.");
    expect(request.user).toContain("WORLD: Rain at the windows.");
    expect(request.user).toContain("INTENT: when thunder: Ada flinches.");
    expect(request.user).toContain("TIMED: in ~60s: The lamp gutters out.");
    expect(request.user).toContain("DRAFT: The storm leans on the windows.");
  });
});

describe("matchArcLabel", () => {
  const labels = ["The promise is spoken aloud", "Sarah's laugh — and the denial"];

  it("matches exact (case-insensitive) labels", () => {
    expect(matchArcLabel("the promise is spoken aloud", labels)).toBe(
      "The promise is spoken aloud",
    );
  });

  it("tolerates a copied label-with-summary suffix", () => {
    expect(
      matchArcLabel(
        "The promise is spoken aloud - The promise of a son is said where Sarah can hear it.",
        labels,
      ),
    ).toBe("The promise is spoken aloud");
  });

  it("rejects prefixes that aren't separator-bounded and unknown labels", () => {
    expect(matchArcLabel("The promise is spoken aloudly", labels)).toBeNull();
    expect(matchArcLabel("Something else entirely", labels)).toBeNull();
  });
});

describe("expandLandedBeats", () => {
  const arc = [
    "The stranger is tested",
    "The promise is spoken aloud",
    "Sarah's laugh — and the denial",
  ];

  it("landing a later beat lands every earlier beat, in arc order", () => {
    expect(expandLandedBeats(["The promise is spoken aloud"], arc)).toEqual([
      "The stranger is tested",
      "The promise is spoken aloud",
    ]);
    expect(expandLandedBeats(["Sarah's laugh — and the denial"], arc)).toEqual(arc);
  });

  it("is a no-op for the first beat and for empty input", () => {
    expect(expandLandedBeats(["The stranger is tested"], arc)).toEqual([
      "The stranger is tested",
    ]);
    expect(expandLandedBeats([], arc)).toEqual([]);
  });

  it("matches case-insensitively and ignores labels not in the arc", () => {
    expect(
      expandLandedBeats(["the PROMISE is spoken aloud", "not a real beat"], arc),
    ).toEqual(["The stranger is tested", "The promise is spoken aloud"]);
  });

  it("merges prior state with a new later landing", () => {
    expect(
      expandLandedBeats(
        ["The stranger is tested", "Sarah's laugh — and the denial"],
        arc,
      ),
    ).toEqual(arc);
  });
});

describe("sanitizeDramaturgNote", () => {
  it("strips fences, labels, and wrapping quotes; collapses whitespace", () => {
    expect(
      sanitizeDramaturgNote('```\nDirector\'s note: "Press  Ada\nnow."\n```'),
    ).toBe("Press Ada now.");
  });

  it("returns null for empty output", () => {
    expect(sanitizeDramaturgNote("   ")).toBeNull();
    expect(sanitizeDramaturgNote('""')).toBeNull();
  });

  it("caps long notes at a sentence boundary", () => {
    const first = "Sarah's laugh has landed and Abraham has told the story of the stars twice already. ".repeat(2);
    const note = sanitizeDramaturgNote(first + "x".repeat(400));
    expect(note!.length).toBeLessThanOrEqual(300);
    expect(note!.endsWith(".")).toBe(true);
  });
});
