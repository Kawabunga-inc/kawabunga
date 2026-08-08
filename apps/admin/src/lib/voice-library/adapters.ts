import type { VoiceProvider, VoiceRecord } from "@kawabunga/db";
import { POCKET_LIBRARY_VOICES } from "./pocket-manifest";
import { filterLibraryVoices } from "./query";
import type {
  LibraryVoice,
  ProviderStatus,
  VoiceLibraryPage,
  VoiceLibraryQuery,
} from "./types";

export interface VoiceLibraryAdapter {
  provider: VoiceProvider;
  status(): Promise<ProviderStatus> | ProviderStatus;
  list(query: VoiceLibraryQuery): Promise<LibraryVoice[]>;
  get(externalId: string): Promise<LibraryVoice | null>;
}

export const pocketLibraryAdapter: VoiceLibraryAdapter = {
  provider: "pocket_tts",
  status: () => ({
    provider: "pocket_tts",
    label: "Pocket",
    availability: "available",
    count: POCKET_LIBRARY_VOICES.length,
    importModes: ["embedding", "clone"],
  }),
  async list(query) {
    return filterLibraryVoices(POCKET_LIBRARY_VOICES, query);
  },
  async get(externalId) {
    return POCKET_LIBRARY_VOICES.find((voice) => voice.externalId === externalId) ?? null;
  },
};

function representedAdapter(input: {
  provider: VoiceProvider;
  label: string;
  configured: boolean;
  missingReason: string;
  comingSoonReason: string;
  fallbackLabel: string;
}): VoiceLibraryAdapter {
  const status = (): ProviderStatus => ({
    provider: input.provider,
    label: input.label,
    availability: input.configured ? "coming_soon" : "unavailable",
    count: null,
    importModes: ["provider_id"],
    reason: input.configured ? input.comingSoonReason : input.missingReason,
    fallbackLabel: input.fallbackLabel,
    fallbackHref: "/voices?new=1",
  });
  return {
    provider: input.provider,
    status,
    async list() {
      return [];
    },
    async get() {
      return null;
    },
  };
}

export function voiceLibraryAdapters(): VoiceLibraryAdapter[] {
  return [
    pocketLibraryAdapter,
    representedAdapter({
      provider: "elevenlabs",
      label: "ElevenLabs",
      configured: Boolean(process.env.ELEVENLABS_API_KEY),
      missingReason: "ElevenLabs needs an API key before its catalog can be browsed here.",
      comingSoonReason: "ElevenLabs browsing remains in the existing provider picker during the Pocket MVP.",
      fallbackLabel: "Open ElevenLabs picker",
    }),
    representedAdapter({
      provider: "cartesia",
      label: "Cartesia",
      configured: Boolean(process.env.CARTESIA_API_KEY),
      missingReason: "Cartesia needs an API key. You can still add a voice by provider ID.",
      comingSoonReason: "Cartesia catalog browsing is coming; provider-ID import is available now.",
      fallbackLabel: "Import by voice ID",
    }),
    representedAdapter({
      provider: "fish_audio",
      label: "Fish Audio",
      configured: Boolean(process.env.FISH_AUDIO_API_KEY),
      missingReason: "Fish Audio browsing is not available; reference-ID import remains available.",
      comingSoonReason: "Fish Audio does not expose a browseable catalog yet.",
      fallbackLabel: "Import by reference ID",
    }),
  ];
}

export async function listVoiceLibrary(input: {
  query: VoiceLibraryQuery;
  catalogVoices: VoiceRecord[];
  adapters?: VoiceLibraryAdapter[];
}): Promise<VoiceLibraryPage> {
  const adapters = input.adapters ?? voiceLibraryAdapters();
  const selected = input.query.provider
    ? adapters.filter((adapter) => adapter.provider === input.query.provider)
    : adapters;
  // Import state is catalog-owned, not adapter-owned. Apply that filter only
  // after provenance annotation so adapters never coerce unknown into false.
  const adapterQuery = { ...input.query, imported: undefined };
  const results = await Promise.allSettled(
    selected.map(async (adapter) => ({
      adapter,
      status: await adapter.status(),
      voices: await adapter.list(adapterQuery),
    })),
  );

  const statusResults = await Promise.allSettled(
    adapters.map(async (adapter) => adapter.status()),
  );
  const providers = statusResults.map((result, index): ProviderStatus => {
    if (result.status === "fulfilled") return result.value;
    return {
      provider: adapters[index].provider,
      label: adapters[index].provider,
      availability: "temporarily_down",
      count: null,
      importModes: [],
      reason: "This provider's status did not load. Other providers remain available.",
      errorCode: "PROVIDER_STATUS_FAILED",
    };
  });
  const voices: LibraryVoice[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      voices.push(...result.value.voices);
      continue;
    }
    const index = results.indexOf(result);
    const provider = selected[index]?.provider;
    const status = providers.find((item) => item.provider === provider);
    if (status) {
      status.availability = "temporarily_down";
      status.reason = "This provider's library did not load. Other providers remain available.";
      status.errorCode = "PROVIDER_LIST_FAILED";
    }
  }

  const withImports = voices
    .map((voice) => annotateImportState(voice, input.catalogVoices))
    .filter((voice) => {
      if (input.query.imported === "imported") {
        return voice.importState.kind === "imported";
      }
      if (input.query.imported === "not_imported") {
        return voice.importState.kind !== "imported";
      }
      return true;
    });
  const offset = decodeCursor(input.query.cursor);
  const page = withImports.slice(offset, offset + input.query.limit);
  const nextOffset = offset + page.length;
  return {
    voices: page,
    providers,
    nextCursor: nextOffset < withImports.length ? encodeCursor(nextOffset) : null,
    total: withImports.length,
    fetchedAt: new Date().toISOString(),
  };
}

function annotateImportState(voice: LibraryVoice, catalog: VoiceRecord[]): LibraryVoice {
  const match = catalog.find((record) => {
    const provenance = record.providerConfig?.provenance;
    return (
      record.provider === voice.provider &&
      typeof provenance === "object" &&
      provenance !== null &&
      (provenance as Record<string, unknown>).externalId === voice.externalId
    );
  });
  if (!match) return voice;
  if (match.status === "processing" || match.status === "uploaded") {
    const importJobId = match.providerConfig?.importJobId;
    return {
      ...voice,
      importState: {
        kind: "importing",
        voiceId: match.id,
        voiceSlug: match.slug,
        jobId: typeof importJobId === "string" ? importJobId : undefined,
      },
    };
  }
  return {
    ...voice,
    importState: {
      kind: "imported",
      voiceId: match.id,
      voiceSlug: match.slug,
      voiceStatus: match.archivedAt ? "archived" : "active",
      importedAt: match.createdAt,
    },
  };
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = Number(Buffer.from(cursor, "base64url").toString("utf8"));
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}
