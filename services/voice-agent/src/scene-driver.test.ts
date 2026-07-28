import { describe, expect, it, vi } from "vitest";
import type { CharacterRecord } from "@kawabunga/db";
import type {
  ChatProvider,
  ChatRequestOptions,
  ChatResponse,
} from "@kawabunga/engine";
import type {
  OrchestratorExecutorResolution,
  SceneDecisionRequest,
  SceneSessionSnapshot,
} from "@kawabunga/orchestration";
import type { OrchestratorDecision, Scene, SfxCue } from "@kawabunga/types";

// Kill the env-driven dramaturg BEFORE the driver module loads its flags —
// tests that want reflection inject a fake provider via deps instead.
vi.hoisted(() => {
  process.env.VOICE_AGENT_DRAMATURG = "0";
});

import { SceneDriver, type SceneSpeakInput } from "./scene-driver";

/* ── Fixtures ─────────────────────────────────────────────────────── */

const TENT: Scene = {
  id: "test-tent",
  title: "Test tent",
  description: "Two characters and a traveler.",
  characters: [
    { characterSlug: "abraham", displayName: "Abraham", voice: "abraham", blurb: "Old shepherd." },
    { characterSlug: "sarah", displayName: "Sarah", voice: "sarah", blurb: "Sharp-tongued." },
  ],
  openingBeat: "The traveler arrives.",
  defaultAmbience: null,
  sounds: [
    { slug: "tent-evening", name: "Tent evening", description: "wind", role: "bed", loopable: true },
    { slug: "fire-crackle", name: "Fire", description: "crackle", role: "oneshot", loopable: false },
  ],
};

const SOLO: Scene = {
  id: "test-solo",
  title: "Solo scene",
  description: "One character.",
  characters: [
    { characterSlug: "abraham", displayName: "Abraham", voice: "abraham", blurb: "Old shepherd." },
  ],
  openingBeat: "The traveler arrives.",
  defaultAmbience: null,
};

const ARC_SCENE: Scene = {
  ...TENT,
  id: "test-arc",
  arc: [
    { label: "Greeting", summary: "The traveler is welcomed." },
    { label: "The laugh", summary: "Sarah's laughter is named." },
  ],
};

function fakeCharacters(): (slugOrId: string) => Promise<CharacterRecord | null> {
  return async (slugOrId) =>
    ({ id: `id-${slugOrId}`, slug: slugOrId, title: slugOrId } as unknown as CharacterRecord);
}

/** Executor whose decisions come from a queue (last entry repeats). Records
 *  every SceneDecisionRequest it saw. */
function fakeExecutor(decisions: Array<OrchestratorDecision | Promise<OrchestratorDecision>>) {
  const requests: SceneDecisionRequest[] = [];
  let calls = 0;
  const resolve = (): OrchestratorExecutorResolution => ({
    executor: {
      provider: "cerebras",
      model: "fake",
      execute: async (request) => {
        requests.push(request);
        const next = decisions[Math.min(calls, decisions.length - 1)]!;
        calls += 1;
        return next;
      },
    },
  });
  return {
    resolveExecutor: resolve,
    requests,
    get calls() {
      return calls;
    },
  };
}

function fakeSpeak(replies: string[] | ((input: SceneSpeakInput) => string)) {
  const inputs: SceneSpeakInput[] = [];
  const speak = async (input: SceneSpeakInput): Promise<string> => {
    inputs.push(input);
    if (typeof replies === "function") return replies(input);
    return replies[Math.min(inputs.length - 1, replies.length - 1)] ?? "";
  };
  return { speak, inputs };
}

const speakDecision = (speakerId: string, beat?: string): OrchestratorDecision => ({
  action: "speak",
  speakerId,
  ...(beat ? { beat } : {}),
});

