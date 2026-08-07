/**
 * What a voice COSTS and how FAST it speaks — properties of the provider and
 * model, never of the voice itself.
 *
 * The library card renders these as $-pips and lightning bolts. Storing them
 * per voice would go stale the moment a provider changes its rate (or we move
 * onto a committed plan), and it would go stale silently across every row.
 * Here, one edit re-prices the whole library.
 *
 * Credits are the monetary unit: 1 credit = 1 character of input text, the
 * convention both ElevenLabs and Cartesia bill on, so `creditsPerThousandChars`
 * is directly comparable across providers and maps to USD per million
 * characters by the same number (50 cr/1k === $50/M).
 */

/** 1 = cheapest. Rendered as filled $-pips out of 4. */
export type VoiceCostTier = 1 | 2 | 3 | 4;
/** 4 = fastest. Rendered as filled lightning bolts out of 4. */
export type VoiceSpeedTier = 1 | 2 | 3 | 4;

export interface VoiceCapability {
  /** Display label for the provider pill (lowercase; the UI upper-cases it). */
  label: string;
  /** Credits (= characters) per 1,000 characters. Null when the provider is
   *  self-hosted or unpriced — the card shows "—" rather than a guess. */
  creditsPerThousandChars: number | null;
  /** Typical time to first audio. Null when we have no measurement. */
  typicalFirstAudioMs: number | null;
  /** Model id shown beside the provider pill, when the voice doesn't name one. */
  defaultModelId: string | null;
  /** Set when the number is an assumption worth surfacing on hover. */
  note?: string;
}

/**
 * Keyed by `provider` then model id, with `*` as the provider default. Keyed
 * loosely by string (not the VoiceProvider union) so a provider can be priced
 * here before its adapter lands — adding one is a data edit, not a refactor.
 */
const CAPABILITIES: Record<string, Record<string, VoiceCapability>> = {
  elevenlabs: {
    // Flash / Turbo are the low-latency tier at half the premium rate.
    "*": {
      label: "elevenlabs",
      creditsPerThousandChars: 50,
      typicalFirstAudioMs: 180,
      defaultModelId: "eleven_flash_v2_5",
    },
    premium: {
      label: "elevenlabs",
      creditsPerThousandChars: 100,
      typicalFirstAudioMs: 400,
      defaultModelId: null,
      note: "Premium multilingual tier — double the flash rate.",
    },
  },
  cartesia: {
    "*": {
      label: "cartesia",
      creditsPerThousandChars: 50,
      typicalFirstAudioMs: 40,
      defaultModelId: "sonic-2",
      note: "Pay-as-you-go rate; committed plans reach ~37–39 cr/1k.",
    },
  },
  fish_audio: {
    "*": {
      label: "fish audio",
      creditsPerThousandChars: 15,
      // Measured, not estimated: median ~290ms to first audio over six runs
      // against s2.1-pro from a dev machine. Slower than Cartesia by ~250ms,
      // at less than a third of the price.
      typicalFirstAudioMs: 290,
      defaultModelId: "s2.1-pro",
      note: "Billed per UTF-8 byte — non-Latin scripts cost ~3× this.",
    },
  },
  pocket_tts: {
    "*": {
      label: "pocket",
      // Self-hosted: the cost is infrastructure, not per character. Reporting
      // a per-character rate here would be fiction.
      creditsPerThousandChars: null,
      typicalFirstAudioMs: null,
      defaultModelId: null,
      note: "Self-hosted — cost is infrastructure, not per character.",
    },
  },
  openai: {
    "*": {
      label: "openai",
      creditsPerThousandChars: null,
      typicalFirstAudioMs: null,
      defaultModelId: null,
      note: "No streaming adapter yet.",
    },
  },
};

const UNKNOWN: VoiceCapability = {
  label: "unknown",
  creditsPerThousandChars: null,
  typicalFirstAudioMs: null,
  defaultModelId: null,
};

/**
 * Resolve the capability for a voice. `modelId` selects a within-provider tier
 * when one exists (ElevenLabs premium vs flash); anything unrecognised falls
 * back to the provider default, and an unknown provider yields nulls so the
 * card degrades to "—" instead of inventing a price.
 */
export function voiceCapability(
  provider: string,
  modelId?: string | null,
): VoiceCapability {
  const byModel = CAPABILITIES[provider];
  if (!byModel) return { ...UNKNOWN, label: provider };
  if (provider === "elevenlabs" && modelId && !isElevenLabsFastModel(modelId)) {
    return byModel.premium ?? byModel["*"]!;
  }
  return byModel[modelId ?? ""] ?? byModel["*"]!;
}

/** Flash and Turbo are the cheap, low-latency ElevenLabs models. */
function isElevenLabsFastModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id.includes("flash") || id.includes("turbo");
}

/** $-pips. Buckets are wide on purpose: the card answers "roughly how
 *  expensive", and the exact rate sits beside it for anyone who needs it. */
export function costTierFor(creditsPerThousandChars: number | null): VoiceCostTier | null {
  if (creditsPerThousandChars == null || !Number.isFinite(creditsPerThousandChars)) {
    return null;
  }
  if (creditsPerThousandChars <= 20) return 1;
  if (creditsPerThousandChars <= 40) return 2;
  if (creditsPerThousandChars <= 80) return 3;
  return 4;
}

/** Lightning bolts. Sub-100ms is the "lands on cue" tier that makes a voice
 *  usable for interruption-sensitive beats. */
export function speedTierFor(typicalFirstAudioMs: number | null): VoiceSpeedTier | null {
  if (typicalFirstAudioMs == null || !Number.isFinite(typicalFirstAudioMs)) return null;
  if (typicalFirstAudioMs < 100) return 4;
  if (typicalFirstAudioMs < 200) return 3;
  if (typicalFirstAudioMs < 400) return 2;
  return 1;
}

