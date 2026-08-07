import { describe, expect, it } from "vitest";
import {
  declaresUserAction,
  isNarratorEventDeclaration,
  buildOpeningNarrationMessages,
  buildSceneDecisionRequest,
  buildSceneSessionSnapshot,
  buildSpeakerTurnRequest,
  buildDirectiveChunk,
  createInitialSceneState,
  readSceneFactsFromSnapshot,
  readSceneMemoryFromSnapshot,
  readSceneStateFromSnapshot,
  openingMode,
  resolveSceneDecision,
  sanitizeOpeningNarration,
  selectAuthoredOpening,
  dismissedPresentCharacters,
  mergeChronicle,
  readSceneChronicleFromSnapshot,
  sanitizeChronicle,
  updateSceneFacts,
  updateSceneMemory,
  type Scene,
  getScene,
  initiativeMode,
  userDirectorEnabled,
  userRoleFor,
} from "../client";

const scene: Scene = {
  id: "test-scene",
  title: "Test Scene",
  description: "A small scene for orchestration tests.",
  openingBeat: "The room waits.",
  defaultAmbience: "room-tone",
  characters: [
    {
      characterSlug: "ada",
      displayName: "Ada",
      voice: "ada-voice",
      blurb: "Precise, curious, wants the truth.",
    },
    {
      characterSlug: "turing",
      displayName: "Turing",
      voice: "turing-voice",
      blurb: "Reserved, playful, hides concern.",
    },
  ],
};

// The Phase-3 roster variant: same cast, plus placed sounds the director
// can cue (a bed + a one-shot).
const sceneWithSounds: Scene = {
  ...scene,
  id: "test-scene-sounds",
  sounds: [
    {
      slug: "room-tone",
      name: "Room tone",
      description: "Low room hum, unremarkable.",
      role: "bed",
      loopable: true,
    },
    {
      slug: "glass-shatter",
      name: "Glass shatter",
      description: "A glass breaks nearby.",
      role: "oneshot",
      triggerHint: "when something breaks",
      loopable: false,
    },
  ],
};

// The authored-intention variant: character goals + triggers, a scene
// objective, and an insistent drive.
const sceneWithIntent: Scene = {
  ...scene,
  id: "test-scene-intent",
  objective: "Ada admits what the machine really measured.",
  drive: "insistent",
  characters: [
    {
      ...scene.characters[0], // ada
      roleInScene: "reluctant witness",
      motivations: "protect the lab's secret while learning what the user knows",
      emotionalBaseline: "guarded",
      behaviorTriggers: [
        { condition: "the machine is mentioned", behavior: "deflect with a question" },
      ],
    },
    scene.characters[1], // turing — no intention authored
  ],
};

