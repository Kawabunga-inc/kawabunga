import { after, NextResponse } from "next/server";
import {
  normalizeImportError,
  retryVoiceImport,
  runVoiceImport,
} from "@/lib/voice-library/imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  try {
    const job = await retryVoiceImport(jobId);
    after(async () => {
      await runVoiceImport(job.id).catch((error) => {
        console.error(`[voice-library/import] retry job ${job.id} failed`, error);
      });
    });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    const normalized = normalizeImportError(error);
    return NextResponse.json(
      { error: normalized.message, code: normalized.code },
      { status: normalized.status },
    );
  }
}
