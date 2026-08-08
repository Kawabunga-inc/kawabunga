import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createVoiceImport,
  normalizeImportError,
  runVoiceImport,
} from "@/lib/voice-library/imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  provider: z.literal("pocket_tts"),
  externalId: z.string().min(1),
  displayName: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
  language: z.string().trim().min(1),
  gender: z.string().trim().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  licenseAccepted: z.boolean(),
  allowDuplicate: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const input = bodySchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    const issue = input.error.issues[0];
    const code = issue.path[0] === "slug" ? "INVALID_SLUG" : "INVALID_IMPORT_CONFIG";
    return NextResponse.json(
      {
        error: `${issue.path.join(".") || "body"}: ${issue.message}`,
        code,
      },
      { status: 400 },
    );
  }
  try {
    const job = await createVoiceImport(input.data);
    after(async () => {
      await runVoiceImport(job.id).catch((error) => {
        console.error(`[voice-library/import] job ${job.id} failed`, error);
      });
    });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    const normalized = normalizeImportError(error);
    return NextResponse.json(
      {
        error: normalized.message,
        code: normalized.code,
        ...(normalized.details ?? {}),
      },
      { status: normalized.status },
    );
  }
}
