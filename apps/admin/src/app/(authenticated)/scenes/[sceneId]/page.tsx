import { notFound } from "next/navigation";
import type {
  CharacterBrainModel,
  CharacterIdentity,
  EraConfig,
  SceneEdgeRecord,
  SceneNodeRecord,
} from "@kawabunga/db";
import {
  getAudioAssetStore,
  getCharacterStore,
  getPropAssetStore,
  getSceneGraphStore,
  getSceneStore,
} from "@kawabunga/db";
import { SceneEditor } from "@/components/scene-editor";

export const dynamic = "force-dynamic";

export type SceneRosterEntry = {
  nodeId: string;
  characterId: string;
  label: string;
};

export type SceneLibraryCharacter = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  image: string | null;
  thumbnailColor: string | null;
  identity: CharacterIdentity | null;
  brainModel: CharacterBrainModel | null;
  voiceId: string | null;
  // The character's era timeline — populates the knowledge-horizon era
  // picker on this character's scene node.
  eras: EraConfig[];
};

export type SceneGraphPayload = {
  nodes: SceneNodeRecord[];
  edges: SceneEdgeRecord[];
};

/** Compact audio-asset row for the canvas "add audio" picker + node
 * hydration. Slug doubles as the runtime track id. */
export type SceneLibrarySound = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  loopable: boolean;
  status: string;
  durationS: number | null;
};

/** Compact prop-asset row for the canvas tray + ref-backed prop
 * hydration (icon and footprint defaults; node data overrides). */
export type SceneLibraryProp = {
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
};

export default async function SceneDetailPage({
  params,
}: {
  params: Promise<{ sceneId: string }>;
}) {
  const { sceneId } = await params;

  const scene = await getSceneStore().getSceneById(sceneId);
  if (!scene) notFound();

  const [graph, library, soundLibrary, propLibrary] = await Promise.all([
    getSceneGraphStore().getGraph(sceneId),
    getCharacterStore().list(),
    getAudioAssetStore().list(),
    getPropAssetStore().list(),
  ]);

  const roster: SceneRosterEntry[] = graph.nodes
    .filter((n) => n.kind === "character" && n.refId)
    .map((n) => ({ nodeId: n.id, characterId: n.refId!, label: n.label }));

  const libraryCharacters: SceneLibraryCharacter[] = library.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    image: c.image,
    thumbnailColor: c.thumbnailColor,
    identity: c.identity,
    brainModel: c.brainModel,
    voiceId: c.voiceId,
    eras: c.eras ?? [],
  }));

  const librarySounds: SceneLibrarySound[] = soundLibrary.map((a) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    description: a.description,
    loopable: a.loopable,
    status: a.status,
    durationS: a.durationS,
  }));

  const libraryProps: SceneLibraryProp[] = propLibrary.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    icon: p.icon,
    images: p.images,
    defaultWidthM: p.defaultWidthM,
    defaultHeightM: p.defaultHeightM,
    defaultRadiusM: p.defaultRadiusM,
    soundSource: p.soundSource,
  }));

  return (
    <SceneEditor
      scene={{
        id: scene.id,
        title: scene.title,
        prompt: scene.prompt,
        status: scene.status,
        openingBeat: scene.definition.openingBeat,
        defaultAmbience: scene.definition.defaultAmbience,
        narratorVoiceId: scene.definition.narratorVoiceId,
        objective: scene.definition.objective,
        drive: scene.definition.drive,
        openingNarration: scene.definition.openingNarration,
        openingNarrationVariants: scene.definition.openingNarrationVariants,
        openingMode: scene.definition.openingMode,
        narrator: scene.definition.narrator,
        stage: scene.definition.stage,
      }}
      roster={roster}
      graph={graph}
      libraryCharacters={libraryCharacters}
      librarySounds={librarySounds}
      libraryProps={libraryProps}
    />
  );
}
