import { NextRequest, NextResponse } from "next/server";
import { getVoiceStore } from "@kawabunga/db";
import { listVoiceLibrary } from "@/lib/voice-library/adapters";
import { parseVoiceLibraryQuery } from "@/lib/voice-library/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = parseVoiceLibraryQuery(request.nextUrl.searchParams);
  const catalogVoices = await getVoiceStore().list({ includeArchived: true });
  const page = await listVoiceLibrary({ query, catalogVoices });
  return NextResponse.json(page);
}
