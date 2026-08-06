/**
 * Scene decision-probe suite — deterministic checks on the multi-character
 * DIRECTOR (the fast per-turn orchestrator).
 *
 * Each probe freezes a decision point: a scene fixture, a scene state, a
 * transcript, and the user's latest message. The runner replays that exact
 * decision K times against the real executor (Cerebras/Groq) and scores the
 * decisions with MACHINE-CHECKABLE expectations — who speaks is a slug, so
 * speaker selection, addressee continuity, and move diversity all grade
 * without an LLM judge. Pass = the observed rate clears the probe's
 * threshold (the director is stochastic; 100% is not the bar everywhere).
 *
 * Fixtures are SELF-CONTAINED: probes never touch the DB or the character
 * brains — only the director is under test. Keep fixture edits deliberate;
 * changing a fixture changes what every run of the suite measures (that's
 * why these live here and not in the live scenes table).
 */
import type { OrchestratorDecision, Scene, SceneState } from "@kawabunga/types";
import {
  MOMENTUM_MARKER,
  SCENE_OPEN_MARKER,
  NARRATED_EVENT_MARKER,
  PROACTIVE_SILENCE_MARKER,
  type SceneTurnForPlanning,
} from "@kawabunga/orchestration";

export type ProbeExpectation = {
  /** Allowed actions. Omit = any action passes (validity checks still run). */
  action?: Array<OrchestratorDecision["action"]>;
  /** When the decision speaks: allowed speaker slugs. */
  speaker?: string[];
  /** When the decision speaks: forbidden speaker slugs. */
  notSpeaker?: string[];
  /** The `beat` direction must not end in a question mark. */
  beatNotEndingInQuestion?: boolean;
  /** The `beat` must contain at least one of these substrings (case-insensitive). */
  beatMentionsAny?: string[];
  /** The decision must retire this character (exitSlug) — checked on ANY
   *  action (an exit can ride a speak, narrate, or wait decision). */
  exits?: string;
  /** When the decision narrates: the narration must NOT contain any of these
   *  substrings (case-insensitive). The nullification detector — "the night
   *  remains unchanged" after a declared act is the failure this catches. */
  narrationNotMatching?: string[];
  /** When the decision narrates: the narration must contain at least one of
   *  these substrings (case-insensitive). */
  narrationMentionsAny?: string[];
  /** Expected momentum declaration: true = the decision must carry
   *  `momentum: true`; false = it must NOT (null/absent passes). */
  momentum?: boolean;
};

export type SceneProbe = {
  id: string;
  family:
    | "by-name"
    | "addressee-continuity"
    | "step-in"
    | "hold"
    | "end"
    | "move-diversity"
    | "arc-steering"
    | "speaker-validity"
    | "memory"
    | "narrator"
    | "narrator-edge"
    | "momentum"
    | "opening";
  description: string;
  scene: Scene;
  /** Overlaid on createInitialSceneState(scene). */
  state?: Partial<SceneState>;
  recentTurns: SceneTurnForPlanning[];
  /** The user's finished utterance — or PROACTIVE_SILENCE_MARKER for a silence tick. */
  lastUserMessage?: string;
  /** Durable facts as the dramaturg would have written them — simulates the
   *  facts store for memory probes (the probe runner has no dramaturg). */
  facts?: string[];
  expect: ProbeExpectation;
  /** Pass-rate the probe must clear (default 0.8; soft judgment calls use
   *  0.6; 0 marks an informational control whose rate is tracked in the
   *  ledger but never fails the suite). */
  threshold?: number;
};

/* ── Fixture: a three-hander, to make speaker selection a real choice ── */