/** "50 cr/1k" — the exact rate rendered beside the pips. */
export function formatCreditRate(creditsPerThousandChars: number | null): string {
  if (creditsPerThousandChars == null) return "—";
  const rounded =
    Math.round(creditsPerThousandChars * 10) / 10;
  return `${rounded} cr/1k`;
}

/** "~40ms" — the exact latency rendered beside the bolts. */
export function formatFirstAudio(typicalFirstAudioMs: number | null): string {
  if (typicalFirstAudioMs == null) return "—";
  return `~${Math.round(typicalFirstAudioMs)}ms`;
}

/**
 * Shorten a model id for the card's value slot: "eleven_flash_v2_5" is the
 * API's name, "flash v2.5" is what a person reads. Unknown ids pass through
 * so a new model never renders as an empty cell.
 */
export function formatModelLabel(modelId: string | null | undefined): string {
  const id = modelId?.trim();
  if (!id) return "\u2014";
  return id
    // The provider is already named in the pill beside this.
    .replace(/^eleven[_-]/i, "")
    .replace(/_/g, " ")
    // "v2 5" is a version, not two words.
    .replace(/\bv(\d+) (\d+)\b/gi, "v$1.$2");
}

/* ── Text dialect ───────────────────────────────────────────────
 *
 * WHAT MARKUP THIS MODEL UNDERSTANDS — a property of the provider and model,
 * exactly like cost and speed, and for the same reason: it changes whenever a
 * voice is re-pointed at a different model, and storing it per voice would go
 * stale silently.
 *
 * The routing layer already sends the right text to the right voice on the
 * right model. What it could not do is tell the text PRODUCERS which dialect
 * their words would be read in. So every producer writes one dialect and hopes.
 *
 * That hope is wrong today in a specific, audible way. ElevenLabs v3 reads
 * `[laughs]` as a performance direction; v2.5 — which every voice we run uses —
 * has no such notion and reads the characters. Our own transcript convention
 * wraps narration in brackets, so the failure is one leak away rather than
 * hypothetical.
 */
export interface TtsTextCapability {
  /** `[laughs]`, `[whispers]` — Eleven v3 only. On other models these are text. */
  audioTags: boolean;
  /** `<break time="1.5s" />` — the v2 family. v3 dropped SSML breaks entirely. */
  breakTags: boolean;
  /** `<phoneme alphabet="ipa" ...>` — narrower than it looks: ElevenLabs
   *  documents these for `eleven_flash_v2` only, NOT `eleven_flash_v2_5`. */
  phonemeTags: boolean;
  /** Bare `/ˌbaɪoʊˈkemɪstri/` in the text — v3's replacement for phoneme tags. */
  ipaSlashes: boolean;
  /** `voice_settings.speed` (0.7–1.2). */
  speed: boolean;
}

const NO_MARKUP: TtsTextCapability = {
  audioTags: false,
  breakTags: false,
  phonemeTags: false,
  ipaSlashes: false,
  speed: false,
};

const TEXT_CAPABILITIES: Record<string, Record<string, TtsTextCapability>> = {
  elevenlabs: {
    // flash / turbo v2.5 — what every voice we run uses today.
    "*": { ...NO_MARKUP, breakTags: true, speed: true },
    // eleven_flash_v2 (no .5) is the one model with phoneme-tag support.
    phoneme: { ...NO_MARKUP, breakTags: true, phonemeTags: true, speed: true },
    // v3: audio tags and inline IPA, and SSML breaks are gone.
    v3: { ...NO_MARKUP, audioTags: true, ipaSlashes: true, speed: true },
  },
  cartesia: { "*": { ...NO_MARKUP, speed: true } },
  fish_audio: { "*": NO_MARKUP },
  pocket_tts: { "*": NO_MARKUP },
  openai: { "*": NO_MARKUP },
};

/**
 * Resolve the text dialect for a voice. Unknown providers and models get
 * NO_MARKUP: plain prose is understood by every engine, so the default is the
 * one that is never wrong, only ever less expressive.
 */
export function ttsTextCapability(
  provider: string,
  modelId?: string | null,
): TtsTextCapability {
  const byModel = TEXT_CAPABILITIES[provider];
  if (!byModel) return NO_MARKUP;
  if (provider === "elevenlabs" && modelId) {
    const id = modelId.toLowerCase();
    if (id.includes("v3")) return byModel.v3!;
    // "eleven_flash_v2" but not "eleven_flash_v2_5" — the trailing .5 is a
    // different model with different support.
    if (/flash[_-]v2$/.test(id)) return byModel.phoneme!;
  }
  return byModel[modelId ?? ""] ?? byModel["*"]!;
}

/**
 * Strip markup this model cannot read, so it is never spoken aloud.
 *
 * Only bracket spans, and only when the model has no audio-tag notion. A
 * narrator reading "open bracket laughs close bracket" is unambiguously worse
 * than silence, whereas stripping a bracket that happened to be meaningful
 * prose costs a parenthetical.
 *
 * Deliberately NOT stripped: `<break>`/`<phoneme>` on models that lack them.
 * Nothing in this codebase emits them, so a stripper would be dead code
 * standing between every line and its audio.
 */
export function sanitizeForTts(text: string, capability: TtsTextCapability): string {
  if (capability.audioTags) return text;
  // Non-greedy, single-line: a bracket left unclosed by a truncated generation
  // must not swallow the remainder of the line.
  return text.replace(/\[[^\]\n]*\]/g, " ").replace(/\s{2,}/g, " ").trim();
}
