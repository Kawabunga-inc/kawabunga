import type { PropAssetSource } from "@kawabunga/db";
import { getPropAssetStore } from "@kawabunga/db";
import { PropsGrid } from "@/components/props-grid";

/** Summary shape consumed by PropsGrid. Co-located with the page so
 * server hydration and client rendering can't drift apart. */
export type PropAssetSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  /** Generated sprite renditions: art-style key -> public URL. */
  images: Record<string, string>;
  defaultWidthM: number | null;
  defaultHeightM: number | null;
  defaultRadiusM: number | null;
  soundSource: boolean;
  tags: string[];
  source: PropAssetSource;
  generationPrompt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const dynamic = "force-dynamic";

export default async function PropsPage() {
  const assets = await getPropAssetStore().list({ includeArchived: true });
  const props: PropAssetSummary[] = assets.map((a) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    description: a.description,
    icon: a.icon,
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
  return <PropsGrid propAssets={props} />;
}
