import { redirect } from "next/navigation";

/**
 * Legacy sandbox bookmarks return to the scene editor. Starting a scene is an
 * explicit POST through Run live, so a GET can never create a session.
 */
export default async function LegacySceneSandboxPage({
  params,
}: {
  params: Promise<{ sceneId: string }>;
}) {
  const { sceneId } = await params;
  redirect(`/scenes/${encodeURIComponent(sceneId)}`);
}
