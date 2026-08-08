import { NextRequest, NextResponse } from "next/server";
import { getVoiceStore } from "@kawabunga/db";
import { isValidVoiceSlug } from "@/lib/voice-slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim().toLowerCase() ?? "";
  if (!isValidVoiceSlug(slug)) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }
  const existing = await getVoiceStore().getBySlug(slug);
  return NextResponse.json({
    available: !existing,
    reason: existing ? "taken" : null,
    existing: existing ? { id: existing.id, slug: existing.slug, name: existing.name } : null,
  });
}
