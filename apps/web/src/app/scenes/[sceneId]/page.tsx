import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCharacterStore,
  getSceneGraphStore,
  getSceneSessionStore,
  getSceneStore,
} from "@kawabunga/db";
import { ConsumerSceneNav } from "../../../components/consumer-scene-nav";
import { DeepTheme } from "../../../components/deep-theme";
import { SceneEnterControls, VisitAgainButton } from "../../../components/scene-enter-controls";
import { auth } from "../../../lib/auth";
import {
  characterInitials,
  canViewConsumerScene,
  descriptionExcerpt,
  latestArcBeatLabel,
  latestSessionForUser,
} from "../../../lib/scene-lander";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ sceneId: string }>;
  searchParams: Promise<{ enter?: string | string[] }>;
};

export default async function SceneLanderPage({ params, searchParams }: PageProps) {
  const [{ sceneId }, query] = await Promise.all([params, searchParams]);
  const [scene, viewer] = await Promise.all([
    getSceneStore().getSceneById(sceneId),
    auth(),
  ]);
  const staff = viewer?.user?.role === "admin";
  if (!scene || !canViewConsumerScene(scene.status, staff)) notFound();
  const graph = await getSceneGraphStore().getGraph(sceneId);
  const characterNodes = graph.nodes.filter(
    (node) => node.kind === "character" && node.refId,
  );
  const characters = await Promise.all(
    characterNodes.map((node) => getCharacterStore().getById(node.refId!)),
  );
  const roster = characterNodes.flatMap((node, index) => {
    const character = characters[index];
    if (!character) return [];
    const role =
      character.summary?.trim() ||
      node.summary?.trim() ||
      (typeof node.data.roleInScene === "string" ? node.data.roleInScene.trim() : "");
    return [{ id: character.id, name: character.title, role }];
  });

  const userId = viewer?.user?.id;
  const priorSessions = userId
    ? await getSceneSessionStore().listSessionsForUser(userId, 250)
    : [];
  const priorSession = userId
    ? latestSessionForUser(
        priorSessions.filter((session) => session.sceneId === sceneId),
        userId,
      )
    : null;
  const priorOutcome = latestArcBeatLabel(priorSession?.currentScene);
  const narratorEnabled = scene.definition.narrator !== "off";
  const autoEnter = query.enter === "1" && Boolean(userId);
  const description = descriptionExcerpt(scene.prompt);
  const viewerInitial =
    viewer?.user?.name?.trim().charAt(0) || viewer?.user?.email?.trim().charAt(0) || "";

  return (
    <main className={styles.scenePage} data-theme="deep">
      <DeepTheme />
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.frame}>
        {scene.status === "draft" ? (
          <div className={styles.draftPreview} role="status">
            DRAFT PREVIEW · visible only to staff
          </div>
        ) : null}
        <ConsumerSceneNav
          active={null}
          viewerInitial={viewerInitial}
          callbackPath={`/scenes/${sceneId}`}
          hideScenesOnNarrow
        />

        <div className={styles.halo} aria-hidden="true">
          <span className={styles.ringOuter} />
          <span className={styles.ringMiddle} />
          <span className={styles.ringInner} />
          <span className={styles.ember} />
        </div>

        <section className={styles.hero} aria-labelledby="scene-title">
          <div className={styles.kicker}>
            <span aria-hidden="true" />
            <p>A living scene</p>
          </div>
          <h1 id="scene-title">{scene.title}</h1>
          {description ? <p className={styles.description}>{description}</p> : null}
          <div className={styles.meta} aria-label="Scene details">
            <span>Live voices</span><i aria-hidden="true">·</i>
            <span>
              {roster.length} {roster.length === 1 ? "character" : "characters"}
              {narratorEnabled ? " & a narrator" : ""}
            </span><i aria-hidden="true">·</i>
            <span>10–20 min</span><i aria-hidden="true">·</i>
            <span>headphones recommended</span>
          </div>
        </section>

        <section className={styles.actions} aria-label="Enter this scene">
          <SceneEnterControls sceneId={sceneId} signedIn={Boolean(userId)} autoEnter={autoEnter} />
        </section>

        <section className={styles.cast} aria-labelledby="cast-title">
          <h2 id="cast-title">You will meet</h2>
          <div className={styles.castList}>
            {roster.map((character) => (
              <article className={styles.castCard} key={character.id}>
                <div className={styles.castAvatar} aria-hidden="true">
                  {characterInitials(character.name)}
                </div>
                <div className={styles.castCopy}>
                  <h3>{character.name}</h3>
                  {character.role ? <p title={character.role}>{character.role}</p> : null}
                </div>
              </article>
            ))}
            {narratorEnabled ? (
              <article className={`${styles.castCard} ${styles.narratorCard}`}>
                <div className={styles.narratorAvatar} aria-hidden="true">✦</div>
                <div className={styles.castCopy}>
                  <h3>The Narrator</h3>
                  <p>an unseen voice that renders the world</p>
                </div>
              </article>
            ) : null}
          </div>
        </section>

        {priorSession ? (
          <aside className={styles.resumeChip} aria-label="Previous scene visit">
            <div className={styles.resumeCopy}>
              <strong>You&apos;ve visited before</strong>
              <p>
                {new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(priorSession.startedAt))}
                {priorOutcome ? ` · ${priorOutcome}` : ""}
              </p>
            </div>
            {priorSession.status === "ended" ? (
              <Link
                href={`/scenes/${encodeURIComponent(sceneId)}/session/${encodeURIComponent(priorSession.id)}`}
                className={styles.visitAgain}
              >
                Read your visit →
              </Link>
            ) : (
              <VisitAgainButton sceneId={sceneId} signedIn />
            )}
          </aside>
        ) : null}
      </div>
    </main>
  );
}
