import { notFound } from "next/navigation";
import { VoiceLibraryRoute } from "@/components/voice-library/voice-library-route";
import { getPocketLibraryVoice } from "@/lib/voice-library/pocket-manifest";

export const dynamic = "force-dynamic";

export default async function VoiceLibraryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string; externalId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const selected = await params;
  if (
    selected.provider !== "pocket_tts" ||
    !getPocketLibraryVoice(selected.externalId)
  ) {
    notFound();
  }
  return <VoiceLibraryRoute searchParams={searchParams} selected={selected} />;
}
