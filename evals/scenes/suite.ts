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
import { PROACTIVE_SILENCE_MARKER, type SceneTurnForPlanning } from "@kawabunga/orchestration";

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
    | "speaker-validity";
  description: string;
  scene: Scene;
  /** Overlaid on createInitialSceneState(scene). */
  state?: Partial<SceneState>;
  recentTurns: SceneTurnForPlanning[];
  /** The user's finished utterance — or PROACTIVE_SILENCE_MARKER for a silence tick. */
  lastUserMessage?: string;
  expect: ProbeExpectation;
  /** Pass-rate the probe must clear (default 0.8; soft judgment calls use 0.6). */
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