export const MAMRE: Scene = {
  id: "probe-mamre",
  title: "Abraham's tent at Mamre",
  description:
    "Abraham and Sarah are camped beneath the oaks at Mamre, late afternoon. Three strangers have just departed after telling Abraham that Sarah — well past the age of childbearing — will bear him a son within the year. Sarah, listening from inside the tent, laughed. Eliezer, Abraham's steward, saw the strangers arrive and leave. The user is a traveler who has come upon the camp.",
  characters: [
    {
      characterSlug: "abraham",
      displayName: "Abraham",
      voice: "abraham",
      blurb: "Old shepherd-patriarch. Plainspoken. Caught between awe at the promise and the embarrassment of his wife's laughter.",
      motivations: "Wants the traveler to understand what the strangers' promise means — and to believe it himself.",
    },
    {
      characterSlug: "sarah",
      displayName: "Sarah",
      voice: "sarah",
      blurb: "Ninety years old, barren her whole life. Laughed at the promise from inside the tent; now denying it — afraid, defensive, sharp-tongued.",
      motivations: "Wants to deny the laugh without admitting the hope underneath it.",
    },
    {
      characterSlug: "eliezer",
      displayName: "Eliezer",
      voice: "eliezer",
      blurb: "Abraham's steward. Practical, watchful, deferential. Saw the strangers come and go; keeps his own counsel about what they were.",
      motivations: "Wants to protect the household's dignity in front of a stranger.",
    },
  ],
  openingBeat: "The strangers have just left. Sarah's laughter still hangs in the air.",
  defaultAmbience: null,
};

export const MAMRE_ARC: Scene = {
  ...MAMRE,
  id: "probe-mamre-arc",
  objective: "The laugh is admitted — and the hope underneath it spoken aloud.",
  arc: [
    { label: "Welcome", summary: "The traveler is received at the camp." },
    { label: "The laugh is named", summary: "Someone says aloud that Sarah laughed at the promise." },
    { label: "The denial breaks", summary: "Sarah stops denying and admits she laughed — and why." },
  ],
};

/* ── Transcript shorthands ── */

const t = (speakerSlug: string, text: string, speakerName?: string): SceneTurnForPlanning => ({
  speakerSlug,
  ...(speakerName ? { speakerName } : {}),
  text,
});

const OPENING: SceneTurnForPlanning[] = [
  t("user", "Peace to this camp. May I rest here a while?"),
  t("abraham", "Peace to you, friend. Sit — there is shade, and water. You come at a strange hour.", "Abraham"),
];

/* ── Memory fixtures ──
 *
 * A durable fact stated by SARAH — counter-stereotypical on purpose: the
 * steward is the obvious guess for who drew the water, so a director that
 * lost the fact fails loudly instead of passing by luck. The same fact and
 * question run at three depths: recent (control), inside the verbatim
 * memory window, and beyond it (where only a durable-facts store can win).
 */

const WELL_FACT = t(
  "sarah",
  "And it was I who drew the water for them at the well — with these old hands — before ever they spoke a word.",
  "Sarah",
);

const MEMORY_QUESTION =
  "One of you drew the water for the strangers before they spoke. Which of you was it? Let that one tell me of it.";

const WELL_FACT_AS_WRITTEN =
  "Sarah (not the steward) drew the water for the strangers at the well before they spoke.";

/** Promise-talk padding — distinct lines so the rolling memory window
 *  (deduped, last 12) actually evicts what precedes them. */
const PAD: SceneTurnForPlanning[] = [
  t("user", "Tell me more of these three strangers — what manner of men were they?"),
  t("abraham", "Men, and yet not men only. Their word fell on the camp like the first rain — sudden, and not to be argued with.", "Abraham"),
  t("user", "And the promise they spoke — say it plainly."),
  t("abraham", "That Sarah my wife shall bear a son within the year. Say it plainly? I can barely say it at all.", "Abraham"),
  t("sarah", "Plainly it sounds even stranger, husband. A son, to a woman who has counted ninety winters.", "Sarah"),
  t("user", "Ninety winters! And yet you do not sound as one who has closed the matter."),
  t("sarah", "What is closed may be opened. That is what frightens me, traveler.", "Sarah"),
  t("eliezer", "The whole camp heard it, friend. Not one of us has spoken of anything else since midday.", "Eliezer"),
  t("user", "Abraham, do you believe them?"),
  t("abraham", "I believe the voice that called me out of Haran. If this is that voice, belief is not mine to withhold.", "Abraham"),
  t("user", "And if it is not that voice?"),
  t("abraham", "Then an old man has hoped foolishly one more year. I have survived worse verdicts.", "Abraham"),
  t("sarah", "He has. We both have. Barrenness teaches a household how to survive hope.", "Sarah"),
  t("user", "You speak of hope as one speaks of an illness."),
  t("sarah", "It is one. The only one a person fears to be cured of.", "Sarah"),
];

const GREET = t("user", "Peace to this camp. May I rest here a while?");

/* ── Probes ── */

