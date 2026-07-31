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
  process.env.VOICE_AGENT_CASCADE_MAX = "3";
});

import { SceneDriver, resolveDramaturgModel, type SceneSpeakInput } from "./scene-driver";

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

/** A ChatProvider whose `complete` returns fixed text — for the dramaturg
 *  and the generated-opening path. */
function fakeChatProvider(text: string): ChatProvider {
  return {
    complete: async (): Promise<ChatResponse> => ({
      text,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      cacheState: "off",
      model: "fake",
      latencyMs: 1,
    }),
    stream: async function* () {
      throw new Error("not used");
    },
  } as unknown as ChatProvider;
}

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

describe("SceneDriver — opening", () => {
  const OPENING: Scene = {
    ...TENT,
    id: "test-opening",
    openingNarration: "Evening settles over the camp.",
  };

  it("plays the authored opening, and none when the scene opens in silence", async () => {
    const authored = SceneDriver.fromScene(OPENING, { resolveExecutor: fakeExecutor([]).resolveExecutor });
    expect(await authored.resolveOpening()).toBe("Evening settles over the camp.");

    const silent = SceneDriver.fromScene(TENT, { resolveExecutor: fakeExecutor([]).resolveExecutor });
    expect(await silent.resolveOpening()).toBeNull();
  });

  it("generates an opening when asked, sanitized", async () => {
    const provider = fakeChatProvider('```\n"The oaks throw long shadows."\n```');
    const driver = SceneDriver.fromScene(
      { ...OPENING, openingMode: "generated" },
      { resolveExecutor: fakeExecutor([]).resolveExecutor, dramaturgProvider: provider },
    );
    expect(await driver.resolveOpening()).toBe("The oaks throw long shadows.");
  });

  it("falls back to the authored line when generation fails — never a broken open", async () => {
    const provider = {
      complete: async () => {
        throw new Error("provider down");
      },
      stream: async function* () {
        throw new Error("not used");
      },
    } as unknown as ChatProvider;
    const driver = SceneDriver.fromScene(
      { ...OPENING, openingMode: "generated" },
      { resolveExecutor: fakeExecutor([]).resolveExecutor, dramaturgProvider: provider },
    );
    expect(await driver.resolveOpening()).toBe("Evening settles over the camp.");
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

  it("chains after a narrator-addressed ACTION, but not after a question", async () => {
    // "Narrator, I take Sarah hostage" is an event: somebody must react.
    const actionExec = fakeExecutor([
      { action: "narrate", narration: "You seize Sarah by the arm." },
      speakDecision("abraham", "Move on the stranger"),
    ]);
    const actionDriver = SceneDriver.fromScene(TENT, {
      resolveExecutor: actionExec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    actionDriver.onNarrate(async () => {});
    const action = fakeSpeak(["Take your hand off her."]);
    const actionOutcome = await actionDriver.drive(
      "Narrator, I take Sarah hostage.",
      action.speak,
    );
    expect(actionOutcome.spoke).toBe(true);
    expect(action.inputs).toHaveLength(1);
    expect(action.inputs[0]!.characterId).toBe("id-abraham");

    // "Narrator, what do I see?" is answered and complete — no chain.
    const askExec = fakeExecutor([
      { action: "narrate", narration: "Oaks, a banked fire, a tent flap stirring." },
      speakDecision("abraham"),
    ]);
    const askDriver = SceneDriver.fromScene(TENT, {
      resolveExecutor: askExec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    askDriver.onNarrate(async () => {});
    const ask = fakeSpeak(["unused"]);
    await askDriver.drive("Narrator, what do I see around the camp?", ask.speak);
    expect(ask.inputs).toHaveLength(0);
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

describe("SceneDriver — unanswered events", () => {
  it("a silent witness responds instead of the scene holding after an event", async () => {
    // The director says hold; but Sarah was seized, answered for herself, and
    // Abraham has said nothing since — he gets the turn.
    const exec = fakeExecutor([{ action: "wait-for-user" }]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    driver.onNarrate(async () => {});
    driver.recordNarration("You seize Sarah by the arm.");
    driver.recordTurn("sarah", "Ha — you think a grip loosens my resolve?");
    const { speak, inputs } = fakeSpeak(["Take your hand off her."]);

    const spoke = await driver.driveProactive(speak);
    expect(spoke).toBe(true);
    expect(inputs[0]!.characterId).toBe("id-abraham");
  });

  it("still holds when everyone present has already answered the event", async () => {
    const exec = fakeExecutor([{ action: "wait-for-user" }]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    driver.onNarrate(async () => {});
    driver.recordNarration("You seize Sarah by the arm.");
    driver.recordTurn("sarah", "Ha — you think a grip loosens my resolve?");
    driver.recordTurn("abraham", "Take your hand off her.");
    const { speak, inputs } = fakeSpeak(["unused"]);

    expect(await driver.driveProactive(speak)).toBe(false);
    expect(inputs).toHaveLength(0);
  });

  it("does not conscript a speaker when no event was narrated", async () => {
    const exec = fakeExecutor([{ action: "wait-for-user" }]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    driver.recordTurn("abraham", "Sit by the fire, friend.");
    const { speak, inputs } = fakeSpeak(["unused"]);

    expect(await driver.driveProactive(speak)).toBe(false);
    expect(inputs).toHaveLength(0);
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
            "STORY: A traveler pressed Sarah about the laugh; she denied it.",
            "THREAD: Sarah's denial has not been challenged.",
            "WORLD: Evening deepens outside the tent.",
            "INTENT: when the fire is mentioned: a log collapses in sparks.",
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
    // The chronicle reaches the director's next prompt and the snapshot.
    expect(system).toContain("The chronicle - the story you are writing");
    expect(system).toContain("So far: A traveler pressed Sarah about the laugh");
    expect(system).toContain("- Sarah's denial has not been challenged.");
    expect(system).toContain("- Evening deepens outside the tent.");
    expect(system).toContain("when the fire is mentioned: a log collapses in sparks.");
    expect(snapshots[snapshots.length - 1]!.chronicle).toEqual({
      story: "A traveler pressed Sarah about the laugh; she denied it.",
      threads: ["Sarah's denial has not been challenged."],
      world: ["Evening deepens outside the tent."],
      intents: [{ trigger: "the fire is mentioned", direction: "a log collapses in sparks." }],
      timed: [],
      drafts: [],
    });
    // The chronicler sees its own chronicle for revision on the NEXT reflection.
    await driver.drive("And the fire?", speak); // 4th spoken turn -> reflect again
    await driver.settleReflection();
    expect(reflections.length).toBeGreaterThanOrEqual(2);
    const secondReflection = reflections[reflections.length - 1]!;
    const reflectionUser =
      typeof secondReflection.messages[0]!.content === "string"
        ? (secondReflection.messages[0]!.content as string)
        : "";
    expect(reflectionUser).toContain("Your chronicle as of the last reflection");
    expect(reflectionUser).toContain("STORY: A traveler pressed Sarah about the laugh");
  });
});

describe("SceneDriver — timed world events", () => {
  function timedDramaturg(afterSeconds: number, direction: string): ChatProvider {
    return fakeChatProvider(
      [`TIMED: in ~${afterSeconds}s: ${direction}`, "NOTE: Hold the tension."].join("\n"),
    );
  }

  it("arms from the chronicle, reports due time, and renders the event on a proactive tick", async () => {
    vi.useFakeTimers();
    try {
      const exec = fakeExecutor([
        speakDecision("abraham"),
        speakDecision("sarah"),
        { action: "narrate", narration: "A log collapses; sparks climb the dark." },
      ]);
      const driver = SceneDriver.fromScene(TENT, {
        resolveExecutor: exec.resolveExecutor,
        resolveCharacter: fakeCharacters(),
        dramaturgProvider: timedDramaturg(30, "A log collapses in a burst of sparks."),
      });
      const armed: number[] = [];
      driver.onWorldEvents(() => armed.push(1));
      const narrated: string[] = [];
      driver.onNarrate((text) => {
        narrated.push(text);
      });
      const { speak } = fakeSpeak(["Welcome.", "I heard you."]);

      await driver.drive("Hello?", speak);
      await driver.drive("Sarah, did you laugh?", speak); // 2nd spoken turn → reflect
      await driver.settleReflection();
      expect(armed).toHaveLength(1);
      const due = driver.nextWorldEventDueInMs();
      expect(due).toBeGreaterThan(28_000);
      expect(due).toBeLessThanOrEqual(30_000);

      vi.advanceTimersByTime(31_000);
      expect(driver.nextWorldEventDueInMs()).toBe(0);

      // The proactive tick consumes the event; the director's prompt carries
      // the imperative and its narrate decision is voiced.
      const spoke = await driver.driveProactive(speak);
      expect(spoke).toBe(true);
      expect(narrated).toEqual(["A log collapses; sparks climb the dark."]);
      const userPrompt = exec.requests[exec.requests.length - 1]!.messages[1]!.content;
      expect(userPrompt).toContain("A WORLD EVENT the chronicler scheduled has come due");
      expect(userPrompt).toContain("A log collapses in a burst of sparks.");
      // Spent: no pending events remain.
      expect(driver.nextWorldEventDueInMs()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("guarantees a due event fires even when the director holds", async () => {
    vi.useFakeTimers();
    try {
      const exec = fakeExecutor([
        speakDecision("abraham"),
        speakDecision("sarah"),
        { action: "wait-for-user" },
      ]);
      const driver = SceneDriver.fromScene(TENT, {
        resolveExecutor: exec.resolveExecutor,
        resolveCharacter: fakeCharacters(),
        dramaturgProvider: timedDramaturg(20, "Thunder rolls far off beyond the hills."),
      });
      const narrated: string[] = [];
      driver.onNarrate((text) => {
        narrated.push(text);
      });
      const { speak } = fakeSpeak(["Welcome.", "I heard you."]);
      await driver.drive("Hello?", speak);
      await driver.drive("Sarah?", speak);
      await driver.settleReflection();
      vi.advanceTimersByTime(21_000);

      const spoke = await driver.driveProactive(speak);
      expect(spoke).toBe(true);
      // Director said wait → the event narrates its own direction verbatim.
      expect(narrated).toEqual(["Thunder rolls far off beyond the hills."]);
      expect(driver.nextWorldEventDueInMs()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SceneDriver — momentum cascades", () => {
  it("keeps advancing while decisions carry momentum, then stops when it clears", async () => {
    const exec = fakeExecutor([
      { ...speakDecision("abraham", "Dying words"), momentum: true },
      { ...speakDecision("sarah", "Grief breaks"), momentum: true },
      { action: "narrate", narration: "The camp wakes to the cry." }, // no momentum → cascade ends
    ]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const narrated: string[] = [];
    driver.onNarrate((text) => {
      narrated.push(text);
    });
    const { speak, inputs } = fakeSpeak(["May the One watch over this place.", "Abraham!"]);

    const outcome = await driver.drive("I strike him down.", speak);
    expect(outcome.spoke).toBe(true);
    // One user turn produced: abraham (primary), sarah (cascade), narration (cascade end).
    expect(inputs.map((i) => i.speaker.slug)).toEqual(["abraham", "sarah"]);
    expect(narrated).toEqual(["The camp wakes to the cry."]);
    expect(exec.calls).toBe(3);
    // The cascade steps carried the MOMENTUM marker, not a silence tick.
    const lastUser = exec.requests[1]!.messages[1]!.content;
    expect(lastUser).toContain("MID-CASCADE");
  });

  it("hard-caps a runaway cascade at VOICE_AGENT_CASCADE_MAX beats", async () => {
    const exec = fakeExecutor([
      { ...speakDecision("abraham", "beat"), momentum: true }, // primary
      { ...speakDecision("sarah", "beat"), momentum: true },
      { ...speakDecision("abraham", "beat"), momentum: true },
      { ...speakDecision("sarah", "beat"), momentum: true },
      { ...speakDecision("abraham", "beat"), momentum: true },
    ]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak, inputs } = fakeSpeak(() => "…");

    await driver.drive("Chaos!", speak);
    // Primary + at most CASCADE_MAX(3) driver-initiated beats.
    expect(inputs.length).toBe(4);
  });

  it("a wait-for-user mid-cascade resolves it cleanly", async () => {
    const exec = fakeExecutor([
      { ...speakDecision("abraham", "beat"), momentum: true },
      { action: "wait-for-user" },
    ]);
    const driver = SceneDriver.fromScene(TENT, {
      resolveExecutor: exec.resolveExecutor,
      resolveCharacter: fakeCharacters(),
    });
    const { speak, inputs } = fakeSpeak(["…"]);
    const outcome = await driver.drive("Go on.", speak);
    expect(outcome.spoke).toBe(true);
    expect(inputs.length).toBe(1);
    expect(exec.calls).toBe(2);
  });
});

describe("resolveDramaturgModel", () => {
  it("keeps the default when unset", () => {
    expect(resolveDramaturgModel(undefined)).toBe("claude-sonnet-4-5");
    expect(resolveDramaturgModel("  ")).toBe("claude-sonnet-4-5");
  });

  it("accepts a registry model id", () => {
    expect(resolveDramaturgModel("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });

  it("falls back to the default on an unknown id, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(resolveDramaturgModel("claude-sonnet-4-5-typo")).toBe("claude-sonnet-4-5");
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('"claude-sonnet-4-5-typo" is not in the model registry'),
      );
    } finally {
      warn.mockRestore();
    }
  });
});
