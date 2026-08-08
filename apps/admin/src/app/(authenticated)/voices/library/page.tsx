import { VoiceLibraryRoute } from "@/components/voice-library/voice-library-route";

export const dynamic = "force-dynamic";

export default function VoiceLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <VoiceLibraryRoute searchParams={searchParams} />;
}
