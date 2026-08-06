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
      typicalFirstAudioMs: 220,
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
