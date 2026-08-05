import { notFound, redirect } from "next/navigation";
import { getSceneSessionStore, getSceneStore } from "@kawabunga/db";
import { DeepTheme } from "@/components/deep-theme";
import { auth } from "@/lib/auth";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export default async function SceneSessionStubPage({
  params,
}: {
  params: Promise<{ sceneId: string; sessionId: string }>;
}) {
  const { sceneId, sessionId } = await params;
  const viewer = await auth();
  if (!viewer?.user?.id) {
    redirect(
      `/auth/signin?callbackUrl=${encodeURIComponent(`/scenes/${sceneId}/session/${sessionId}`)}`,
    );
  }

  const [scene, session] = await Promise.all([
    getSceneStore().getSceneById(sceneId),
    getSceneSessionStore().getSession(sessionId),
  ]);
  if (
    !scene ||
    !session ||
    session.sceneId !== sceneId ||
    session.userId !== viewer.user.id
  ) {
    notFound();
  }

  return (
    <main className={styles.stub} data-theme="deep">
      <DeepTheme />
      <div className={styles.stubInner}>
        <div className={styles.stubEmber} aria-hidden="true" />
        <p className={styles.stubKicker}>A living scene</p>
        <h1>The scene is being prepared</h1>
        <p>{scene.title} will begin here.</p>
      </div>
    </main>
  );
}
