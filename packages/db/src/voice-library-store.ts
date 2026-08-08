import { desc, eq, and } from "drizzle-orm";
import { getDb } from "./client";
import { voiceImportJobsTable } from "./schema";

export type VoiceImportJobStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type VoiceImportPhase =
  | "fetching_source"
  | "preparing_voice"
  | "extracting_embedding"
  | "storing_assets"
  | "registering_voice"
  | "ready";

export interface VoiceImportJobRecord {
  id: string;
  provider: string;
  externalId: string;
  voiceId: string | null;
  voiceSlug: string | null;
  status: VoiceImportJobStatus;
  phase: VoiceImportPhase;
  completedPhases: VoiceImportPhase[];
  errorCode: string | null;
  errorMessage: string | null;
  config: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CreateVoiceImportJobInput {
  provider: string;
  externalId: string;
  voiceId?: string | null;
  voiceSlug?: string | null;
  config?: Record<string, unknown>;
  createdBy?: string | null;
}

export interface UpdateVoiceImportJobInput {
  voiceId?: string | null;
  voiceSlug?: string | null;
  status?: VoiceImportJobStatus;
  phase?: VoiceImportPhase;
  completedPhases?: VoiceImportPhase[];
  errorCode?: string | null;
  errorMessage?: string | null;
  config?: Record<string, unknown>;
}

export interface VoiceLibraryStore {
  create(input: CreateVoiceImportJobInput): Promise<VoiceImportJobRecord>;
  get(id: string): Promise<VoiceImportJobRecord | null>;
  listByExternal(provider: string, externalId: string): Promise<VoiceImportJobRecord[]>;
  update(id: string, input: UpdateVoiceImportJobInput): Promise<VoiceImportJobRecord | null>;
  remove(id: string): Promise<boolean>;
}

function db() {
  const value = getDb();
  if (!value) throw new Error("DATABASE_URL is required for the voice library store");
  return value;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalize(
  row: typeof voiceImportJobsTable.$inferSelect,
): VoiceImportJobRecord {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.externalId,
    voiceId: row.voiceId,
    voiceSlug: row.voiceSlug,
    status: row.status as VoiceImportJobStatus,
    phase: row.phase as VoiceImportPhase,
    completedPhases: (row.completedPhases ?? []) as VoiceImportPhase[],
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    config: (row.config as Record<string, unknown> | null) ?? {},
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function neonVoiceLibraryStore(): VoiceLibraryStore {
  return {
    async create(input) {
      const now = new Date();
      const [row] = await db()
        .insert(voiceImportJobsTable)
        .values({
          provider: input.provider,
          externalId: input.externalId,
          voiceId: input.voiceId ?? null,
          voiceSlug: input.voiceSlug ?? null,
          config: input.config ?? {},
          createdBy: input.createdBy ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return normalize(row);
    },

    async get(id) {
      const [row] = await db()
        .select()
        .from(voiceImportJobsTable)
        .where(eq(voiceImportJobsTable.id, id))
        .limit(1);
      return row ? normalize(row) : null;
    },

    async listByExternal(provider, externalId) {
      const rows = await db()
        .select()
        .from(voiceImportJobsTable)
        .where(
          and(
            eq(voiceImportJobsTable.provider, provider),
            eq(voiceImportJobsTable.externalId, externalId),
          ),
        )
        .orderBy(desc(voiceImportJobsTable.createdAt));
      return rows.map(normalize);
    },

    async update(id, input) {
      const values: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) values[key] = value;
      }
      const [row] = await db()
        .update(voiceImportJobsTable)
        .set(values)
        .where(eq(voiceImportJobsTable.id, id))
        .returning();
      return row ? normalize(row) : null;
    },

    async remove(id) {
      const rows = await db()
        .delete(voiceImportJobsTable)
        .where(eq(voiceImportJobsTable.id, id))
        .returning({ id: voiceImportJobsTable.id });
      return rows.length > 0;
    },
  };
}

let singleton: VoiceLibraryStore | null = null;

export function getVoiceLibraryStore(): VoiceLibraryStore {
  singleton ??= neonVoiceLibraryStore();
  return singleton;
}
