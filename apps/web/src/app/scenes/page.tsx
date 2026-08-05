import { getSceneGraphStore, getSceneSessionStore, getSceneStore } from "@kawabunga/db";
import { DeepTheme } from "@/components/deep-theme";
import { ScenesBrowseView, type BrowseSceneCard } from "@/components/scenes-browse-view";
import { auth } from "@/lib/auth";
import {
  isNewScene,
  sceneHaloVariant,
  sceneHook,
  selectBrowseScenes,
} from "@/lib/consumer-scenes";

export const dynamic = "force-dynamic";

export default async function ScenesBrowsePage() {
  const [viewer, allScenes] = await Promise.all([auth(), getSceneStore().listScenes()]);
  const scenes = selectBrowseScenes(allScenes);
  const userId = viewer?.user?.id;
  const [graphs, visits] = await Promise.all([
    Promise.all(scenes.map((scene) => getSceneGraphStore().getGraph(scene.id))),
    userId ? getSceneSessionStore().listSessionsForUser(userId, 1_000) : Promise.resolve([]),
  ]);
  const visitedSceneIds = new Set(visits.flatMap((visit) => visit.sceneId ? [visit.sceneId] : []));
  const cards: BrowseSceneCard[] = scenes.map((scene, index) => ({
    id: scene.id,
    title: scene.title,
    hook: sceneHook(scene),
    characterCount: graphs[index]?.nodes.filter((node) => node.kind === "character").length ?? 0,
    narratorEnabled: scene.definition.narrator !== "off",
    isNew: isNewScene(scene),
    visited: visitedSceneIds.has(scene.id),
    haloVariant: sceneHaloVariant(scene.id),
  }));
  const viewerInitial =
    viewer?.user?.name?.trim().charAt(0) || viewer?.user?.email?.trim().charAt(0) || "";

  return (
    <>
      <DeepTheme />
      <ScenesBrowseView scenes={cards} viewerInitial={viewerInitial} />
    </>
  );
}
