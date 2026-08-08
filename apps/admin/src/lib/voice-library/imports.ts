import {
  getVoiceLibraryStore,
  getVoiceStore,
  type VoiceImportJobRecord,
  type VoiceImportPhase,
  type VoiceRecord,
} from "@kawabunga/db";
import {
  getPocketTtsAuthHeaders,
  getPocketTtsBaseUrl,
} from "@kawabunga/engine";
import { auth } from "@/lib/auth";
import {
  downloadSourceBytes,
  removeVoiceObjects,
  uploadEmbedding,
  uploadSource,
} from "@/lib/voices-storage";
import { regeneratePreviewForVoice } from "@/lib/voices-preview";
import { invalidateVoicesList } from "@/lib/voices-cache";
import { getPocketLibraryVoice } from "./pocket-manifest";
import type {
  DuplicateVoicePayload,
  LibraryVoice,
  VoiceImportConfig,
} from "./types";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const SOURCE_TIMEOUT_MS = 30_000;
const EXPORT_TIMEOUT_MS = 180_000;

export type VoiceLibraryErrorCode =
  | "VOICE_ALREADY_IMPORTED"
  | "SLUG_TAKEN"
  | "INVALID_SLUG"
  | "LICENSE_BLOCKED"
  | "LICENSE_ACCEPTANCE_REQUIRED"
  | "VOICE_NOT_FOUND"
  | "PROVIDER_UNAVAILABLE"
  | "SOURCE_FETCH_FAILED"
  | "SOURCE_TOO_LARGE"
  | "POCKET_TIMEOUT"
  | "POCKET_EXPORT_FAILED"
  | "STORAGE_FAILED"
  | "JOB_NOT_FOUND"
  | "JOB_NOT_RETRYABLE";

