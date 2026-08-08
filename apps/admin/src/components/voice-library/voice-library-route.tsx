import { getVoiceStore } from "@kawabunga/db";
import { listVoiceLibrary } from "@/lib/voice-library/adapters";
import { parseVoiceLibraryQuery } from "@/lib/voice-library/query";
import { VoiceLibraryClient } from "./voice-library-client";

export async function VoiceLibraryRoute({
  searchParams,
  selected,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  selected?: { provider: string; externalId: string };
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  const query = parseVoiceLibraryQuery(params);
  const catalogVoices = await getVoiceStore().list({ includeArchived: true });
  const page = await listVoiceLibrary({ query, catalogVoices });
  return (
    <VoiceLibraryClient
      initialPage={page}
      catalogCount={catalogVoices.filter((voice) => !voice.archivedAt).length}
      initialQuery={query}
      selected={selected}
    />
  );
}
