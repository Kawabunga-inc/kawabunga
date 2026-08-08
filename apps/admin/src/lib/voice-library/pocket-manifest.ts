import type { LibraryLicense, LibraryVoice } from "./types";

const POCKET_MODEL = "kyutai-tts";
const POCKET_COST = {
  value: 1.04,
  unit: "cr/1k",
  kind: "measured" as const,
  note: "Measured Railway infrastructure allocation: $1.04 per million characters.",
};
const POCKET_LATENCY = {
  value: 365,
  unit: "ms typical",
  kind: "measured" as const,
  note: "Production /speak p50; direct /speak p95 is approximately 528ms.",
};

const CC_BY_URL = "https://creativecommons.org/licenses/by/4.0/";
const CC_BY_NC_URL = "https://creativecommons.org/licenses/by-nc/4.0/";
const CC0_URL = "https://creativecommons.org/publicdomain/zero/1.0/";

const LICENSES = {
  cc0: {
    name: "CC0 1.0",
    url: CC0_URL,
    commercialUse: true,
    attributionRequired: false,
  } satisfies LibraryLicense,
  vctk: {
    name: "CC BY 4.0",
    url: CC_BY_URL,
    commercialUse: true,
    attributionRequired: true,
    attribution: "Voice source from the VCTK corpus, licensed CC BY 4.0.",
  } satisfies LibraryLicense,
  alba: {
    name: "CC BY 4.0",
    url: CC_BY_URL,
    commercialUse: true,
    attributionRequired: true,
    attribution: "Voice performance by Alba MacKenna, licensed CC BY 4.0.",
  } satisfies LibraryLicense,
  expresso: {
    name: "CC BY-NC 4.0",
    url: CC_BY_NC_URL,
    commercialUse: false,
    attributionRequired: true,
    attribution: "Voice source from the Expresso corpus, licensed CC BY-NC 4.0.",
  } satisfies LibraryLicense,
  ears: {
    name: "CC BY-NC 4.0",
    url: CC_BY_NC_URL,
    commercialUse: false,
    attributionRequired: true,
    attribution: "Voice source from the EARS dataset, licensed CC BY-NC 4.0.",
  } satisfies LibraryLicense,
};

type PocketPreset = {
  id: string;
  name: string;
  sourcePath: string;
  sourceLabel: string;
  license: LibraryLicense;
  gender?: string;
  tags?: string[];
};

