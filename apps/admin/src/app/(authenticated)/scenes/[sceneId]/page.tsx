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
  getArtifactAssetStore,
  getSceneGraphStore,
  getSceneStore,
} from "@kawabunga/db";
import { SceneEditor } from "@/components/scene-editor";
import { SceneOnAirRefresh } from "@/components/scene-on-air-refresh";
import { getSceneOnAirData } from "@/lib/scene-on-air-data";

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
 * hydration (sprite renditions and footprint defaults; node data overrides). */
export type SceneLibraryArtifact = {
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
};

export default async function SceneDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sceneId: string }>;
  searchParams: Promise<{ onAirSession?: string | string[] }>;
}) {
  const { sceneId } = await params;
  const query = await searchParams;
  const requestedSessionId =
    typeof query.onAirSession === "string" ? query.onAirSession : null;

  const scene = await getSceneStore().getSceneById(sceneId);
  if (!scene) notFound();

  const [graph, library, soundLibrary, artifactLibrary, onAir] = await Promise.all([
    getSceneGraphStore().getGraph(sceneId),
    getCharacterStore().list(),
    getAudioAssetStore().list(),
    getArtifactAssetStore().list(),
    getSceneOnAirData(sceneId, requestedSessionId),
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

  const libraryArtifacts: SceneLibraryArtifact[] = artifactLibrary.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    images: p.images,
    defaultWidthM: p.defaultWidthM,
    defaultHeightM: p.defaultHeightM,
    defaultRadiusM: p.defaultRadiusM,
    soundSource: p.soundSource,
  }));

  // Graph nodes carry library UUIDs while runtime presence/turns carry slugs.
  // Resolve both character and sound joins once on the server for the overlay.
  const characterSlugById = new Map(libraryCharacters.map((character) => [character.id, character.slug]));
  const soundSlugById = new Map(librarySounds.map((sound) => [sound.id, sound.slug]));
  const nodeCharacterSlugs = Object.fromEntries(
    graph.nodes.flatMap((node) => {
      const slug = node.kind === "character" && node.refId
        ? characterSlugById.get(node.refId)
        : null;
      return slug ? [[node.id, slug]] : [];
    }),
  );
  const soundNodeSlugs = Object.fromEntries(
    graph.nodes.flatMap((node) => {
      const slug =
        (node.kind === "audio" || node.kind === "ambience") && node.refId
          ? soundSlugById.get(node.refId)
          : null;
      return slug ? [[node.id, slug]] : [];
    }),
  );

  return (
    <>
      <SceneOnAirRefresh activeCount={onAir.candidates.length} />
      <SceneEditor
        consumerBaseUrl={process.env.NEXT_PUBLIC_WEB_BASE_URL ?? "http://localhost:3000"}
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
          initiative: scene.definition.initiative,
          userRole: scene.definition.userRole,
          userCharacter: scene.definition.userCharacter,
          userDirector: scene.definition.userDirector,
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
        libraryArtifacts={libraryArtifacts}
        onAir={{
          ...onAir,
          nodeCharacterSlugs,
          soundNodeSlugs,
          arcLength: graph.nodes.filter((node) => node.kind === "event").length,
        }}
      />
    </>
  );
}
