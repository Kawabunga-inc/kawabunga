import { NextResponse } from "next/server";
import { getVoiceStore, type VoiceProvider } from "@kawabunga/db";
import { voiceLibraryAdapters, listVoiceLibrary } from "@/lib/voice-library/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ provider: string; externalId: string }> },
) {
  const { provider, externalId } = await context.params;
  const adapter = voiceLibraryAdapters().find((item) => item.provider === provider);
  if (!adapter) {
    return NextResponse.json({ error: "Unknown voice-library provider." }, { status: 404 });
  }
  const voice = await adapter.get(externalId);
  if (!voice) {
    return NextResponse.json({ error: "Library voice not found." }, { status: 404 });
  }
  const catalogVoices = await getVoiceStore().list({ includeArchived: true });
  const page = await listVoiceLibrary({
    query: {
      provider: provider as VoiceProvider,
      search: externalId,
      sort: "curated",
      limit: 100,
    },
    catalogVoices,
    adapters: [adapter],
  });
  const annotated = page.voices.find((item) => item.externalId === externalId) ?? voice;
  return NextResponse.json({ voice: annotated });
}
