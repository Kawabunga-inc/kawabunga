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
    | "narrator";
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
];