describe("@kawabunga/orchestration client", () => {
  it("creates initial scene state", () => {
    expect(createInitialSceneState(scene)).toEqual({
      sceneId: "test-scene",
      beat: "The room waits.",
      presentCharacterSlugs: ["ada", "turing"],
      ambience: "room-tone",
      lastSpeakerSlug: null,
      turnIndex: 0,
    });
  });

  it("round-trips persisted scene state snapshots", () => {
    const state = createInitialSceneState(scene);
    const snapshot = buildSceneSessionSnapshot(state, "2026-01-01T00:00:00.000Z");

    expect(snapshot).toEqual({
      version: 1,
      sceneId: "test-scene",
      sceneState: state,
      sceneMemory: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(readSceneStateFromSnapshot(snapshot, "test-scene")).toEqual(state);
    expect(readSceneStateFromSnapshot(state, "test-scene")).toEqual(state);
    expect(readSceneStateFromSnapshot(snapshot, "other-scene")).toBeNull();
  });

  it("round-trips character emotional states through scene snapshots", () => {
    const state = {
      ...createInitialSceneState(scene),
      characterStates: {
        ada: "shaken — the relay answered in her mother's voice",
      },
    };
    const snapshot = buildSceneSessionSnapshot(state, "2026-01-01T00:00:00.000Z");

    expect(readSceneStateFromSnapshot(snapshot, scene.id)?.characterStates).toEqual(
      state.characterStates,
    );
    expect(createInitialSceneState(scene)).not.toHaveProperty("characterStates");
  });

  it("folds recent turns into bounded scene memory", () => {
    const memory = updateSceneMemory({
      previousMemory: ["Ada: The machine hummed."],
      recentTurns: [
        { speakerSlug: "user", text: "What changed?" },
        { speakerSlug: "ada", speakerName: "Ada", text: "The pressure dropped." },
        { speakerSlug: "ada", speakerName: "Ada", text: "The pressure dropped." },
      ],
      maxEntries: 3,
    });

    expect(memory).toEqual([
      "Ada: The machine hummed.",
      "user: What changed?",
      "Ada: The pressure dropped.",
    ]);

    const snapshot = buildSceneSessionSnapshot(createInitialSceneState(scene), {
      updatedAt: "2026-01-01T00:00:00.000Z",
      sceneMemory: memory,
    });
    expect(readSceneMemoryFromSnapshot(snapshot, "test-scene")).toEqual(memory);
    expect(readSceneMemoryFromSnapshot(snapshot, "other-scene")).toEqual([]);
  });

  it("builds provider-ready scene decision messages", () => {
    const request = buildSceneDecisionRequest({
      scene,
      sceneState: createInitialSceneState(scene),
      recentTurns: [{ speakerSlug: "user", text: "Ada, what do you see?" }],
      sceneMemory: ["Turing warned Ada not to touch the relay."],
      lastUserMessage: "Ada, what do you see?",
    });

    expect(request.messages).toHaveLength(2);
    expect(request.messages[0].role).toBe("system");
    expect(request.messages[0].content).toContain("Scene: \"Test Scene\"");
    expect(request.messages[0].content).toContain('slug="ada"');
    expect(request.messages[0].content).toContain("Scene memory");
    expect(request.trace.sceneMemoryCount).toBe(1);
    expect(request.messages[1].content).toContain("The user just said");
    expect(request.responseSchema.required).toEqual([
      "action",
      "speakerId",
      "beat",
      "sceneCue",
      "delivery",
      "narration",
      "narrationKind",
      "weight",
      "exitSlug",
      "enterSlug",
      "ambience",
      "sfx",
      "beatLabel",
      "momentum",
    ]);
    expect([...request.responseSchema.required].sort()).toEqual(
      Object.keys(request.responseSchema.properties).sort(),
    );
    expect(request.responseSchema.properties.narrationKind).toEqual({
      type: ["string", "null"],
      enum: ["answer", "event", null],
    });
    expect(request.responseSchema.properties.weight).toEqual({
      type: ["string", "null"],
      enum: ["minor", "major", "irreversible", null],
    });
    expect(request.messages[0].content).toContain("Set `delivery` on EVERY `speak`");
    expect(request.messages[0].content).toContain("`expansive`");
    expect(request.messages[0].content).toContain("The visitor's explicit request is binding");
    expect(request.messages[0].content).toContain("React to the NEWEST event");
    expect(request.messages[0].content).toContain("On EVERY `narrate`, set `narrationKind`");
    expect(request.trace.sceneId).toBe("test-scene");
  });

  it("lets the director set the dramatic amount of floor for a speaker", () => {
    expect(buildDirectiveChunk({ beat: "Answer and yield.", delivery: "brief" })).toContain(
      "Delivery: brief. Land one sharp line",
    );
    expect(buildDirectiveChunk({ beat: "Answer plainly.", delivery: "natural" })).toContain(
      "Delivery: natural. Take the space an ordinary spoken exchange needs",
    );
    expect(
      buildDirectiveChunk({ beat: "Tell the whole story.", delivery: "expansive" }),
    ).toContain("Delivery: expansive. The director is deliberately giving you the floor");
  });

  it("feeds current character state to both the director and reactive speaker", () => {
    const state = {
      ...createInitialSceneState(sceneWithIntent),
      characterStates: {
        ada: "shattered — she watched the machine erase Turing's proof",
      },
    };
    const director = buildSceneDecisionRequest({
      scene: sceneWithIntent,
      sceneState: state,
      recentTurns: [],
    }).messages[0]!.content;
    expect(director).toContain(
      "now: shattered — she watched the machine erase Turing's proof",
    );
    expect(director).toContain("CURRENT truth and outranks their");

    const turn = buildSpeakerTurnRequest({
      scene: sceneWithIntent,
      sceneState: state,
      decision: { action: "speak", speakerId: "ada", beat: "Face what the machine did." },
      recentTurns: [{ speakerSlug: "user", text: "Ada?" }],
    });
    expect(turn?.promptChunk).toContain(
      "Your state right now: shattered — she watched the machine erase Turing's proof. Perform from it.",
    );

    const legacy = buildSceneDecisionRequest({
      scene: sceneWithIntent,
      sceneState: createInitialSceneState(sceneWithIntent),
      recentTurns: [],
    }).messages[0]!.content;
    expect(legacy).not.toContain("      now:");
    expect(legacy).not.toContain("CURRENT truth and outranks");
  });

  it("resolves speak/wait/narrate/end decisions into next state", () => {
    const initial = createInitialSceneState(scene);
    const speak = resolveSceneDecision(
      { scene, sceneState: initial },
      {
        action: "speak",
        speakerId: "ada",
        beat: "Ada answers.",
        ambience: "tense-room",
        beatLabel: "Ada takes focus",
      },
    );

    expect(speak.degraded).toBe(false);
    expect(speak.speakerSlug).toBe("ada");
    expect(speak.events[0].type).toBe("scene.decision.speak");
    expect(speak.events[0].payload).toMatchObject({
      action: "speak",
      speakerSlug: "ada",
    });
    expect(speak.sceneState).toMatchObject({
      beat: "Ada takes focus",
      ambience: "tense-room",
      lastSpeakerSlug: "ada",
      turnIndex: 1,
    });

    const wait = resolveSceneDecision(
      { scene, sceneState: speak.sceneState },
      { action: "wait-for-user" },
    );
    expect(wait.events[0].type).toBe("scene.decision.wait");
    expect(wait.sceneState.turnIndex).toBe(2);

    const narrate = resolveSceneDecision(
      { scene, sceneState: wait.sceneState },
      { action: "narrate", narration: "The light shifts.", narrationKind: null },
    );
    expect(narrate.degraded).toBe(false);
    expect(narrate.decision.narrationKind).toBeUndefined();
    expect(narrate.events[0].type).toBe("scene.decision.narrate");

    const end = resolveSceneDecision(
      { scene, sceneState: narrate.sceneState },
      { action: "end-scene" },
    );
    expect(end.events[0].type).toBe("scene.decision.end");
    expect(end.sceneState.turnIndex).toBe(4);
  });

  it("logs issued directions into recentBeats, newest last, capped at 8", () => {
    let state = createInitialSceneState(scene);
    for (let i = 1; i <= 10; i += 1) {
      state = resolveSceneDecision(
        { scene, sceneState: state },
        { action: "speak", speakerId: "ada", beat: `Direction ${i}.` },
      ).sceneState;
    }
    expect(state.recentBeats).toEqual([
      "Direction 3.",
      "Direction 4.",
      "Direction 5.",
      "Direction 6.",
      "Direction 7.",
      "Direction 8.",
      "Direction 9.",
      "Direction 10.",
    ]);

    // Non-speak decisions leave the log untouched.
    const wait = resolveSceneDecision(
      { scene, sceneState: state },
      { action: "wait-for-user" },
    );
    expect(wait.sceneState.recentBeats).toEqual(state.recentBeats);
  });

  it("falls back safely on unknown speaker", () => {
    const result = resolveSceneDecision(
      { scene, sceneState: createInitialSceneState(scene) },
      { action: "speak", speakerId: "nobody" },
    );

    expect(result.degraded).toBe(true);
    expect(result.reason).toBe("unknown-speaker:nobody");
    expect(result.decision.action).toBe("wait-for-user");
    expect(result.events[0].payload).toMatchObject({
      degraded: true,
      reason: "unknown-speaker:nobody",
    });
  });

  it("renders the audio roster in the director prompt (and omits it for legacy scenes)", () => {
    const request = buildSceneDecisionRequest({
      scene: sceneWithSounds,
      sceneState: createInitialSceneState(sceneWithSounds),
    });
    const system = request.messages[0].content;
    expect(system).toContain("Sounds available (cue by id):");
    expect(system).toContain('id="room-tone"');
    expect(system).toContain('id="glass-shatter"');
    expect(system).toContain("(cue: when something breaks)");
    expect(system).toContain("`ambience` must be one of the bed ids above");

    const legacy = buildSceneDecisionRequest({
      scene,
      sceneState: createInitialSceneState(scene),
    });
    expect(legacy.messages[0].content).not.toContain("Sounds available");
  });

  it("keeps the current bed when the director cues a non-roster ambience", () => {
    const initial = createInitialSceneState(sceneWithSounds);
    const result = resolveSceneDecision(
      { scene: sceneWithSounds, sceneState: initial },
      { action: "speak", speakerId: "ada", beat: "Ada answers.", ambience: "hallucinated-bed" },
    );

    expect(result.degraded).toBe(false); // the turn itself still lands
    expect(result.sceneState.ambience).toBe("room-tone"); // unchanged
    expect(result.reason).toBe("ambience-not-in-roster:hallucinated-bed");

    // `ambience: null` means "no change", NOT silence — the strict JSON
    // schema forces the model to emit null for every unused field, so
    // nulls are stripped before parsing (stripNullOptionalDecisionFields).
    const noChange = resolveSceneDecision(
      { scene: sceneWithSounds, sceneState: initial },
      { action: "wait-for-user", ambience: null },
    );
    expect(noChange.sceneState.ambience).toBe("room-tone");
    expect(noChange.reason).toBeUndefined();
  });

  it("filters sfx cues to roster one-shots", () => {
    const initial = createInitialSceneState(sceneWithSounds);
    const result = resolveSceneDecision(
      { scene: sceneWithSounds, sceneState: initial },
      {
        action: "speak",
        speakerId: "ada",
        beat: "Ada reacts to the crash.",
        sfx: [
          { id: "glass-shatter", at: "now" },
          { id: "not-a-sound", at: "with-speaker" },
          { id: "room-tone", at: "now" }, // a bed is not cueable as sfx
        ],
      },
    );

    expect(result.decision.sfx).toEqual([{ id: "glass-shatter", at: "now" }]);
    expect(result.reason).toBe("sfx-not-in-roster:not-a-sound,room-tone");
    // The sanitized decision is what lands in the persisted event too.
    expect(
      (result.events[0].payload as { decision: { sfx: unknown } }).decision.sfx,
    ).toEqual([{ id: "glass-shatter", at: "now" }]);
  });

  it("passes audio cues through untouched for legacy scenes without a roster", () => {
    const initial = createInitialSceneState(scene);
    const result = resolveSceneDecision(
      { scene, sceneState: initial },
      {
        action: "speak",
        speakerId: "ada",
        ambience: "free-string-bed",
        sfx: [{ id: "anything", at: "now" }],
      },
    );
    expect(result.sceneState.ambience).toBe("free-string-bed");
    expect(result.decision.sfx).toEqual([{ id: "anything", at: "now" }]);
    expect(result.reason).toBeUndefined();
  });

  it("renders authored intention in the director prompt (and omits it for plain scenes)", () => {
    const request = buildSceneDecisionRequest({
      scene: sceneWithIntent,
      sceneState: createInitialSceneState(sceneWithIntent),
    });
    const system = request.messages[0].content;
    expect(system).toContain("This scene is driving toward: Ada admits what the machine really measured.");
    expect(system).toContain("wants: protect the lab's secret while learning what the user knows");
    expect(system).toContain("role: reluctant witness");
    expect(system).toContain("baseline: guarded");
    expect(system).toContain("will: deflect with a question (when the machine is mentioned)");
    expect(system).toContain("Write `beat`s in service of what the speaker WANTS");
    expect(system).toContain("Write every `beat` as a SECOND-PERSON direction");
    expect(system).toContain("never third-person prose about them");
    expect(system).toContain("Press actively");

    const plain = buildSceneDecisionRequest({
      scene,
      sceneState: createInitialSceneState(scene),
    });
    const plainSystem = plain.messages[0].content;
    expect(plainSystem).not.toContain("driving toward");
    expect(plainSystem).not.toContain("wants:");
    expect(plainSystem).not.toContain("Press actively");
    expect(plainSystem).not.toContain("Follow the user's lead");
  });

  it("threads the speaker's agenda into the turn directive", () => {
    const state = createInitialSceneState(sceneWithIntent);
    const request = buildSpeakerTurnRequest({
      scene: sceneWithIntent,
      sceneState: state,
      decision: { action: "speak", speakerId: "ada", beat: "Deflect, then probe." },
      recentTurns: [{ speakerSlug: "user", text: "What did the machine measure?" }],
    });
    expect(request?.promptChunk).toBe(
      [
        "Direction: Deflect, then probe.",
        "Match your reply's shape to the direction - if it says to pause, land,",
        "concede, or act, end there; do not tack a question onto the end.",
        "Also in this scene: Turing. In the conversation,",
        'a line starting with a name ("Turing: ...") is that person',
        "speaking; unmarked lines are the visitor you are all speaking with. Speak",
        "only as yourself - never write the others' lines.",
        "A line in [brackets] is something HAPPENING around you - the world",
        "itself, not anyone speaking. React to it as an event; never answer it",
        'as if it were words. In bracketed lines, "you"/"your" refers to THE',
        "VISITOR - the narration speaks to them, not to you. If a bracketed",
        "line says the visitor did something, the visitor did it - attribute",
        "the act to them, not to anyone else present.",
        "Your agenda in this scene: protect the lab's secret while learning what the user knows",
        "When the machine is mentioned: deflect with a question",
      ].join("\n"),
    );

    // No authored intention → directive is direction + shape rule + the
    // multi-party attribution convention (this scene has two characters).
    const plainRequest = buildSpeakerTurnRequest({
      scene,
      sceneState: createInitialSceneState(scene),
      decision: { action: "speak", speakerId: "ada", beat: "Answer plainly." },
      recentTurns: [{ speakerSlug: "user", text: "Hello?" }],
    });
    expect(plainRequest?.promptChunk).toBe(
      [
        "Direction: Answer plainly.",
        "Match your reply's shape to the direction - if it says to pause, land,",
        "concede, or act, end there; do not tack a question onto the end.",
        "Also in this scene: Turing. In the conversation,",
        'a line starting with a name ("Turing: ...") is that person',
        "speaking; unmarked lines are the visitor you are all speaking with. Speak",
        "only as yourself - never write the others' lines.",
        "A line in [brackets] is something HAPPENING around you - the world",
        "itself, not anyone speaking. React to it as an event; never answer it",
        'as if it were words. In bracketed lines, "you"/"your" refers to THE',
        "VISITOR - the narration speaks to them, not to you. If a bracketed",
        "line says the visitor did something, the visitor did it - attribute",
        "the act to them, not to anyone else present.",
      ].join("\n"),
    );
  });

  it("renders the director's note when present and carries it through decisions", () => {
    const state = { ...createInitialSceneState(scene), directorNote: "Press Ada now." };
    const request = buildSceneDecisionRequest({ scene, sceneState: state });
    expect(request.messages[0].content).toContain(
      "Director's note (your own earlier reflection): Press Ada now.",
    );

    // Absent → no line.
    const plain = buildSceneDecisionRequest({
      scene,
      sceneState: createInitialSceneState(scene),
    });
    expect(plain.messages[0].content).not.toContain("Director's note");

    // The note survives decision application (spread carry-forward).
    const resolution = resolveSceneDecision(
      { scene, sceneState: state },
      { action: "speak", speakerId: "ada", beat: "Answer." },
    );
    expect(resolution.sceneState.directorNote).toBe("Press Ada now.");
  });

  it("renders the scene arc with progress markers in the director prompt", () => {
    const arcScene: Scene = {
      ...scene,
      arc: [
        { label: "First beat", summary: "how it lands" },
        { label: "Second beat" },
        { label: "Third beat" },
      ],
    };
    const state = { ...createInitialSceneState(arcScene), arcLanded: ["First beat"] };
    const system = buildSceneDecisionRequest({ scene: arcScene, sceneState: state })
      .messages[0].content;
    expect(system).toContain("Scene arc (authored beats, in order):");
    expect(system).toContain("[landed] First beat - how it lands");
    expect(system).toContain("[next]   Second beat");
    expect(system).toContain("[ahead]  Third beat");
    expect(system).toContain("Steer toward the [next] arc beat");

    // Arc-less scenes render the exact prior prompt.
    const plain = buildSceneDecisionRequest({
      scene,
      sceneState: createInitialSceneState(scene),
    }).messages[0].content;
    expect(plain).not.toContain("Scene arc");
    expect(plain).not.toContain("Steer toward");
  });

  it("builds a speaker turn request", () => {
    const state = createInitialSceneState(scene);
    const request = buildSpeakerTurnRequest({
      scene,
      sceneState: state,
      decision: {
        action: "speak",
        speakerId: "ada",
        beat: "Ada responds to the visitor.",
        sceneCue: "Keep it quiet.",
      },
      recentTurns: [
        { speakerSlug: "user", text: "What happened here?" },
        { speakerSlug: "turing", speakerName: "Turing", text: "Ask Ada." },
      ],
    });

    expect(request).toEqual({
      characterSlug: "ada",
      speakerName: "Ada",
      // Another character's line is name-prefixed so Ada can tell Turing's
      // words from the real user's (both arrive as role "user").
      message: "Turing: Ask Ada.",
      // History excludes the turn lifted into `message` ("Ask Ada.") so it isn't fed
      // twice (here AND as the appended user message downstream).
      history: [{ role: "user", content: "What happened here?" }],
      // Director `beat` framed as "Direction:"; the attribution convention is
      // declared before the optional scene note.
      promptChunk: [
        "Direction: Ada responds to the visitor.",
        "Match your reply's shape to the direction - if it says to pause, land,",
        "concede, or act, end there; do not tack a question onto the end.",
        "Also in this scene: Turing. In the conversation,",
        'a line starting with a name ("Turing: ...") is that person',
        "speaking; unmarked lines are the visitor you are all speaking with. Speak",
        "only as yourself - never write the others' lines.",
        "A line in [brackets] is something HAPPENING around you - the world",
        "itself, not anyone speaking. React to it as an event; never answer it",
        'as if it were words. In bracketed lines, "you"/"your" refers to THE',
        "VISITOR - the narration speaks to them, not to you. If a bracketed",
        "line says the visitor did something, the visitor did it - attribute",
        "the act to them, not to anyone else present.",
        "Scene note: Keep it quiet.",
      ].join("\n"),
      voiceSlug: "ada-voice",
    });
  });

  it("does not build a speaker turn for absent scene characters", () => {
    const state = {
      ...createInitialSceneState(scene),
      presentCharacterSlugs: ["turing"],
    };

    expect(
      buildSpeakerTurnRequest({
        scene,
        sceneState: state,
        decision: {
          action: "speak",
          speakerId: "ada",
          beat: "Ada tries to speak from outside the room.",
        },
        recentTurns: [],
      }),
    ).toBeNull();
  });

  it("keeps the Abraham's Tent orchestrator prompt stable", () => {
    const abrahamsTent = getScene("abrahams-tent");
    expect(abrahamsTent).not.toBeNull();
    if (!abrahamsTent) return;

    const request = buildSceneDecisionRequest({
      scene: abrahamsTent,
      sceneState: createInitialSceneState(abrahamsTent),
      recentTurns: [
        {
          speakerSlug: "user",
          speakerName: "Traveler",
          text: "Sarah, why did you laugh?",
        },
      ],
      lastUserMessage: "Sarah, why did you laugh?",
    });

    expect(request.messages).toMatchSnapshot("abrahams-tent-orchestrator-prompt");
  });
});

describe("narrator — game-master surface", () => {
  it("renders narrator turns as bracketed stage directions in speaker context", () => {
    const request = buildSpeakerTurnRequest({
      scene,
      sceneState: createInitialSceneState(scene),
      decision: { action: "speak", speakerId: "ada", beat: "React to the crash" },
      recentTurns: [
        { speakerSlug: "user", text: "I knock the engine model off the table." },
        { speakerSlug: "narrator", speakerName: "Narrator", text: "Brass gears scatter across the floor." },
      ],
    });
    expect(request?.message).toBe("[Brass gears scatter across the floor.]");
    expect(request?.promptChunk).toContain("A line in [brackets] is something HAPPENING");
  });

  it("flags a narrator-addressed message for a narrate decision", () => {
    const request = buildSceneDecisionRequest({
      scene,
      sceneState: createInitialSceneState(scene),
      recentTurns: [{ speakerSlug: "user", text: "earlier" }],
      lastUserMessage: "Narrator, what do I see in this room?",
    });
    expect(request.messages[1]!.content).toContain("addressing the NARRATOR");
  });

  it("renders the narrator block per mode — and forbids narration when off", () => {
    const base = createInitialSceneState(scene);
    const system = (s: typeof scene) =>
      buildSceneDecisionRequest({ scene: s, sceneState: { ...base, sceneId: s.id }, recentTurns: [] })
        .messages[0]!.content;
    expect(system(scene)).toContain("THE NARRATOR"); // default = minimal
    expect(system(scene)).toContain("Keep the narrator minimal");
    expect(system({ ...scene, narrator: "scenic" })).toContain("SCENIC narrator");
    const off = system({ ...scene, narrator: "off" });
    expect(off).not.toContain("THE NARRATOR");
    expect(off).toContain("without a narrator");
  });
});

describe("scene experience dials", () => {
  const systemFor = (configured: Scene) =>
    buildSceneDecisionRequest({
      scene: configured,
      sceneState: createInitialSceneState(configured),
      recentTurns: [],
    }).messages[0]!.content;

  it("keeps legacy defaults and adds no initiative copy", () => {
    expect(initiativeMode(scene)).toBe("user");
    expect(userRoleFor(scene)).toBe("visitor");
    expect(userDirectorEnabled(scene)).toBe(true);
    expect(systemFor(scene)).not.toContain("The world drives this scene");
    expect(systemFor(scene)).not.toContain("THE VISITOR PLAYS A ROLE");
    expect(systemFor(scene)).not.toContain("does NOT hold director powers");
  });

  it("renders narrator initiative, visitor role, and disabled director powers", () => {
    const configured: Scene = {
      ...scene,
      initiative: "narrator",
      userRole: "character",
      userCharacter: {
        name: "Miriam",
        blurb: "A royal archivist carrying a sealed decree.",
        relationship: "Ada's former patron",
      },
      userDirector: false,
    };
    const system = systemFor(configured);
    expect(system).toContain("The world drives this scene");
    expect(system).toContain("THE VISITOR PLAYS A ROLE");
    expect(system).toContain("they are Miriam — A royal archivist");
    expect(system).toContain("Ada's former patron");
    expect(system).toContain("does NOT hold director powers");
  });

  it("allows rising-tension momentum under shared initiative", () => {
    expect(systemFor({ ...scene, initiative: "shared" })).toContain(
      "may carry rising tension",
    );
  });

  // Momentum is the only mechanism that grants a beat WITHOUT waiting for
  // silence, so the crisis-only clause decides whether an initiative dial can
  // drive at all. It once keyed on `=== "shared"`, which handed `narrator` the
  // restrictive text meant for `user` — the strongest dial behaving as the
  // weakest, measured at a 0% rate of taking another beat on rising tension.
  const CRISIS_ONLY = "CRISIS, never conversation";

  it("restricts momentum to crisis only when the user holds initiative", () => {
    expect(initiativeMode(scene)).toBe("user");
    expect(systemFor(scene)).toContain(CRISIS_ONLY);
  });

  it("does not restrict momentum to crisis under shared or narrator initiative", () => {
    // narrator is the regression: it is told "the world drives this scene",
    // so telling it momentum is crisis-only contradicts that in the same breath.
    expect(systemFor({ ...scene, initiative: "narrator" })).not.toContain(CRISIS_ONLY);
    expect(systemFor({ ...scene, initiative: "shared" })).not.toContain(CRISIS_ONLY);
  });

  it("still tells every mode to yield the floor to an engaged visitor", () => {
    for (const initiative of ["user", "shared", "narrator"] as const) {
      const system = systemFor({ ...scene, initiative });
      expect(system).toMatch(/leave it null|yields the floor to the visitor/);
    }
  });

  it("names the played role in reactive speaker attribution", () => {
    const roleScene: Scene = {
      ...scene,
      userRole: "character",
      userCharacter: { name: "Miriam", blurb: "A royal archivist." },
    };
    const request = buildSpeakerTurnRequest({
      scene: roleScene,
      sceneState: createInitialSceneState(roleScene),
      decision: { action: "speak", speakerId: "ada", beat: "Challenge her claim." },
      recentTurns: [{ speakerSlug: "user", text: "The decree bears the royal seal." }],
    });
    expect(request?.promptChunk).toContain(
      "unmarked lines are Miriam, the role the visitor plays",
    );
    expect(request?.promptChunk).toContain('"you"/"your" refers to Miriam');
    expect(request?.promptChunk).toContain("Miriam did something, Miriam did it");
  });
});

describe("declaresUserAction", () => {
  it("recognizes a declared action, with or without the narrator vocative", () => {
    expect(declaresUserAction("I punch Abraham in the face")).toBe(true);
    expect(declaresUserAction("Narrator, I take Sarah hostage.")).toBe(true);
    expect(declaresUserAction("narrator: I hand her the waterskin")).toBe(true);
    expect(declaresUserAction("I'm drawing my knife")).toBe(true);
  });

  it("does not mistake speech or questions for action", () => {
    // These are the narrator-question case, which is complete once answered.
    expect(declaresUserAction("Narrator, what do I see around the camp?")).toBe(false);
    expect(declaresUserAction("What does this place smell like?")).toBe(false);
    expect(declaresUserAction("I think you are lying")).toBe(false);
    expect(declaresUserAction("I want to know what the strangers said")).toBe(false);
    expect(declaresUserAction("Sarah, did you laugh?")).toBe(false);
  });
});

describe("isNarratorEventDeclaration", () => {
  it("recognizes narrator-addressed statements as declarations", () => {
    expect(
      isNarratorEventDeclaration(
        "Narrator, as I speak, Abraham sees a vision of a spirit within me.",
      ),
    ).toBe(true);
    expect(isNarratorEventDeclaration("Narrator, Sarah falls to the ground.")).toBe(true);
    expect(isNarratorEventDeclaration("narrator: a storm rolls in over the hills")).toBe(true);
    // First-person declarations through the narrator are declarations too.
    expect(isNarratorEventDeclaration("Narrator, I take Sarah hostage.")).toBe(true);
  });

  it("excludes questions, with or without the question mark", () => {
    expect(isNarratorEventDeclaration("Narrator, what do I see around the camp?")).toBe(false);
    expect(isNarratorEventDeclaration("Narrator, what does Abraham look like")).toBe(false);
    expect(isNarratorEventDeclaration("Narrator, is anyone else nearby?")).toBe(false);
    expect(isNarratorEventDeclaration("Narrator, describe the tent")).toBe(false);
    expect(isNarratorEventDeclaration("Narrator, tell me what Sarah is doing")).toBe(false);
  });

  it("is false for messages that do not address the narrator", () => {
    expect(isNarratorEventDeclaration("Abraham sees a vision of a spirit.")).toBe(false);
    expect(isNarratorEventDeclaration("I punch Abraham in the face")).toBe(false);
  });
});

describe("stakes rule", () => {
  it("tells the director that danger outranks whose turn it is", () => {
    const prompt = buildSceneDecisionRequest({
      scene,
      sceneState: createInitialSceneState(scene),
      recentTurns: [{ speakerSlug: "user", text: "hello" }],
    }).messages[0]!.content;
    expect(prompt).toContain("STAKES OVERRIDE ADDRESSING");
    expect(prompt).toContain("does not wait his turn");
  });
});

describe("addressee hint — vocative vs mention", () => {
  const request = (lastUserMessage: string) =>
    buildSceneDecisionRequest({
      scene,
      sceneState: { ...createInitialSceneState(scene), lastSpeakerSlug: "turing" },
      recentTurns: [{ speakerSlug: "user", text: "earlier" }],
      lastUserMessage,
    }).messages[1]!.content;

  it("reads a trailing name as a vocative even without the comma (STT)", () => {
    const prompt = request("And do you believe what the machine showed Ada?");
    expect(prompt).toContain("turns TO Ada");
    expect(prompt).not.toContain("mid-sentence");
  });

  it("reads a leading or you-preceded name as a vocative", () => {
    expect(request("Ada - was it you at the machine?")).toContain("turns TO Ada");
    expect(request("and you Ada what did you see")).toContain("turns TO Ada");
  });

  it("reads an embedded name as a mention that must not steal the turn", () => {
    const prompt = request("What Ada told the committee - do you believe it?");
    expect(prompt).toContain("Ada is named mid-sentence");
    expect(prompt).not.toContain("turns TO Ada");
  });

  it("emits no hint when nobody present is named", () => {
    const prompt = request("What happens next in this room?");
    expect(prompt).not.toContain("turns TO");
    expect(prompt).not.toContain("mid-sentence");
  });
});

describe("opening narration", () => {
  const base = { ...scene, openingNarration: undefined, openingMode: undefined };

  it("defaults to authored when a line exists, off when none does", () => {
    expect(openingMode({ ...base, openingNarration: "Evening settles." })).toBe("authored");
    expect(openingMode(base)).toBe("off");
  });

  it("respects an explicit mode, and never opens when the narrator is off", () => {
    expect(openingMode({ ...base, openingMode: "generated" })).toBe("generated");
    expect(openingMode({ ...base, openingNarration: "x", openingMode: "off" })).toBe("off");
    expect(
      openingMode({ ...base, openingNarration: "x", openingMode: "generated", narrator: "off" }),
    ).toBe("off");
  });

  it("picks among authored variants by the caller's roll", () => {
    const withVariants = {
      ...base,
      openingNarration: "First.",
      openingNarrationVariants: ["Second.", "Third."],
    };
    expect(selectAuthoredOpening(withVariants, 0)).toBe("First.");
    expect(selectAuthoredOpening(withVariants, 0.5)).toBe("Second.");
    expect(selectAuthoredOpening(withVariants, 0.99)).toBe("Third.");
    expect(selectAuthoredOpening(base, 0.5)).toBeNull();
  });

  it("fences the generated opening off from arc beats it must not spend", () => {
    const arcScene = {
      ...base,
      arc: [{ label: "The laugh is named" }, { label: "The denial breaks" }],
    };
    const { system, user } = buildOpeningNarrationMessages(arcScene);
    expect(system).toContain("have NOT happened yet");
    expect(system).toContain("NO dialogue");
    expect(user).toContain("The laugh is named");
    // Arc-less scenes carry no fence (nothing to protect).
    expect(buildOpeningNarrationMessages(base).system).not.toContain("have NOT happened yet");
  });

  it("sanitizes a generated opening into speakable prose", () => {
    expect(sanitizeOpeningNarration('```\n"Evening settles."\n```')).toBe("Evening settles.");
    expect(sanitizeOpeningNarration("Narration: The fire ticks.")).toBe("The fire ticks.");
    expect(sanitizeOpeningNarration("[The tent flap stirs.]")).toBe("The tent flap stirs.");
    expect(sanitizeOpeningNarration("   ")).toBeNull();
    expect(sanitizeOpeningNarration("a".repeat(900))!.length).toBeLessThanOrEqual(600);
  });
});

describe("scene facts (durable memory)", () => {
  it("merges, dedupes case-insensitively, and caps the facts store", () => {
    const merged = updateSceneFacts({
      previousFacts: ["Sarah admitted she laughed.", "  Eliezer   watched the road. "],
      newFacts: ["sarah ADMITTED she laughed.", "Abraham named the child Isaac."],
    });
    expect(merged).toEqual([
      "Sarah admitted she laughed.",
      "Eliezer watched the road.",
      "Abraham named the child Isaac.",
    ]);

    const capped = updateSceneFacts({
      previousFacts: Array.from({ length: 5 }, (_, i) => `Fact number ${i}.`),
      newFacts: ["The newest fact."],
      maxEntries: 3,
    });
    expect(capped).toEqual(["Fact number 3.", "Fact number 4.", "The newest fact."]);
  });

  it("round-trips facts through the session snapshot", () => {
    const state = createInitialSceneState(scene);
    const snapshot = buildSceneSessionSnapshot(state, {
      sceneMemory: ["Ada: I saw it."],
      sceneFacts: ["Ada saw the machine run."],
    });
    expect(readSceneFactsFromSnapshot(snapshot, scene.id)).toEqual([
      "Ada saw the machine run.",
    ]);
    // Wrong scene / legacy snapshots (no facts field) read as empty.
    expect(readSceneFactsFromSnapshot(snapshot, "other-scene")).toEqual([]);
    expect(
      readSceneFactsFromSnapshot(buildSceneSessionSnapshot(state, {}), scene.id),
    ).toEqual([]);
  });

  it("renders the facts block in the director prompt, before scene memory", () => {
    const request = buildSceneDecisionRequest({
      scene,
      sceneState: createInitialSceneState(scene),
      recentTurns: [{ speakerSlug: "user", text: "Hello?" }],
      sceneMemory: ["Ada: An old line."],
      sceneFacts: ["Ada saw the machine run."],
      lastUserMessage: "Hello?",
    });
    const system = request.messages[0]!.content;
    expect(system).toContain("Established in this scene (durable facts");
    expect(system).toContain("- Ada saw the machine run.");
    expect(system.indexOf("Established in this scene")).toBeLessThan(
      system.indexOf("Scene memory"),
    );
    expect(request.trace.sceneFactCount).toBe(1);
  });

  it("omits memory entries that duplicate the recent dialogue block", () => {
    const turns = [
      { speakerSlug: "ada", speakerName: "Ada", text: "The machine ran twice." },
      { speakerSlug: "user", text: "Twice, you say?" },
    ];
    // Production fold: memory holds the same newest turns the dialogue shows.
    const memory = updateSceneMemory({ previousMemory: ["Ada: An older line."], recentTurns: turns });
    const request = buildSceneDecisionRequest({
      scene,
      sceneState: createInitialSceneState(scene),
      recentTurns: turns,
      sceneMemory: memory,
      lastUserMessage: "Twice, you say?",
    });
    const system = request.messages[0]!.content;
    expect(system).toContain("- Ada: An older line.");
    expect(system).not.toContain("- Ada: The machine ran twice.");
    expect(request.messages[1]!.content).toContain("Ada: The machine ran twice.");
  });
});

describe("character presence", () => {
  const base = () => createInitialSceneState(scene);

  it("retires a character and stops them being eligible to speak", () => {
    const after = resolveSceneDecision(
      { scene, sceneState: base() },
      { action: "narrate", narration: "She falls still.", exitSlug: "ada" },
    );
    expect(after.sceneState.presentCharacterSlugs).not.toContain("ada");
    expect(after.reason).toContain("exit:ada");

    // The very next decision cannot choose her.
    const next = resolveSceneDecision(
      { scene, sceneState: after.sceneState },
      { action: "speak", speakerId: "ada", beat: "answer" },
    );
    expect(next.degraded).toBe(true);
    expect(next.speakerSlug).not.toBe("ada");
  });

  it("lets a departing character speak their leave-taking, then retires them", () => {
    // Stage semantics: a dismissed character says goodbye ON the exit
    // decision; every LATER decision excludes them (next test).
    const res = resolveSceneDecision(
      { scene, sceneState: base() },
      { action: "speak", speakerId: "ada", beat: "a short goodbye", exitSlug: "ada" },
    );
    expect(res.degraded).toBe(false);
    expect(res.speakerSlug).toBe("ada");
    expect(res.sceneState.presentCharacterSlugs).not.toContain("ada");
    // Continuity must not point at the departed.
    expect(res.sceneState.lastSpeakerSlug).toBeNull();
  });

  it("still blocks speaking for a character who is already absent", () => {
    const state = { ...base(), presentCharacterSlugs: ["turing"] };
    const res = resolveSceneDecision(
      { scene, sceneState: state },
      { action: "speak", speakerId: "ada", beat: "from beyond", exitSlug: "ada" },
    );
    expect(res.degraded).toBe(true);
    expect(res.speakerSlug).not.toBe("ada");
  });

  it("clears addressee continuity when the last speaker leaves", () => {
    const state = { ...base(), lastSpeakerSlug: "ada" };
    const res = resolveSceneDecision(
      { scene, sceneState: state },
      { action: "narrate", narration: "She slips away into the dark.", exitSlug: "ada" },
    );
    expect(res.sceneState.lastSpeakerSlug).toBeNull();
  });

  it("brings a character back with enterSlug", () => {
    const gone = resolveSceneDecision(
      { scene, sceneState: base() },
      { action: "narrate", narration: "She steps out.", exitSlug: "ada" },
    ).sceneState;
    const back = resolveSceneDecision(
      { scene, sceneState: gone },
      { action: "narrate", narration: "She returns.", enterSlug: "ada" },
    );
    expect(back.sceneState.presentCharacterSlugs).toContain("ada");
  });

  it("never empties the stage — the last one present cannot leave", () => {
    const solo = { ...base(), presentCharacterSlugs: ["turing"] };
    const res = resolveSceneDecision(
      { scene, sceneState: solo },
      { action: "narrate", narration: "He walks off.", exitSlug: "turing" },
    );
    expect(res.sceneState.presentCharacterSlugs).toEqual(["turing"]);
    expect(res.reason).toContain("exit-refused-last-present");
  });

  it("ignores slugs that aren't on the roster", () => {
    const res = resolveSceneDecision(
      { scene, sceneState: base() },
      { action: "narrate", narration: "Someone leaves.", exitSlug: "nobody" },
    );
    expect(res.sceneState.presentCharacterSlugs).toEqual(
      base().presentCharacterSlugs,
    );
    expect(res.reason).toContain("exit-not-in-roster:nobody");
  });

  it("lists absent characters for the director, so they can return", () => {
    const gone = resolveSceneDecision(
      { scene, sceneState: base() },
      { action: "narrate", narration: "She steps out.", exitSlug: "ada" },
    ).sceneState;
    const prompt = buildSceneDecisionRequest({ scene, sceneState: gone })
      .messages[0]!.content;
    expect(prompt).toContain("No longer in the scene");
    expect(prompt).toContain("ada");
  });
});


describe("the chronicle", () => {
  const CHRONICLE = {
    story: "The traveler arrived at dusk and asked after the promise.",
    threads: ["The promise is unanswered."],
    world: ["Dusk; the fire is low."],
    intents: [{ trigger: "the fire is mentioned", direction: "A log collapses in sparks." }],
    timed: [{ afterSeconds: 40, direction: "The evening wind rises under the oaks." }],
    drafts: ["The fire settles; somewhere beyond the oaks a night bird calls once."],
  };

  it("sanitizes caps and drops malformed intents; empty input is null", () => {
    expect(sanitizeChronicle(null)).toBeNull();
    expect(sanitizeChronicle({ story: "", threads: [], world: [], intents: [] })).toBeNull();
    const dirty = sanitizeChronicle({
      story: "x".repeat(700),
      threads: Array.from({ length: 9 }, (_, i) => `t${i}`),
      world: [42, "  real  "],
      intents: [{ trigger: "ok", direction: "fine" }, { trigger: "", direction: "no" }],
      timed: [
        { afterSeconds: 3, direction: "too soon - clamped up" },
        { afterSeconds: 10_000, direction: "too late - clamped down" },
        { afterSeconds: 40, direction: "dropped - over the limit" },
      ],
    });
    expect(dirty?.story.length).toBe(600);
    expect(dirty?.threads).toHaveLength(5);
    expect(dirty?.world).toEqual(["real"]);
    expect(dirty?.intents).toEqual([{ trigger: "ok", direction: "fine" }]);
    expect(dirty?.timed).toEqual([
      { afterSeconds: 15, direction: "too soon - clamped up" },
      { afterSeconds: 600, direction: "too late - clamped down" },
    ]);
    expect(dirty?.drafts).toEqual([]);
  });

  it("mergeChronicle replaces restated sections and keeps omitted ones", () => {
    const next = { story: "", threads: ["A new thread."], world: [], intents: [], timed: [], drafts: [] };
    expect(mergeChronicle(CHRONICLE, next)).toEqual({
      story: CHRONICLE.story,
      threads: ["A new thread."],
      world: CHRONICLE.world,
      intents: CHRONICLE.intents,
      timed: CHRONICLE.timed,
      drafts: CHRONICLE.drafts,
    });
    expect(mergeChronicle(null, CHRONICLE)).toEqual(CHRONICLE);
    expect(mergeChronicle(CHRONICLE, null)).toEqual(CHRONICLE);
  });

  it("round-trips through the session snapshot", () => {
    const state = createInitialSceneState(scene);
    const snapshot = buildSceneSessionSnapshot(state, {
      updatedAt: "2026-07-31T00:00:00.000Z",
      chronicle: CHRONICLE,
    });
    expect(snapshot.chronicle).toEqual(CHRONICLE);
    expect(readSceneChronicleFromSnapshot(snapshot, scene.id)).toEqual(CHRONICLE);
    expect(readSceneChronicleFromSnapshot(snapshot, "other-scene")).toBeNull();
    const bare = buildSceneSessionSnapshot(state, { updatedAt: "2026-07-31T00:00:00.000Z" });
    expect(bare.chronicle).toBeUndefined();
    expect(readSceneChronicleFromSnapshot(bare, scene.id)).toBeNull();
  });

  it("renders into the director prompt when present, silently absent otherwise", () => {
    const state = createInitialSceneState(scene);
    const withChronicle = buildSceneDecisionRequest({
      scene,
      sceneState: state,
      chronicle: CHRONICLE,
    }).messages[0]!.content;
    expect(withChronicle).toContain("The chronicle - the story you are writing");
    expect(withChronicle).toContain("So far: The traveler arrived at dusk");
    expect(withChronicle).toContain("- The promise is unanswered.");
    expect(withChronicle).toContain("when the fire is mentioned: A log collapses in sparks.");
    expect(withChronicle).toContain("in ~40s: The evening wind rises under the oaks.");
    expect(withChronicle).toContain("Drafted narration (pre-written by your slower self)");
    expect(withChronicle).toContain("- The fire settles; somewhere beyond the oaks a night bird calls once.");
    // A due event renders as an imperative in the USER prompt.
    const withEvent = buildSceneDecisionRequest({
      scene,
      sceneState: state,
      chronicle: CHRONICLE,
      worldEventDirective: "The evening wind rises under the oaks.",
    }).messages[1]!.content;
    expect(withEvent).toContain("A WORLD EVENT the chronicler scheduled has come due");
    expect(withEvent).toContain("The evening wind rises under the oaks.");
    const without = buildSceneDecisionRequest({ scene, sceneState: state })
      .messages[0]!.content;
    expect(without).not.toContain("The chronicle");
  });
});


describe("dismissedPresentCharacters", () => {
  const present = scene.characters;

  it("detects a named dismissal", () => {
    expect(
      dismissedPresentCharacters("Ada, leave us. I wish to speak with Turing alone.", present).map(
        (c) => c.characterSlug,
      ),
    ).toEqual(["ada"]);
    expect(
      dismissedPresentCharacters("Go on then, Ada.", present).map((c) => c.characterSlug),
    ).toEqual(["ada"]);
    expect(
      dismissedPresentCharacters("Narrator, Ada withdraws and leaves us by the fire.", present).map(
        (c) => c.characterSlug,
      ),
    ).toEqual(["ada"]);
  });

  it("stays silent for ordinary mentions and unrelated 'leave' usage", () => {
    expect(dismissedPresentCharacters("Ada, what did the machine measure?", present)).toEqual([]);
    expect(dismissedPresentCharacters("Don't leave the lamp burning, Ada.", present)).toEqual([]);
    expect(dismissedPresentCharacters("leave us out of the ledger entirely", present)).toEqual([]);
  });
});