export class VoiceLibraryImportError extends Error {
  constructor(
    readonly code: VoiceLibraryErrorCode,
    message: string,
    readonly status: number = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export class VoiceLibraryDuplicateError extends VoiceLibraryImportError {
  constructor(readonly duplicate: DuplicateVoicePayload) {
    super(
      "VOICE_ALREADY_IMPORTED",
      "This voice is already in your catalog.",
      409,
      duplicate as unknown as Record<string, unknown>,
    );
  }
}

export async function createVoiceImport(
  config: VoiceImportConfig,
): Promise<VoiceImportJobRecord> {
  if (config.provider !== "pocket_tts") {
    throw new VoiceLibraryImportError(
      "PROVIDER_UNAVAILABLE",
      "Pocket is the only browseable library adapter in this release.",
      409,
    );
  }
  const libraryVoice = getPocketLibraryVoice(config.externalId);
  if (!libraryVoice) {
    throw new VoiceLibraryImportError(
      "VOICE_NOT_FOUND",
      "This Pocket voice is no longer available in the source manifest.",
      404,
    );
  }
  validateLicense(libraryVoice, config.licenseAccepted);

  const voices = await getVoiceStore().list({ includeArchived: true });
  const externalMatch = voices.find((voice) =>
    hasExternalIdentity(voice, config.provider, config.externalId),
  );
  if (externalMatch && !config.allowDuplicate) {
    throw new VoiceLibraryDuplicateError({
      code: "VOICE_ALREADY_IMPORTED",
      existing: {
        id: externalMatch.id,
        slug: externalMatch.slug,
        status: externalMatch.archivedAt ? "archived" : "active",
        boundCharacterCount: externalMatch.boundCharacterCount ?? 0,
        importedAt: externalMatch.createdAt,
      },
    });
  }
  const slugMatch = voices.find((voice) => voice.slug === config.slug);
  if (slugMatch) {
    throw new VoiceLibraryImportError(
      "SLUG_TAKEN",
      `The slug /${config.slug} is already used by ${slugMatch.name}.`,
      409,
      { voiceId: slugMatch.id, voiceSlug: slugMatch.slug },
    );
  }

  const session = await auth().catch(() => null);
  const createdBy = session?.user?.id ?? null;
  const store = getVoiceLibraryStore();
  const job = await store.create({
    provider: config.provider,
    externalId: config.externalId,
    voiceSlug: config.slug,
    createdBy,
    config: {
      ...config,
      description: libraryVoice.description ?? null,
      sourceUrl: libraryVoice.source.previewUrl ?? libraryVoice.previewUrl,
      sourceLabel: libraryVoice.source.label,
      sourcePageUrl: libraryVoice.source.url ?? null,
      sourceChecksum: libraryVoice.source.checksum ?? null,
      license: libraryVoice.license ?? null,
      importMode: libraryVoice.importMode,
      model: libraryVoice.model ?? null,
      duplicateOf: externalMatch?.id ?? null,
    },
  });

  try {
    const voice = await getVoiceStore().create({
      slug: config.slug,
      name: config.displayName,
      description: libraryVoice.description ?? null,
      provider: config.provider,
      providerConfig: {
        modelId: libraryVoice.model ?? "kyutai-tts",
        importJobId: job.id,
        provenance: {
          provider: config.provider,
          externalId: config.externalId,
          sourceUrl: libraryVoice.source.url ?? null,
          sourceAudioUrl: libraryVoice.source.previewUrl ?? libraryVoice.previewUrl ?? null,
          sourceLabel: libraryVoice.source.label,
          sourceChecksum: libraryVoice.source.checksum ?? null,
          license: libraryVoice.license ?? null,
          attribution: libraryVoice.license?.attribution ?? null,
          importMode: libraryVoice.importMode,
          duplicateOf: externalMatch?.id ?? null,
        },
      },
      tags: config.tags,
      language: config.language,
      gender: config.gender ?? libraryVoice.gender ?? null,
      license: libraryVoice.license?.name ?? null,
      attribution: libraryVoice.license?.attribution ?? null,
      status: "uploaded",
      createdBy,
    });
    invalidateVoicesList();
    return (
      (await store.update(job.id, {
        voiceId: voice.id,
        voiceSlug: voice.slug,
      })) ?? job
    );
  } catch (error) {
    await store.remove(job.id).catch(() => false);
    throw error;
  }
}

export async function runVoiceImport(jobId: string): Promise<void> {
  const jobs = getVoiceLibraryStore();
  const voices = getVoiceStore();
  const job = await jobs.get(jobId);
  if (!job) {
    throw new VoiceLibraryImportError("JOB_NOT_FOUND", "Import job not found.", 404);
  }
  const voice = job.voiceId ? await voices.getById(job.voiceId) : null;
  if (!voice) {
    throw new VoiceLibraryImportError(
      "JOB_NOT_FOUND",
      "The catalog draft for this import no longer exists.",
      404,
    );
  }

  await jobs.update(job.id, {
    status: "processing",
    errorCode: null,
    errorMessage: null,
  });
  await voices.update(voice.id, { status: "processing", statusError: null });
  invalidateVoicesList();

  try {
    const config = job.config;
    const sourceUrl = stringValue(config.sourceUrl);
    if (!sourceUrl) {
      throw new VoiceLibraryImportError(
        "SOURCE_FETCH_FAILED",
        "The Pocket manifest did not provide a source recording.",
        502,
      );
    }

    let sourcePath = voice.sourcePath;
    let sourceBytes: Buffer;
    let mimeType = "audio/wav";
    if (!sourcePath) {
      await setPhase(job.id, "fetching_source", []);
      const downloaded = await downloadManifestSource(sourceUrl);
      sourceBytes = downloaded.bytes;
      mimeType = downloaded.mimeType;

      await setPhase(job.id, "preparing_voice", ["fetching_source"]);
      const extension = extensionForMime(mimeType);
      sourcePath = `${voice.id}.${extension}`;
      try {
        await uploadSource(sourcePath, sourceBytes, mimeType);
      } catch (error) {
        throw new VoiceLibraryImportError(
          "STORAGE_FAILED",
          `The source recording could not be stored: ${(error as Error).message}`,
          502,
        );
      }
      await voices.update(voice.id, { sourcePath });
    } else {
      sourceBytes = await downloadSourceBytes(sourcePath);
      mimeType = mimeForPath(sourcePath);
    }

    await setPhase(job.id, "extracting_embedding", [
      "fetching_source",
      "preparing_voice",
    ]);
    const embedding = await exportPocketVoice(sourceBytes, mimeType);

    await setPhase(job.id, "storing_assets", [
      "fetching_source",
      "preparing_voice",
      "extracting_embedding",
    ]);
    const embeddingPath = `${voice.slug}.safetensors`;
    try {
      await uploadEmbedding(embeddingPath, embedding);
    } catch (error) {
      throw new VoiceLibraryImportError(
        "STORAGE_FAILED",
        `The voice embedding could not be stored: ${(error as Error).message}`,
        502,
      );
    }

    await setPhase(job.id, "registering_voice", [
      "fetching_source",
      "preparing_voice",
      "extracting_embedding",
      "storing_assets",
    ]);
    const readyVoice = await voices.update(voice.id, {
      status: "ready",
      statusError: null,
      sourcePath,
      embeddingPath,
    });
    if (readyVoice) {
      await regeneratePreviewForVoice(readyVoice).catch((error) => {
        console.warn(
          `[voice-library/import] preview generation skipped for ${readyVoice.slug}: ${(error as Error).message}`,
        );
      });
    }

    await jobs.update(job.id, {
      status: "succeeded",
      phase: "ready",
      completedPhases: [
        "fetching_source",
        "preparing_voice",
        "extracting_embedding",
        "storing_assets",
        "registering_voice",
        "ready",
      ],
      errorCode: null,
      errorMessage: null,
    });
    invalidateVoicesList();
  } catch (error) {
    const normalized = normalizeImportError(error);
    await jobs.update(job.id, {
      status: "failed",
      errorCode: normalized.code,
      errorMessage: normalized.message,
    });
    await voices.update(voice.id, {
      status: "failed",
      statusError: `${normalized.code}: ${normalized.message}`,
    });
    invalidateVoicesList();
  }
}

export async function retryVoiceImport(jobId: string): Promise<VoiceImportJobRecord> {
  const store = getVoiceLibraryStore();
  const job = await store.get(jobId);
  if (!job) {
    throw new VoiceLibraryImportError("JOB_NOT_FOUND", "Import job not found.", 404);
  }
  if (job.status !== "failed") {
    throw new VoiceLibraryImportError(
      "JOB_NOT_RETRYABLE",
      "Only a failed import can be retried.",
      409,
    );
  }
  return (
    (await store.update(jobId, {
      status: "queued",
      phase: job.completedPhases.includes("preparing_voice")
        ? "extracting_embedding"
        : "fetching_source",
      errorCode: null,
      errorMessage: null,
    })) ?? job
  );
}

export async function discardVoiceImport(jobId: string): Promise<void> {
  const jobs = getVoiceLibraryStore();
  const voices = getVoiceStore();
  const job = await jobs.get(jobId);
  if (!job) {
    throw new VoiceLibraryImportError("JOB_NOT_FOUND", "Import job not found.", 404);
  }
  if (job.voiceId) {
    const voice = await voices.getById(job.voiceId);
    if (voice) {
      await removeVoiceObjects(voice).catch(() => undefined);
      await voices.remove(voice.id);
    }
  }
  await jobs.remove(job.id);
  invalidateVoicesList();
}

export function normalizeImportError(error: unknown): VoiceLibraryImportError {
  if (error instanceof VoiceLibraryImportError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new VoiceLibraryImportError("POCKET_EXPORT_FAILED", message, 502);
}

function validateLicense(voice: LibraryVoice, accepted: boolean): void {
  if (voice.license?.commercialUse === false) {
    throw new VoiceLibraryImportError(
      "LICENSE_BLOCKED",
      "This voice is licensed for non-commercial use and cannot be imported into the production catalog.",
      409,
    );
  }
  if (
    (voice.license?.commercialUse === undefined ||
      voice.license?.attributionRequired === true) &&
    !accepted
  ) {
    throw new VoiceLibraryImportError(
      "LICENSE_ACCEPTANCE_REQUIRED",
      "Review and confirm the voice licence before importing.",
      400,
    );
  }
}

function hasExternalIdentity(
  voice: VoiceRecord,
  provider: string,
  externalId: string,
): boolean {
  const provenance = voice.providerConfig?.provenance;
  return (
    voice.provider === provider &&
    typeof provenance === "object" &&
    provenance !== null &&
    (provenance as Record<string, unknown>).externalId === externalId
  );
}

async function setPhase(
  jobId: string,
  phase: VoiceImportPhase,
  completedPhases: VoiceImportPhase[],
): Promise<void> {
  await getVoiceLibraryStore().update(jobId, {
    status: "processing",
    phase,
    completedPhases,
  });
}

async function downloadManifestSource(
  sourceUrl: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  assertAllowedSource(sourceUrl);
  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new VoiceLibraryImportError(
      "SOURCE_FETCH_FAILED",
      `The source recording could not be downloaded: ${(error as Error).message}`,
      502,
    );
  }
  if (!response.ok) {
    throw new VoiceLibraryImportError(
      "SOURCE_FETCH_FAILED",
      `The source recording returned HTTP ${response.status}.`,
      502,
    );
  }
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_SOURCE_BYTES) {
    throw new VoiceLibraryImportError(
      "SOURCE_TOO_LARGE",
      "The source recording is larger than the 20 MB import limit.",
      413,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_SOURCE_BYTES) {
    throw new VoiceLibraryImportError(
      "SOURCE_TOO_LARGE",
      "The source recording is larger than the 20 MB import limit.",
      413,
    );
  }
  return {
    bytes,
    mimeType: response.headers.get("content-type")?.split(";")[0] || "audio/wav",
  };
}

function assertAllowedSource(sourceUrl: string): void {
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:" || url.hostname !== "huggingface.co") {
    throw new VoiceLibraryImportError(
      "SOURCE_FETCH_FAILED",
      "The source host is not approved for library imports.",
      400,
    );
  }
}

async function exportPocketVoice(bytes: Buffer, mimeType: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(`${getPocketTtsBaseUrl()}/export-voice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getPocketTtsAuthHeaders(),
      },
      body: JSON.stringify({
        audioBase64: bytes.toString("base64"),
        mimeType,
      }),
      signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new VoiceLibraryImportError(
      timedOut ? "POCKET_TIMEOUT" : "POCKET_EXPORT_FAILED",
      timedOut
        ? "Pocket voice extraction timed out. Retrying resumes from the stored source."
        : `Pocket voice extraction failed: ${(error as Error).message}`,
      504,
    );
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new VoiceLibraryImportError(
      response.status === 504 ? "POCKET_TIMEOUT" : "POCKET_EXPORT_FAILED",
      `Pocket voice extraction returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}.`,
      response.status === 504 ? 504 : 502,
    );
  }
  const embedding = Buffer.from(await response.arrayBuffer());
  if (embedding.length === 0) {
    throw new VoiceLibraryImportError(
      "POCKET_EXPORT_FAILED",
      "Pocket returned an empty voice embedding.",
      502,
    );
  }
  return embedding;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("webm")) return "webm";
  return "wav";
}

function mimeForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "ogg") return "audio/ogg";
  if (extension === "webm") return "audio/webm";
  return "audio/wav";
}