/** The director-facing dialogue block of the LAST captured request. */
function lastDialogue(requests: SceneDecisionRequest[]): string {
  return requests[requests.length - 1]!.messages[1]!.content;
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe("SceneDriver — speaker turns", () => {
  it("routes a speak decision to the chosen character and records the reply", async () => {
    const exec = fakeExecutor([speakDecision("sarah", "Deny the laugh"), speakDecision("abraham")]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak, inputs } = fakeSpeak(["I did not laugh."]);

    const outcome = await driver.drive("Sarah, did you laugh?", speak);
    expect(outcome).toEqual({ action: "speak", spoke: true });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.characterId).toBe("id-sarah");
    expect(inputs[0]!.speaker).toEqual({ slug: "sarah", name: "Sarah" });
    expect(inputs[0]!.message).toBe("Sarah, did you laugh?");
    expect(inputs[0]!.promptChunk).toContain("Direction: Deny the laugh");

    // The reply is in the transcript the NEXT decision sees.
    await driver.drive("And what do you say, Abraham?", speak);
    expect(lastDialogue(exec.requests)).toContain("Sarah: I did not laugh.");
  });

  it("recovers from an unknown speaker by letting the fallback character answer", async () => {
    const exec = fakeExecutor([speakDecision("melchizedek")]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak, inputs } = fakeSpeak(["I am here, friend."]);

    // Unknown speaker → degraded wait → recovery: the user spoke, so the
    // fallback (first present; no prior addressee) answers instead of silence.
    const outcome = await driver.drive("Hello?", speak);
    expect(outcome).toEqual({ action: "speak", spoke: true });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.characterId).toBe("id-abraham");
  });

  it("never records an empty reply turn", async () => {
    const exec = fakeExecutor([speakDecision("abraham"), speakDecision("abraham")]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak } = fakeSpeak([""]);

    const outcome = await driver.drive("Hello?", speak);
    expect(outcome).toEqual({ action: "speak", spoke: false });

    await driver.drive("Anyone there?", speak);
    expect(lastDialogue(exec.requests)).not.toContain("Abraham:");
  });

  it("emits roster-validated sfx cues before the speaker turn", async () => {
    const exec = fakeExecutor([
      {
        ...speakDecision("abraham"),
        sfx: [
          { id: "fire-crackle", at: "now" },
          { id: "hallucinated-horn", at: "now" },
        ],
      },
    ]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const cues: SfxCue[][] = [];
    driver.onSfx((c) => cues.push(c));
    const order: string[] = [];
    driver.onSfx((c) => {
      cues.push(c);
      order.push("sfx");
    });
    const { speak } = fakeSpeak(() => {
      order.push("speak");
      return "Welcome.";
    });

    await driver.drive("Hello?", speak);
    expect(cues[0]).toEqual([{ id: "fire-crackle", at: "now" }]);
    expect(order).toEqual(["sfx", "speak"]);
  });
});