const PRESETS: PocketPreset[] = [
  { id: "cosette", name: "Cosette", sourcePath: "expresso/ex04-ex02_confused_001_channel1_499s.wav", sourceLabel: "Kyutai premade voices · Expresso", license: LICENSES.expresso, gender: "female", tags: ["expressive", "character"] },
  { id: "marius", name: "Marius", sourcePath: "voice-donations/Selfie.wav", sourceLabel: "Kyutai voice donations", license: LICENSES.cc0, tags: ["donated", "conversational"] },
  { id: "javert", name: "Javert", sourcePath: "voice-donations/Butter.wav", sourceLabel: "Kyutai voice donations", license: LICENSES.cc0, tags: ["donated", "conversational"] },
  { id: "alba", name: "Alba", sourcePath: "alba-mackenna/casual.wav", sourceLabel: "Kyutai premade voices · Alba MacKenna", license: LICENSES.alba, gender: "female", tags: ["casual", "dialogue"] },
  { id: "jean", name: "Jean", sourcePath: "ears/p010/freeform_speech_01_enhanced.wav", sourceLabel: "Kyutai premade voices · EARS", license: LICENSES.ears, tags: ["freeform", "enhanced"] },
  { id: "anna", name: "Anna", sourcePath: "vctk/p228_023_enhanced.wav", sourceLabel: "Kyutai premade voices · VCTK", license: LICENSES.vctk, gender: "female" },
  { id: "vera", name: "Vera", sourcePath: "vctk/p229_023_enhanced.wav", sourceLabel: "Kyutai premade voices · VCTK", license: LICENSES.vctk, gender: "female" },
  { id: "fantine", name: "Fantine", sourcePath: "vctk/p244_023_enhanced.wav", sourceLabel: "Kyutai premade voices · VCTK", license: LICENSES.vctk, gender: "female" },
  { id: "charles", name: "Charles", sourcePath: "vctk/p254_023_enhanced.wav", sourceLabel: "Kyutai premade voices · VCTK", license: LICENSES.vctk, gender: "male" },
  { id: "paul", name: "Paul", sourcePath: "vctk/p259_023_enhanced.wav", sourceLabel: "Kyutai premade voices · VCTK", license: LICENSES.vctk, gender: "male" },
  { id: "eponine", name: "Eponine", sourcePath: "vctk/p262_023_enhanced.wav", sourceLabel: "Kyutai premade voices · VCTK", license: LICENSES.vctk, gender: "female" },
  { id: "azelma", name: "Azelma", sourcePath: "vctk/p303_023_enhanced.wav", sourceLabel: "Kyutai premade voices · VCTK", license: LICENSES.vctk, gender: "female" },
  { id: "george", name: "George", sourcePath: "vctk/p315_023_enhanced.wav", sourceLabel: "Kyutai premade voices · VCTK", license: LICENSES.vctk, gender: "male" },
  { id: "mary", name: "Mary", sourcePath: "vctk/p333_023_enhanced.wav", sourceLabel: "Kyutai premade voices · VCTK", license: LICENSES.vctk, gender: "female" },
  { id: "jane", name: "Jane", sourcePath: "vctk/p339_023_enhanced.wav", sourceLabel: "Kyutai premade voices · VCTK", license: LICENSES.vctk, gender: "female" },
  { id: "michael", name: "Michael", sourcePath: "vctk/p360_023_enhanced.wav", sourceLabel: "Kyutai premade voices · VCTK", license: LICENSES.vctk, gender: "male" },
  { id: "eve", name: "Eve", sourcePath: "vctk/p361_023_enhanced.wav", sourceLabel: "Kyutai premade voices · VCTK", license: LICENSES.vctk, gender: "female" },
  { id: "bill_boerst", name: "Bill Boerst", sourcePath: "voice-zero/bill_boerst.wav", sourceLabel: "Kyutai premade voices · Voice-Zero", license: LICENSES.cc0, gender: "male" },
  { id: "peter_yearsley", name: "Peter Yearsley", sourcePath: "voice-zero/peter_yearsley.wav", sourceLabel: "Kyutai premade voices · Voice-Zero", license: LICENSES.cc0, gender: "male" },
  { id: "stuart_bell", name: "Stuart Bell", sourcePath: "voice-zero/stuart_bell.wav", sourceLabel: "Kyutai premade voices · Voice-Zero", license: LICENSES.cc0, gender: "male" },
  { id: "caro_davy", name: "Caro Davy", sourcePath: "voice-zero/caro_davy.wav", sourceLabel: "Kyutai premade voices · Voice-Zero", license: LICENSES.cc0, gender: "female" },
];

function huggingFaceUrl(path: string): string {
  return `https://huggingface.co/kyutai/tts-voices/resolve/main/${path}`;
}

export const POCKET_LIBRARY_VOICES: LibraryVoice[] = PRESETS.map((preset) => ({
  provider: "pocket_tts",
  externalId: preset.id,
  name: preset.name,
  description: `English Pocket TTS preset sourced from ${preset.sourceLabel.replace("Kyutai premade voices · ", "the ")}.`,
  previewUrl: huggingFaceUrl(preset.sourcePath),
  language: "en-US",
  languageLabel: "English (US)",
  gender: preset.gender,
  tags: ["english", ...(preset.tags ?? ["premade"])],
  model: POCKET_MODEL,
  cost: POCKET_COST,
  latency: POCKET_LATENCY,
  license: preset.license,
  source: {
    label: preset.sourceLabel,
    url: `https://huggingface.co/kyutai/tts-voices/blob/main/${preset.sourcePath}`,
    previewUrl: huggingFaceUrl(preset.sourcePath),
  },
  importMode: "embedding",
  availability: "available",
  importState: { kind: "not_imported" },
}));

export function getPocketLibraryVoice(externalId: string): LibraryVoice | null {
  return POCKET_LIBRARY_VOICES.find((voice) => voice.externalId === externalId) ?? null;
}
