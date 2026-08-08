import { NextResponse } from "next/server";
import { getVoiceLibraryStore } from "@kawabunga/db";
import {
  discardVoiceImport,
  normalizeImportError,
} from "@/lib/voice-library/imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const job = await getVoiceLibraryStore().get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Import job not found.", code: "JOB_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ job });
}
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  try {
    await discardVoiceImport(jobId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const normalized = normalizeImportError(error);
    return NextResponse.json(
      { error: normalized.message, code: normalized.code },
      { status: normalized.status },
    );
  }
}
