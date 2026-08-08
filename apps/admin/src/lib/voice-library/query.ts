import type {
  LibraryVoice,
  VoiceLibraryQuery,
  VoiceLibrarySort,
} from "./types";

const DEFAULT_LIMIT = 48;
const MAX_LIMIT = 100;

export function parseVoiceLibraryQuery(searchParams: URLSearchParams): VoiceLibraryQuery {
  const limitValue = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
  const sortValue = searchParams.get("sort");
  return {
    provider: providerValue(searchParams.get("provider")),
    search: clean(searchParams.get("q")),
    language: clean(searchParams.get("language")),
    gender: clean(searchParams.get("gender")),
    age: clean(searchParams.get("age")),
    useCase: clean(searchParams.get("useCase")),
    license: licenseValue(searchParams.get("license")),
    imported: importedValue(searchParams.get("imported")),
    sort: (sortValue === "name" ? "name" : "curated") as VoiceLibrarySort,
    cursor: clean(searchParams.get("cursor")),
    limit: Number.isFinite(limitValue)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limitValue)))
      : DEFAULT_LIMIT,
  };
}
export function filterLibraryVoices(
  voices: LibraryVoice[],
  query: VoiceLibraryQuery,
): LibraryVoice[] {
  const search = query.search?.toLowerCase();
  const filtered = voices.filter((voice) => {
    if (query.provider && voice.provider !== query.provider) return false;
    if (search) {
      const haystack = [
        voice.name,
        voice.description,
        voice.externalId,
        ...voice.tags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (query.language && voice.language !== query.language) return false;
    if (query.gender && voice.gender !== query.gender) return false;
    if (query.age && voice.age !== query.age) return false;
    if (query.useCase && voice.useCase !== query.useCase) return false;
    if (query.license === "commercial" && voice.license?.commercialUse !== true) return false;
    if (query.license === "noncommercial" && voice.license?.commercialUse !== false) return false;
    if (query.license === "unknown" && voice.license?.commercialUse !== undefined) return false;
    if (query.imported === "imported" && voice.importState.kind !== "imported") return false;
    if (query.imported === "not_imported" && voice.importState.kind === "imported") return false;
    return true;
  });
  return query.sort === "name"
    ? [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    : filtered;
}

function clean(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function providerValue(value: string | null): VoiceLibraryQuery["provider"] {
  if (
    value === "pocket_tts" ||
    value === "elevenlabs" ||
    value === "openai" ||
    value === "cartesia" ||
    value === "fish_audio"
  ) {
    return value;
  }
  return undefined;
}

function licenseValue(value: string | null): VoiceLibraryQuery["license"] {
  return value === "commercial" || value === "unknown" || value === "noncommercial"
    ? value
    : undefined;
}

function importedValue(value: string | null): VoiceLibraryQuery["imported"] {
  return value === "imported" || value === "not_imported" ? value : undefined;
}
