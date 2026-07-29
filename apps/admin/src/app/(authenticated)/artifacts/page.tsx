import type { ArtifactAssetSource } from "@kawabunga/db";
import { getArtifactAssetStore } from "@kawabunga/db";
import { ArtifactsGrid } from "@/components/artifacts-grid";

/** Summary shape consumed by ArtifactsGrid. Co-located with the page so
 * server hydration and client rendering can't drift apart. */
export type ArtifactAssetSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
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
  createdAt: string;
  updatedAt: string;
};

export const dynamic = "force-dynamic";

export default async function PropsPage() {
  const assets = await getArtifactAssetStore().list({ includeArchived: true });
  const props: ArtifactAssetSummary[] = assets.map((a) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    description: a.description,
    images: a.images,
    defaultWidthM: a.defaultWidthM,
    defaultHeightM: a.defaultHeightM,
    defaultRadiusM: a.defaultRadiusM,
    soundSource: a.soundSource,
    tags: a.tags,
    source: a.source,
    generationPrompt: a.generationPrompt,
    archivedAt: a.archivedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
  return <ArtifactsGrid propAssets={props} />;
}
