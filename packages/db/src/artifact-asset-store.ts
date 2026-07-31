import { desc, eq, isNull } from "drizzle-orm";
import { getDb } from "./client";
import { retryRead } from "./retry";
import { artifactAssetsTable } from "./schema";

// How the asset entered the library. "generated" rows come from the
// scene editor's set-generation flow (an accepted proposal).
export type ArtifactAssetSource = "manual" | "generated";

export interface ArtifactAssetRecord {
  id: string;
  slug: string;
  name: string;
  /** LLM-facing description — what set-generation reads to decide reuse. */
  description: string | null;
  /** Key into the admin app's top-down icon catalog. */
  icon: string | null;
  /** Generated sprite renditions: art-style key -> public URL. */
  images: Record<string, string>;
  defaultWidthM: number | null;
  defaultHeightM: number | null;
  defaultRadiusM: number | null;
  soundSource: boolean;
  tags: string[];
  source: ArtifactAssetSource;
  generationPrompt: string | null;
  archivedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateArtifactAssetInput {
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  images?: Record<string, string>;
  defaultWidthM?: number | null;
  defaultHeightM?: number | null;
  defaultRadiusM?: number | null;
  soundSource?: boolean;
  tags?: string[];
  source?: ArtifactAssetSource;
  generationPrompt?: string | null;
  createdBy?: string | null;
}

export interface UpdateArtifactAssetInput {
  name?: string;
  description?: string | null;
  icon?: string | null;
  images?: Record<string, string>;
  defaultWidthM?: number | null;
  defaultHeightM?: number | null;
  defaultRadiusM?: number | null;
  soundSource?: boolean;
  tags?: string[];
  archivedAt?: Date | string | null;
  updatedBy?: string | null;
}

export interface ListArtifactAssetsOptions {
  /** Include soft-deleted (archived) assets. Default false. */
  includeArchived?: boolean;
}

function requireDb() {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required for the prop asset store");
  return db;
}

function isMissingTableError(error: unknown) {
  const code =
    (error as { code?: string })?.code ??
    (error as { cause?: { code?: string } })?.cause?.code;
  return code === "42P01";
}

// Missing table or transient read failure → reads degrade to empty
// instead of throwing, so pages render before `db:push` lands.
function isRecoverableReadError(error: unknown) {
  if (isMissingTableError(error)) return true;
  const message =
    (error as { message?: string })?.message ??
    (error as { cause?: { message?: string } })?.cause?.message ??
    "";
  return message.includes("Failed query:");
}

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function toIsoNullable(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return toIso(d);
}

function normalize(row: typeof artifactAssetsTable.$inferSelect): ArtifactAssetRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    images: (row.images as Record<string, string> | null) ?? {},
    defaultWidthM: row.defaultWidthM,
    defaultHeightM: row.defaultHeightM,
    defaultRadiusM: row.defaultRadiusM,
    soundSource: row.soundSource ?? false,
    tags: row.tags ?? [],
    source: (row.source as ArtifactAssetSource) ?? "manual",
    generationPrompt: row.generationPrompt,
    archivedAt: toIsoNullable(row.archivedAt),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export interface ArtifactAssetStore {
  list(options?: ListArtifactAssetsOptions): Promise<ArtifactAssetRecord[]>;
  getById(id: string): Promise<ArtifactAssetRecord | null>;
  getBySlug(slug: string): Promise<ArtifactAssetRecord | null>;
  create(input: CreateArtifactAssetInput): Promise<ArtifactAssetRecord>;
  update(id: string, input: UpdateArtifactAssetInput): Promise<ArtifactAssetRecord | null>;
  /** Soft-delete — sets archivedAt. Scene nodes referencing the asset keep
   * working; the library UI filters it out. */
  archive(id: string, archivedBy?: string | null): Promise<ArtifactAssetRecord | null>;
  unarchive(id: string, unarchivedBy?: string | null): Promise<ArtifactAssetRecord | null>;
  /** Hard delete. Prefer `archive` — scene nodes hold refIds to this row. */
  remove(id: string): Promise<boolean>;
}

function neonStore(): ArtifactAssetStore {
  return {
    async list({ includeArchived = false }: ListArtifactAssetsOptions = {}) {
      try {
        const rows = await retryRead(() => {
          const q = requireDb()
            .select()
            .from(artifactAssetsTable)
            .orderBy(desc(artifactAssetsTable.createdAt));
          return includeArchived
            ? q
            : q.where(isNull(artifactAssetsTable.archivedAt));
        });
        return rows.map(normalize);
      } catch (error) {
        if (isRecoverableReadError(error)) return [];
        throw error;
      }
    },

    async getById(id) {
      try {
        const [row] = await retryRead(() =>
          requireDb()
            .select()
            .from(artifactAssetsTable)
            .where(eq(artifactAssetsTable.id, id))
            .limit(1),
        );
        return row ? normalize(row) : null;
      } catch (error) {
        if (isRecoverableReadError(error)) return null;
        throw error;
      }
    },

    async getBySlug(slug) {
      try {
        const [row] = await retryRead(() =>
          requireDb()
            .select()
            .from(artifactAssetsTable)
            .where(eq(artifactAssetsTable.slug, slug))
            .limit(1),
        );
        return row ? normalize(row) : null;
      } catch (error) {
        if (isRecoverableReadError(error)) return null;
        throw error;
      }
    },

    async create(input) {
      const db = requireDb();
      const now = new Date();
      const [row] = await db
        .insert(artifactAssetsTable)
        .values({
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          icon: input.icon ?? null,
          images: input.images ?? {},
          defaultWidthM: input.defaultWidthM ?? null,
          defaultHeightM: input.defaultHeightM ?? null,
          defaultRadiusM: input.defaultRadiusM ?? null,
          soundSource: input.soundSource ?? false,
          tags: input.tags ?? [],
          source: input.source ?? "manual",
          generationPrompt: input.generationPrompt ?? null,
          createdBy: input.createdBy ?? null,
          updatedBy: input.createdBy ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return normalize(row);
    },

    async update(id, input) {
      const db = requireDb();
      const values: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(input)) {
        if (v !== undefined) values[k] = v;
      }
      const [row] = await db
        .update(artifactAssetsTable)
        .set(values)
        .where(eq(artifactAssetsTable.id, id))
        .returning();
      return row ? normalize(row) : null;
    },

    async archive(id, archivedBy = null) {
      return this.update(id, { archivedAt: new Date(), updatedBy: archivedBy });
    },

    async unarchive(id, unarchivedBy = null) {
      return this.update(id, { archivedAt: null, updatedBy: unarchivedBy });
    },

    async remove(id) {
      const db = requireDb();
      const result = await db
        .delete(artifactAssetsTable)
        .where(eq(artifactAssetsTable.id, id))
        .returning();
      return result.length > 0;
    },
  };
}

let _store: ArtifactAssetStore | null = null;

export function getArtifactAssetStore(): ArtifactAssetStore {
  if (!_store) _store = neonStore();
  return _store;
}