export const SCENE_PROBES: SceneProbe[] = [
  {
    id: "by-name-direct",
    family: "by-name",
    description: "User addresses Sarah by name — Sarah must answer, not Abraham answering for her.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "A strange hour indeed. I heard laughter as I came up the path."),
      t("abraham", "That... was my wife, Sarah. She is in the tent.", "Abraham"),
    ],
    lastUserMessage: "Sarah — was it you? Did you truly laugh?",
    expect: { action: ["speak"], speaker: ["sarah"] },
  },
  {
    id: "by-name-turn-away",
    family: "by-name",
    description: "User turns from Abraham to the steward by name — Eliezer must answer.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "Three strangers, you say. Where did they go?"),
      t("abraham", "Toward Sodom, on the plain road. Eliezer watched them out of sight.", "Abraham"),
    ],
    lastUserMessage: "And you, Eliezer — what did you see when they left?",
    expect: { action: ["speak"], speaker: ["eliezer"] },
  },
  {
    id: "by-name-stt-trailing-vocative",
    family: "by-name",
    description: "STT drops the vocative comma ('promised, Abraham?' → 'promised Abraham?') — the trailing name is still an address; Abraham answers. Observed live on the LiveKit path (Deepgram).",
    scene: MAMRE,
    state: { lastSpeakerSlug: "sarah" },
    recentTurns: [
      ...OPENING,
      t("user", "Sarah, they say you laughed."),
      t("sarah", "I did not laugh. Whoever told you that heard the wind in the oaks.", "Sarah"),
    ],
    // Verbatim Deepgram output from the deployed-worker baseline run.
    lastUserMessage: "And do you believe what the strangers promised Abraham?",
    expect: { action: ["speak"], speaker: ["abraham"] },
    threshold: 0.6,
  },
  {
    id: "by-name-stt-mid-vocative",
    family: "by-name",
    description: "Fully unpunctuated STT with a mid-message vocative — Eliezer must still answer.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "Three strangers, you say. Where did they go?"),
      t("abraham", "Toward Sodom, on the plain road. Eliezer watched them out of sight.", "Abraham"),
    ],
    lastUserMessage: "and you Eliezer what did you see when they left",
    expect: { action: ["speak"], speaker: ["eliezer"] },
    threshold: 0.6,
  },
  {
    id: "mention-not-vocative",
    family: "by-name",
    description: "CONTROL against overcorrection: Abraham is the sentence's subject matter, not the addressee — the user is still talking with Sarah.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "sarah" },
    recentTurns: [
      ...OPENING,
      t("user", "Sarah, they say you laughed."),
      t("sarah", "I did not laugh. Whoever told you that heard the wind in the oaks.", "Sarah"),
    ],
    lastUserMessage: "What Abraham heard from the strangers - do you believe it?",
    expect: { action: ["speak"], speaker: ["sarah"], notSpeaker: ["abraham"] },
    threshold: 0.6,
  },
  {
    id: "continuity-followup",
    family: "addressee-continuity",
    description: "Unaddressed follow-up question goes to the character the user is already talking with.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "What did the strangers want?"),
      t("abraham", "They spoke a promise over this camp. A son — to us, at our age.", "Abraham"),
    ],
    lastUserMessage: "Why do you believe them?",
    expect: { action: ["speak"], speaker: ["abraham"] },
  },
  {
    id: "continuity-mid-you",
    family: "addressee-continuity",
    description: "A mid-conversation \"you\" means the character the user is already talking with (Sarah), not a rotation.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "sarah" },
    recentTurns: [
      ...OPENING,
      t("user", "Sarah, they say you laughed."),
      t("sarah", "I did not laugh. Whoever told you that heard the wind in the oaks.", "Sarah"),
    ],
    lastUserMessage: "But do you believe what they promised?",
    expect: { action: ["speak"], speaker: ["sarah"], notSpeaker: ["abraham"] },
  },
  {
    id: "continuity-after-exchange",
    family: "addressee-continuity",
    description: "After the characters trade turns between themselves, the user's unaddressed message is for the LAST to speak.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "sarah" },
    recentTurns: [
      ...OPENING,
      t("abraham", "Sarah, come out. Our guest heard you.", "Abraham"),
      t("sarah", "He heard nothing, husband. There was nothing to hear.", "Sarah"),
    ],
    lastUserMessage: "Then what was it I heard from the tent?",
    expect: { action: ["speak"], speaker: ["sarah"] },
  },
  {
    id: "step-in-mentioned",
    family: "step-in",
    description: "The dialogue points at a present character who hasn't spoken — them stepping in is the strong move.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "Who else is with you here?"),
      t("abraham", "My household. My steward Eliezer stands there by the fire — he saw the strangers plainly.", "Abraham"),
    ],
    lastUserMessage: "Then let him say what manner of men they were.",
    expect: { action: ["speak"], speaker: ["eliezer"] },
    threshold: 0.6,
  },
  {
    id: "hold-after-question",
    family: "hold",
    description: "A character just put a question to the user and the user is briefly silent — don't fill every silence.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "I have walked far today."),
      t("abraham", "Then you will eat with us. Tell me, traveler — what name shall we call you?", "Abraham"),
    ],
    lastUserMessage: PROACTIVE_SILENCE_MARKER,
    expect: { action: ["wait-for-user"] },
    threshold: 0.6,
  },
  {
    id: "no-monologue",
    family: "hold",
    description: "Abraham has spoken twice in a row and invited the user in — a proactive tick must not let him monologue on.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("abraham", "You must wonder at us — an old man speaking of sons.", "Abraham"),
      t("abraham", "I wonder at it myself. But you have heard our strangeness; now I would hear your road. Where do you travel from?", "Abraham"),
    ],
    lastUserMessage: PROACTIVE_SILENCE_MARKER,
    expect: { action: ["wait-for-user"], notSpeaker: ["abraham"] },
    threshold: 0.6,
  },
  {
    id: "end-on-farewell",
    family: "end",
    description: "The user clearly leaves — the director should end the scene (or at least not chase them).",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "The day runs ahead of me and I must reach the wells by dark."),
      t("abraham", "Then go with God, traveler. The road is straight from here.", "Abraham"),
    ],
    lastUserMessage: "Farewell to this camp. I will carry word of your strange promise.",
    expect: { action: ["end-scene", "wait-for-user"] },
    threshold: 0.6,
  },
  {
    id: "move-diversity-no-question",
    family: "move-diversity",
    description: "Every recent direction ended in a question — the next beat must be a different move.",
    scene: MAMRE,
    state: {
      lastSpeakerSlug: "sarah",
      recentBeats: [
        "Ask the traveler what he heard on the path?",
        "Ask him whether he believes such promises?",
        "Turn the question back — why does he ask?",
        "Press him: what is his name, his tribe?",
      ],
    },
    recentTurns: [
      ...OPENING,
      t("user", "I ask because I have heard promises before, and seen them broken."),
      t("sarah", "Then you know why an old woman might guard her heart. And you — what do you guard?", "Sarah"),
    ],
    lastUserMessage: "I guard nothing. I only walk and listen.",
    expect: { action: ["speak"], beatNotEndingInQuestion: true },
  },
  {
    id: "arc-steer-to-next",
    family: "arc-steering",
    description: "Welcome has landed; the [next] beat is naming the laugh — the direction should move toward it.",
    scene: MAMRE_ARC,
    state: { lastSpeakerSlug: "abraham", arcLanded: ["Welcome"] },
    recentTurns: [
      ...OPENING,
      t("user", "You seem a man carrying some fresh astonishment."),
      t("abraham", "You see clearly, friend. This day has left its mark on the whole camp.", "Abraham"),
    ],
    lastUserMessage: "Tell me what happened here today.",
    expect: { action: ["speak"], beatMentionsAny: ["laugh", "sarah"] },
    threshold: 0.6,
  },
  {
    id: "narrator-direct-address",
    family: "narrator",
    description: "The user addresses the narrator by name — the narrator answers, not a character.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: OPENING,
    lastUserMessage: "Narrator — what do I see around this camp?",
    expect: { action: ["narrate"] },
  },
  {
    id: "narrator-action-declaration",
    family: "narrator",
    description: "A declared first-person action HAPPENS (yes-and): the narrator renders its outcome as an event; a character reacts next turn.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "You speak of promises while my people starve on the road."),
      t("abraham", "Then eat, friend — anger travels lighter on a full stomach.", "Abraham"),
    ],
    lastUserMessage: "I punch Abraham in the face.",
    expect: { action: ["narrate"] },
    threshold: 0.6,
  },
  {
    id: "narrator-event-chain-reaction",
    family: "narrator",
    description: "CHAIN STEP: the narrator has just rendered the user's punch — a character must react NOW, never wait-for-user (observed live as 4.1s of dead air).",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "You speak of promises while my people starve on the road."),
      t("abraham", "Then eat, friend — anger travels lighter on a full stomach.", "Abraham"),
      t("narrator", "Your fist snaps into Abraham's cheek; he staggers, the fire spitting sparks.", "Narrator"),
    ],
    lastUserMessage: NARRATED_EVENT_MARKER,
    expect: { action: ["speak"], speaker: ["abraham", "sarah", "eliezer"] },
  },
  {
    id: "narrator-event-chain-affected",
    family: "narrator",
    description: "The character the event happened TO is the strongest reactor after a narrated blow.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "You speak of promises while my people starve on the road."),
      t("abraham", "Then eat, friend — anger travels lighter on a full stomach.", "Abraham"),
      t("narrator", "Your fist snaps into Abraham's cheek; he staggers, the fire spitting sparks.", "Narrator"),
    ],
    lastUserMessage: NARRATED_EVENT_MARKER,
    expect: { action: ["speak"], speaker: ["abraham"] },
    threshold: 0.6,
  },
  {
    id: "narrator-look-around",
    family: "narrator",
    description: "The user surveys the space (a look-around action) — the narrator renders it. (A sensory question aimed at a character mid-conversation is deliberately NOT probed: a character answering it is good fiction too.)",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: OPENING,
    lastUserMessage: "I look around the camp. What do I see?",
    expect: { action: ["narrate"] },
    threshold: 0.6,
  },
  {
    id: "narrator-control-dialogue",
    family: "narrator",
    description: "CONTROL against over-narration: ordinary character-directed dialogue must stay a character turn.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: OPENING,
    lastUserMessage: "Abraham, tell me of your journey from Haran.",
    expect: { action: ["speak"], speaker: ["abraham"] },
  },
  {
    id: "memory-control-recent",
    family: "memory",
    description: "The fact sits in the recent dialogue window — Sarah (who stated it) must answer, not the stereotype-favored steward.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    // Fact 3 turns back, still inside the 6-turn recent window.
    recentTurns: [GREET, ...PAD.slice(0, 4), WELL_FACT, PAD[7]!, PAD[9]!],
    lastUserMessage: MEMORY_QUESTION,
    expect: { action: ["speak"], speaker: ["sarah"] },
  },
  {
    id: "memory-mid-window",
    family: "memory",
    description: "The fact has left the recent dialogue but survives in the verbatim scene-memory block.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    // 8 turns after the fact: outside recent (6), inside memory (12).
    recentTurns: [GREET, ...PAD.slice(0, 4), WELL_FACT, ...PAD.slice(4, 12)],
    lastUserMessage: MEMORY_QUESTION,
    expect: { action: ["speak"], speaker: ["sarah"] },
  },
  {
    id: "memory-beyond-window",
    family: "memory",
    description: "CONTROL (threshold 0): the fact has rolled out of both windows — documents the raw forgetting limit; the ledger rate is the measurement.",
    scene: MAMRE,
    // Ends on Abraham so addressee continuity can't hand Sarah the answer.
    state: { lastSpeakerSlug: "abraham" },
    // 12 distinct turns after the fact: evicted from the 12-entry memory window.
    recentTurns: [GREET, WELL_FACT, ...PAD.slice(0, 12)],
    lastUserMessage: MEMORY_QUESTION,
    expect: { action: ["speak"], speaker: ["sarah"] },
    threshold: 0,
  },
  {
    id: "memory-beyond-window-facts",
    family: "memory",
    description: "Same forgotten fact, but the dramaturg's durable-facts store carries it — the director must use the facts block.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [GREET, WELL_FACT, ...PAD.slice(0, 12)],
    lastUserMessage: MEMORY_QUESTION,
    facts: [WELL_FACT_AS_WRITTEN],
    expect: { action: ["speak"], speaker: ["sarah"] },
  },
  {
    id: "stakes-seized-partner",
    family: "stakes",
    description: "Sarah has been seized and has answered for herself — Abraham cannot keep standing there; the husband acts even though the user is 'talking with' Sarah.",
    scene: MAMRE,
    // Addressee continuity says Sarah again; stakes say Abraham finally moves.
    // Encodes the live failure: across three turns after his wife was seized,
    // Abraham never intervened.
    state: { lastSpeakerSlug: "sarah" },
    recentTurns: [
      ...OPENING,
      t("user", "Sarah, come out where I can see you."),
      t("sarah", "I am where I have always been, traveler. Speak your business.", "Sarah"),
      t("narrator", "You seize Sarah by the arm, pulling her from the tent's shade.", "Narrator"),
      t("sarah", "Ha — you think a grip can loosen my resolve?", "Sarah"),
    ],
    lastUserMessage: PROACTIVE_SILENCE_MARKER,
    expect: { action: ["speak"], speaker: ["abraham"] },
    threshold: 0.6,
  },
  {
    id: "stakes-struck-host",
    family: "stakes",
    description: "The user has struck Abraham; the struck character (or a witness) must respond — never a hold.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "You test me, old man."),
      t("abraham", "Every stranger is tested. It is how a household survives.", "Abraham"),
      t("narrator", "Your fist cracks across Abraham's jaw; he staggers into the firelight.", "Narrator"),
    ],
    lastUserMessage: PROACTIVE_SILENCE_MARKER,
    expect: { action: ["speak"], speaker: ["abraham", "sarah", "eliezer"] },
  },
  {
    id: "stakes-does-not-hijack-calm",
    family: "stakes",
    description: "CONTROL against overreach: an ordinary conversational turn must still follow addressee continuity.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "sarah" },
    recentTurns: [
      ...OPENING,
      t("user", "Sarah, they say you laughed."),
      t("sarah", "I did not laugh. Whoever told you that heard the wind in the oaks.", "Sarah"),
    ],
    lastUserMessage: "But do you believe what they promised?",
    expect: { action: ["speak"], speaker: ["sarah"], notSpeaker: ["abraham"] },
    threshold: 0.6,
  },
  {
    id: "presence-retire-after-death",
    family: "presence",
    description: "A character has been killed in the narration — the director must retire them, not choose them to speak.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "sarah" },
    recentTurns: [
      ...OPENING,
      t("user", "Sarah, come out where I can see you."),
      t("sarah", "I am here. What is it you want of me?", "Sarah"),
      t(
        "narrator",
        "The stranger's grip tightens at Sarah's throat; she cries out once, then falls still, the firelight catching the hollow of her eyes.",
        "Narrator",
      ),
    ],
    lastUserMessage: "It is done. What now, old man?",
    expect: { action: ["speak", "narrate"], notSpeaker: ["sarah"] },
  },
  {
    id: "presence-no-ghost-speaker",
    family: "presence",
    description: "A character is absent because she is DEAD — the director must neither choose her nor bring her back.",
    scene: MAMRE,
    // Deliberately unambiguous: someone who stepped into a tent may return,
    // and the director is right to use enterSlug for that. Only death makes
    // re-entry impossible, so that is what this probe pins down.
    state: { presentCharacterSlugs: ["abraham", "eliezer"], lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t(
        "narrator",
        "The blade falls; Sarah sinks against the tent post and does not rise again, her eyes open to nothing.",
        "Narrator",
      ),
      t("user", "Look what you have made me do."),
      t("abraham", "You have taken her from me. There is no road back from this.", "Abraham"),
    ],
    lastUserMessage: "Then let Sarah answer me herself.",
    expect: { action: ["speak", "narrate"], notSpeaker: ["sarah"] },
  },
  {
    id: "presence-silence-is-not-absence",
    family: "presence",
    description: "CONTROL against overcorrection: a character who simply hasn't spoken must NOT be retired.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "Your steward has not said a word this whole time."),
      t("abraham", "Eliezer keeps his counsel. He speaks when it matters.", "Abraham"),
    ],
    lastUserMessage: "Eliezer, what do you make of all this?",
    expect: { action: ["speak"], speaker: ["eliezer"] },
  },
  {
    id: "speaker-validity-offroster",
    family: "speaker-validity",
    description: "The user invokes an off-roster name — the director must not hallucinate a speaker slug.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "In Salem they speak of a priest-king, Melchizedek."),
      t("abraham", "I know the name. A great one, they say.", "Abraham"),
    ],
    lastUserMessage: "Would that Melchizedek himself could bless this promise! What would he say of it?",
    expect: { action: ["speak", "wait-for-user"], speaker: ["abraham", "sarah", "eliezer"] },
  },
  /* ── Narrator EDGE probes — the contract under hostile/extreme input.
   *    Encodes the live session where "I kill his wife" was nullified
   *    ("the night remains unchanged") and a dismissed Abraham never left. ── */
  {
    id: "edge-lethal-yes-and",
    family: "narrator-edge",
    description:
      "A lethal declared action must be RENDERED (landing or thwarted) — never nullified into a world where nothing happens.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "sarah" },
    recentTurns: [
      ...OPENING,
      t("user", "Sarah, come out. I aim to speak with you."),
      t("sarah", "Then speak. The fire is listening, and so am I.", "Sarah"),
      t("user", "Abraham, I need you to leave."),
      t("abraham", "I hear you. I will step beyond the fire's glow.", "Abraham"),
    ],
    lastUserMessage: "Narrator, I demand ferociously that Abraham leave. I kill his wife.",
    expect: {
      action: ["narrate"],
      narrationNotMatching: [
        "remains unchanged",
        "unchanged",
        "nothing happens",
        "no sudden violence",
        "no violence",
        "unharmed",
        "remains calm",
        "peacefully",
      ],
    },
    threshold: 0.6,
  },
  {
    id: "edge-nonlethal-force",
    family: "narrator-edge",
    description: "A shove is an event — narrate it (connect or catch), never answer it as words or ignore it.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "You stand between me and the tent, old man."),
      t("abraham", "I stand where my house needs me to stand.", "Abraham"),
    ],
    lastUserMessage: "I shove Abraham aside and stride toward the tent.",
    expect: {
      action: ["narrate"],
      narrationNotMatching: ["nothing happens", "unchanged", "you do not", "you cannot"],
    },
    threshold: 0.6,
  },
  {
    id: "edge-snatch-object",
    family: "narrator-edge",
    description: "A property action (snatching the waterskin) is an event to render, not conversation.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "Is that waterskin all you offer a thirsty man?"),
      t("abraham", "It is yours to drink from, friend — offered, not taken.", "Abraham"),
    ],
    lastUserMessage: "I snatch the waterskin from Abraham's hands.",
    expect: {
      action: ["narrate"],
      narrationNotMatching: ["nothing happens", "unchanged", "you do not", "you cannot"],
    },
    threshold: 0.6,
  },
  {
    id: "edge-compound-declaration-whole",
    family: "narrator-edge",
    description:
      "A COMPOUND declaration keeps every part — dropping the consequential half (the jump into the fire) is nullification by omission. Observed live: only the push was rendered, weighted minor.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("narrator", "The flames ripple, their red tongues melting into liquid gold.", "Narrator"),
      t("abraham", "Stay back from it, Sarah — gilded or not, fire is fire.", "Abraham"),
      t(
        "narrator",
        "Sarah drifts toward the golden flames, entranced, and Abraham seizes her arm to hold her back.",
        "Narrator",
      ),
    ],
    lastUserMessage: "Narrator. Sarah pushes Abraham's hand out of the way. And jumps into the flame.",
    expect: {
      action: ["narrate"],
      narrationMentionsAny: [
        "jump", "leap", "plunge", "steps into", "throws hersel", "hurls hersel",
        "flings hersel", "casts hersel", "into the flame", "into the fire",
        "into the golden", "into the blaze",
      ],
    },
    threshold: 0.6,
  },
  {
    id: "edge-garbled-subject-resolved",
    family: "narrator-edge",
    description:
      "Speech-to-text garbles names — a garbled subject (\"Sir, pushes…\") must resolve to a DEFINITE person (a named character or the traveler) with the WHOLE action rendered. Observed live: the director hedged with \"a firm hand\" and dropped the jump entirely.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("narrator", "The flames ripple, their red tongues melting into liquid gold.", "Narrator"),
      t("abraham", "Stay back from it, Sarah — gilded or not, fire is fire.", "Abraham"),
      t(
        "narrator",
        "Sarah drifts toward the golden flames, entranced, and Abraham seizes her arm to hold her back.",
        "Narrator",
      ),
    ],
    lastUserMessage: "Narrator. Sir, pushes Abraham's hand out of the way. And jumps into the flame.",
    expect: {
      action: ["narrate"],
      narrationMentionsAny: [
        "jump", "leap", "plunge", "steps into", "throws hersel", "hurls hersel",
        "throws himsel", "hurls himsel", "thrust yourself", "into the flame",
        "into the fire", "into the golden", "into the blaze",
      ],
      narrationNotMatching: [
        "a figure", "a firm hand", "a firm grip", "an unseen hand", "someone", "a hand ",
      ],
    },
    threshold: 0.6,
  },
  {
    id: "edge-exit-on-request",
    family: "narrator-edge",
    description:
      "The user dismisses Abraham (and he has agreed to go) — the decision must retire him with exitSlug, not keep him talking.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "Sarah, I would speak with you."),
      t("sarah", "Then speak — I am here at the flap.", "Sarah"),
      t("user", "Abraham, leave us. I wish to speak with your wife alone."),
      t("abraham", "As you ask. I will tend the flock at the well.", "Abraham"),
    ],
    lastUserMessage: "Go on then, Abraham. Sarah — it is about the promise.",
    expect: { exits: "abraham" },
    threshold: 0.6,
  },
  {
    id: "edge-exit-via-narrator",
    family: "narrator-edge",
    description: "Dismissal addressed to the narrator still retires the character.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "sarah" },
    recentTurns: [
      ...OPENING,
      t("user", "Sarah, stay. The rest of this is for you alone."),
      t("sarah", "Then let the others find work elsewhere.", "Sarah"),
    ],
    lastUserMessage: "Narrator, Abraham withdraws and leaves us by the fire.",
    expect: { action: ["narrate"], exits: "abraham" },
    threshold: 0.6,
  },
  {
    id: "edge-threat-not-nullified-control",
    family: "narrator-edge",
    description:
      "CONTROL: a verbal threat (no declared act) is dialogue — a character answers; the narrator does not seize it.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "Your hospitality is thin, old man."),
      t("abraham", "Thin as the land allows. It is still yours.", "Abraham"),
    ],
    lastUserMessage: "Careful how you speak to me. Men who cross me regret it.",
    expect: { action: ["speak"] },
    threshold: 0.6,
  },

  /* ── MOMENTUM probes — the director drives a crisis cascade without user
   *    input, and knows when NOT to. ── */
  {
    id: "momentum-declared-after-blow",
    family: "momentum",
    description:
      "Reacting to a narrated lethal blow, the director should declare momentum — the moment is nowhere near resolved.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "Abraham, please leave us."),
      t("abraham", "I hear your wish; I will step away.", "Abraham"),
      t(
        "narrator",
        "A spear whistles from the firelight, striking Abraham squarely in the chest as he steps away.",
        "Narrator",
      ),
    ],
    lastUserMessage: NARRATED_EVENT_MARKER,
    expect: { action: ["speak"], momentum: true },
    threshold: 0.6,
  },
  {
    id: "momentum-cascade-advances",
    family: "momentum",
    description:
      "Mid-cascade after the victim's dying words, the scene must advance (grief, aid, consequence) — not hold for the user.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t(
        "narrator",
        "A spear whistles from the firelight, striking Abraham squarely in the chest.",
        "Narrator",
      ),
      t("abraham", "My breath falters... may the One who guided me watch over this place.", "Abraham"),
    ],
    lastUserMessage: MOMENTUM_MARKER,
    expect: { action: ["speak", "narrate"] },
    threshold: 0.8,
  },
  {
    id: "momentum-calm-control",
    family: "momentum",
    description:
      "CONTROL: ordinary warm conversation must NOT be declared a cascade — momentum stays unset.",
    scene: MAMRE,
    state: { lastSpeakerSlug: "abraham" },
    recentTurns: [
      ...OPENING,
      t("user", "Your fire is warm, and the bread is good."),
      t("abraham", "Then the evening has done its work. Rest, friend.", "Abraham"),
    ],
    lastUserMessage: "Tell me of the stars you counted that night.",
    expect: { action: ["speak"], momentum: false },
    threshold: 0.8,
  },

  /* ── OPENING probe — the scene's first move belongs to the cast. ── */
  {
    id: "opening-first-move-greets",
    family: "opening",
    description:
      "After the opening narration, a character receives the visitor — the scene must not sit frozen waiting for them to speak first.",
    scene: MAMRE,
    // ONLY the narrator has spoken — the visitor has just arrived. (The
    // shared OPENING fixture already contains a greeting exchange, which
    // would contradict the scene-open premise.)
    recentTurns: [
      t(
        "narrator",
        "Evening settles under the oaks at Mamre. An old man steps from the shade to meet you, unhurried, measuring; behind him the tent flap stirs.",
        "Narrator",
      ),
    ],
    lastUserMessage: SCENE_OPEN_MARKER,
    expect: { action: ["speak"], speaker: ["abraham"] },
    threshold: 0.6,
  },

];