describe("SceneDriver — narration", () => {
  it("voices a narration, then CHAINS one decision so a character reacts", async () => {
    const exec = fakeExecutor([
      { action: "narrate", narration: "The lamp tips; oil flares on the stones." },
      speakDecision("sarah", "React to the sudden fire"),
    ]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const narrated: string[] = [];
    driver.onNarrate(async (text) => {
      narrated.push(text);
    });
    const { speak, inputs } = fakeSpeak(["The rugs! Stamp it out!"]);

    const outcome = await driver.drive("I knock over the oil lamp.", speak);
    expect(outcome).toEqual({ action: "speak", spoke: true });
    expect(narrated).toEqual(["The lamp tips; oil flares on the stones."]);
    expect(exec.calls).toBe(2); // decision + one chained follow-up
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.characterId).toBe("id-sarah");
    // The speaker perceives the narration as a bracketed stage direction.
    expect(inputs[0]!.message).toBe("[The lamp tips; oil flares on the stones.]");

    await driver.drive("Is everyone alright?", speak);
    expect(lastDialogue(exec.requests)).toContain("Narrator: The lamp tips");
  });

  it("bounds the chain: a chained narrate is applied but never chains again", async () => {
    const exec = fakeExecutor([
      { action: "narrate", narration: "A wind rises." },
      { action: "narrate", narration: "The fire gutters out." },
    ]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const narrated: string[] = [];
    driver.onNarrate(async (text) => {
      narrated.push(text);
    });
    const { speak } = fakeSpeak([""]);

    const outcome = await driver.drive("I fling the tent flap open to the night.", speak);
    expect(outcome).toEqual({ action: "narrate", spoke: true });
    expect(narrated).toEqual(["A wind rises.", "The fire gutters out."]);
    expect(exec.calls).toBe(2); // never a third decision
  });

  it("does NOT chain when the narration answered a narrator-addressed question", async () => {
    const exec = fakeExecutor([
      { action: "narrate", narration: "Oaks, firelight, and a watching old man." },
    ]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    driver.onNarrate(async () => undefined);
    const { speak, inputs } = fakeSpeak(["unused"]);

    const outcome = await driver.drive("Narrator, what do I see?", speak);
    expect(outcome).toEqual({ action: "narrate", spoke: true });
    expect(exec.calls).toBe(1); // the answer is complete — no chained decision
    expect(inputs).toHaveLength(0);
  });

  it("never leaves dead air: a chained hold after an event becomes a reaction", async () => {
    // Observed live: the director answered the chain with wait-for-user after
    // narrating a punch, so the scene sat silent until the idle timer fired
    // 4.1s later. Something that just HAPPENED always gets a reaction.
    const exec = fakeExecutor([
      { action: "narrate", narration: "Dust rises on the Sodom road." },
      { action: "wait-for-user" },
    ]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    driver.onNarrate(async () => undefined);
    const { speak, inputs } = fakeSpeak(["I see it too."]);

    const outcome = await driver.drive("I point at the dust rising on the road.", speak);
    expect(outcome).toEqual({ action: "speak", spoke: true });
    expect(inputs).toHaveLength(1);
    // No prior addressee in this scene → the first present character reacts.
    expect(inputs[0]!.characterId).toBe("id-abraham");
  });

  it("frames the chain step as an event needing a reaction", async () => {
    const exec = fakeExecutor([
      { action: "narrate", narration: "The lamp gutters out." },
      speakDecision("sarah", "React to the dark"),
    ]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    driver.onNarrate(async () => undefined);
    const { speak } = fakeSpeak(["Who blew out the lamp?"]);

    await driver.drive("I pinch the wick.", speak);
    const chainPrompt = exec.requests[1]!.messages[1]!.content;
    expect(chainPrompt).toContain("something just HAPPENED");
    expect(chainPrompt).toContain("Do NOT `wait-for-user`");
  });

  it("records the utterance that triggered a narration", async () => {
    const exec = fakeExecutor([
      { action: "narrate", narration: "Your fist finds his jaw." },
      speakDecision("abraham", "Reel from the blow"),
    ]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const seen: Array<{ text: string; userText?: string }> = [];
    driver.onNarrate(async (text, meta) => {
      seen.push({ text, userText: meta.userText });
    });
    const { speak } = fakeSpeak(["My jaw!"]);

    await driver.drive("I punch Abraham in the face.", speak);
    expect(seen[0]).toEqual({
      text: "Your fist finds his jaw.",
      userText: "I punch Abraham in the face.",
    });
  });

  it("records but reports unvoiced narration when no sink is wired", async () => {
    const exec = fakeExecutor([{ action: "narrate", narration: "Dust settles." }]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak } = fakeSpeak([""]);

    // The queue repeats its last entry, so the chained decision narrates
    // again — bounded, both recorded, neither voiced.
    const outcome = await driver.drive("Hello?", speak);
    expect(outcome).toEqual({ action: "narrate", spoke: false });
  });

  it("records an externally voiced opening so the next decision sees it", async () => {
    const exec = fakeExecutor([speakDecision("abraham")]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    driver.recordNarration("Evening settles over the oaks.");
    const { speak } = fakeSpeak(["Welcome, traveler."]);

    await driver.drive("Peace to this camp.", speak);
    expect(lastDialogue(exec.requests)).toContain("Narrator: Evening settles over the oaks.");
  });
});

describe("SceneDriver — supersession", () => {
  it("a newer drive supersedes an in-flight one before its decision applies", async () => {
    let releaseFirst!: (d: OrchestratorDecision) => void;
    const first = new Promise<OrchestratorDecision>((r) => {
      releaseFirst = r;
    });
    const exec = fakeExecutor([first, speakDecision("sarah")]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const snapshots: SceneSessionSnapshot[] = [];
    driver.onState((s) => snapshots.push(s));
    const { speak, inputs } = fakeSpeak(["Only the second turn speaks."]);

    const drive1 = driver.drive("first attempt", speak);
    const drive2 = driver.drive("second attempt", speak);
    releaseFirst(speakDecision("abraham"));

    const [out1, out2] = await Promise.all([drive1, drive2]);
    expect(out1.superseded).toBe(true);
    expect(out1.spoke).toBe(false);
    expect(out2).toEqual({ action: "speak", spoke: true });
    // Only the second decision applied: one snapshot, one speak, turnIndex 1.
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.characterId).toBe("id-sarah");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.sceneState.turnIndex).toBe(1);
  });

  it("drops a barged-in partial reply instead of recording it out of order", async () => {
    const exec = fakeExecutor([speakDecision("abraham"), speakDecision("sarah")]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const abort = new AbortController();
    const { speak } = fakeSpeak(() => {
      abort.abort(); // the user barges in mid-speak
      return "a partial sent—";
    });

    const outcome = await driver.drive("Hello?", speak, { signal: abort.signal });
    expect(outcome.superseded).toBe(true);

    const { speak: speak2 } = fakeSpeak(["Fresh turn."]);
    await driver.drive("A new question.", speak2);
    expect(lastDialogue(exec.requests)).not.toContain("a partial sent");
  });
});

describe("SceneDriver — speculation", () => {
  it("accepts a speculation computed off ~the final transcript (no second orchestrate)", async () => {
    const exec = fakeExecutor([speakDecision("sarah")]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak } = fakeSpeak(["I heard no laugh."]);

    driver.speculate("Sarah, did you laugh at the");
    await driver.drive("Sarah, did you laugh at the promise?", speak);
    expect(exec.calls).toBe(1); // the speculative call was reused
  });

  it("discards a speculation that no longer matches the final transcript", async () => {
    const exec = fakeExecutor([speakDecision("sarah"), speakDecision("abraham")]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak, inputs } = fakeSpeak(["Welcome, traveler."]);

    driver.speculate("Sarah, did you");
    await driver.drive("Abraham, tell me of the strangers.", speak);
    expect(exec.calls).toBe(2); // speculative + fresh final call
    expect(inputs[0]!.characterId).toBe("id-abraham");
  });

  it("ignores partials below the minimum length", async () => {
    const exec = fakeExecutor([speakDecision("abraham")]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    driver.speculate("uh");
    expect(exec.calls).toBe(0);
  });
});

describe("SceneDriver — solo scenes", () => {
  it("reactive solo turn takes the no-LLM floor (no orchestrator call)", async () => {
    const exec = fakeExecutor([speakDecision("abraham", "unused")]);
    const driver = SceneDriver.fromScene(SOLO, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak, inputs } = fakeSpeak(["Peace be on you."]);

    const outcome = await driver.drive("Hello?", speak);
    expect(outcome).toEqual({ action: "speak", spoke: true });
    expect(exec.calls).toBe(0); // SOLO_CUE_ON_MISS defaults off — floor served
    expect(inputs[0]!.characterId).toBe("id-abraham");
  });

  it("a speculative HIT carries the director cue into a solo turn", async () => {
    const exec = fakeExecutor([speakDecision("abraham", "Let the doubt show")]);
    const driver = SceneDriver.fromScene(SOLO, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak, inputs } = fakeSpeak(["Doubt? Yes... I know doubt."]);

    driver.speculate("Do you ever doubt the promise");
    await driver.drive("Do you ever doubt the promise you were given?", speak);
    expect(exec.calls).toBe(1);
    expect(inputs[0]!.promptChunk).toContain("Direction: Let the doubt show");
  });

  it("solo pinning does not override an end-scene decision", async () => {
    const exec = fakeExecutor([{ action: "end-scene" }]);
    const driver = SceneDriver.fromScene(SOLO, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak, inputs } = fakeSpeak(["unused"]);

    driver.speculate("Farewell, Abraham, I must go now");
    const outcome = await driver.drive("Farewell, Abraham, I must go now.", speak);
    expect(outcome.action).toBe("end-scene");
    expect(inputs).toHaveLength(0);
  });
});

describe("SceneDriver — proactive turns", () => {
  it("respects a wait-for-user decision (hold)", async () => {
    const exec = fakeExecutor([{ action: "wait-for-user" }]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak, inputs } = fakeSpeak(["unused"]);

    const spoke = await driver.driveProactive(speak);
    expect(spoke).toBe(false);
    expect(inputs).toHaveLength(0);
  });

  it("voices a proactive follow-up with the silence framing", async () => {
    const exec = fakeExecutor([speakDecision("abraham", "Re-engage gently")]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak, inputs } = fakeSpeak(["Friend? Are you still with us?"]);

    const spoke = await driver.driveProactive(speak);
    expect(spoke).toBe(true);
    expect(inputs[0]!.message).toBe("(The user has gone quiet.)");
    expect(inputs[0]!.promptChunk).toContain("Direction: Re-engage gently");
  });

  it("holds instead of echoing refusal boilerplate", async () => {
    const exec = fakeExecutor([speakDecision("abraham"), speakDecision("abraham")]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak } = fakeSpeak(["I'm sorry, but I can't help with that."]);

    await driver.drive("Hello?", speak); // records the boilerplate reply
    const callsBefore = exec.calls;
    const spoke = await driver.driveProactive(speak);
    expect(spoke).toBe(false);
    expect(exec.calls).toBe(callsBefore); // held without consulting the director
  });
});

describe("SceneDriver — degraded-decision recovery", () => {
  const failingExecutor = () => {
    let calls = 0;
    return {
      resolveExecutor: (): OrchestratorExecutorResolution => ({
        executor: {
          provider: "cerebras" as const,
          model: "fake",
          execute: async () => {
            calls += 1;
            throw new Error("provider down");
          },
        },
      }),
      get calls() {
        return calls;
      },
    };
  };

  it("answers with the last addressee when the executor fails after a user message", async () => {
    // Seed addressee continuity: Sarah spoke last on a healthy turn.
    const healthy = fakeExecutor([speakDecision("sarah")]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: healthy.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak, inputs } = fakeSpeak(["I did not laugh.", "As I said - I did not."]);
    await driver.drive("Sarah, did you laugh?", speak);

    // Now the director goes down mid-conversation.
    const broken = failingExecutor();
    const driver2 = SceneDriver.fromScene(TENT, {
      resolveExecutor: broken.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak: speak2, inputs: inputs2 } = fakeSpeak(["Peace, friend."]);
    const outcome = await driver2.drive("Anyone there?", speak2);
    expect(outcome).toEqual({ action: "speak", spoke: true });
    expect(inputs2).toHaveLength(1);
    expect(inputs2[0]!.characterId).toBe("id-abraham"); // no addressee yet → first present
    expect(inputs).toHaveLength(1);
  });

  it("keeps proactive failures as a hold (nobody is waiting)", async () => {
    const broken = failingExecutor();
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: broken.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak, inputs } = fakeSpeak(["unused"]);

    const spoke = await driver.driveProactive(speak);
    expect(spoke).toBe(false);
    expect(inputs).toHaveLength(0);
  });
});

describe("SceneDriver — speculation cancellation", () => {
  /** Executor that records each call's abort signal and never resolves until released. */
  const signalRecordingExecutor = (decision: OrchestratorDecision) => {
    const signals: Array<AbortSignal | undefined> = [];
    return {
      resolveExecutor: (): OrchestratorExecutorResolution => ({
        executor: {
          provider: "cerebras" as const,
          model: "fake",
          execute: async (_request, opts?: { signal?: AbortSignal }) => {
            signals.push(opts?.signal);
            return decision;
          },
        },
      }),
      signals,
    };
  };

  it("aborts the in-flight speculation when a longer partial supersedes it", async () => {
    const exec = signalRecordingExecutor(speakDecision("abraham"));
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });

    driver.speculate("Sarah, did you laugh");
    driver.speculate("Sarah, did you laugh at the promise of a son");
    expect(exec.signals).toHaveLength(2);
    expect(exec.signals[0]?.aborted).toBe(true);
    expect(exec.signals[1]?.aborted).toBe(false);
  });

  it("aborts a stale speculation on a MISS", async () => {
    const exec = signalRecordingExecutor(speakDecision("abraham"));
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak } = fakeSpeak(["Welcome."]);

    driver.speculate("Sarah, did you");
    await driver.drive("Abraham, tell me of the strangers.", speak);
    expect(exec.signals[0]?.aborted).toBe(true);
  });
});

describe("SceneDriver — dramaturg", () => {
  it("merges the note and expanded arc landings into the next director prompt", async () => {
    const exec = fakeExecutor([
      speakDecision("abraham"),
      speakDecision("sarah"),
      speakDecision("abraham"),
    ]);
    const reflections: ChatRequestOptions[] = [];
    const dramaturg: ChatProvider = {
      complete: async (options: ChatRequestOptions): Promise<ChatResponse> => {
        reflections.push(options);
        return {
          text: [
            "FACT: Sarah denied laughing at the promise.",
            "LANDED: The laugh",
            "NOTE: The laugh is named; press Abraham's trust question.",
          ].join("\n"),
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          cacheState: "off",
          model: "fake-dramaturg",
          latencyMs: 1,
        };
      },
      stream: async function* () {
        throw new Error("not used");
      },
    } as unknown as ChatProvider;

    const driver = SceneDriver.fromScene(ARC_SCENE, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
      dramaturgProvider: dramaturg,
    });
    const snapshots: SceneSessionSnapshot[] = [];
    driver.onState((s) => snapshots.push(s));
    const { speak } = fakeSpeak(["Welcome.", "I did NOT laugh!", "Sarah..."]);

    await driver.drive("Hello?", speak);
    await driver.drive("Sarah, I heard you laugh.", speak); // 2nd spoken turn → reflect
    await driver.settleReflection();
    expect(reflections).toHaveLength(1);

    await driver.drive("Abraham, do you believe her?", speak);
    const system = exec.requests[exec.requests.length - 1]!.messages[0]!.content;
    expect(system).toContain("Director's note (your own earlier reflection): The laugh is named");
    // Landing "The laugh" (beat 2) expands to land "Greeting" (beat 1) too.
    expect(system).toContain("[landed] Greeting");
    expect(system).toContain("[landed] The laugh");
    // The extracted fact reaches the director's durable-facts block and the
    // persisted snapshot.
    expect(system).toContain("- Sarah denied laughing at the promise.");
    expect(snapshots[snapshots.length - 1]!.sceneFacts).toEqual([
      "Sarah denied laughing at the promise.",
    ]);
  });
});
