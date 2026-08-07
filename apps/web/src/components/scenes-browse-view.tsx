import Link from "next/link";
import { ConsumerSceneNav } from "./consumer-scene-nav";
import styles from "../app/scenes/page.module.css";

export type BrowseSceneCard = {
  id: string;
  title: string;
  hook: string;
  characterCount: number;
  narratorEnabled: boolean;
  isNew: boolean;
  visited: boolean;
  haloVariant: 0 | 1 | 2;
};

function sceneMeta(scene: BrowseSceneCard): string {
  if (scene.characterCount === 0) return scene.narratorEnabled ? "Live narrator" : "Live scene";
  const characters = `${scene.characterCount} ${scene.characterCount === 1 ? "character" : "characters"}`;
  return scene.narratorEnabled ? `${characters} & a narrator` : characters;
}

function SceneHalo({ variant, large = false }: { variant: 0 | 1 | 2; large?: boolean }) {
  return (
    <span
      className={`${styles.halo} ${large ? styles.featuredHalo : ""}`}
      data-variant={variant}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
      <b />
    </span>
  );
}

export function ScenesBrowseView({
  scenes,
  viewerInitial,
}: {
  scenes: BrowseSceneCard[];
  viewerInitial: string;
}) {
  const featured = scenes[0] ?? null;

  return (
    <main className={styles.page} data-theme="deep">
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.frame}>
        <ConsumerSceneNav active="scenes" viewerInitial={viewerInitial} callbackPath="/scenes" />

        <section className={styles.intro} aria-labelledby="browse-title">
          <div className={styles.kicker}><span />Living scenes</div>
          <h1 id="browse-title">Step into a scene</h1>
          <p>Every scene is performed live, just for you — speak, and the people in it answer.</p>
        </section>

        {featured ? (
          <section className={styles.featured} aria-labelledby="featured-title">
            <SceneHalo variant={featured.haloVariant} large />
            <div className={styles.featuredCopy}>
              <p className={styles.eyebrow}>Featured</p>
              <h2 id="featured-title">{featured.title}</h2>
              {featured.hook ? <p className={styles.featuredHook}>{featured.hook}</p> : null}
              <div className={styles.featuredActions}>
                <Link href={`/scenes/${encodeURIComponent(featured.id)}`} className={styles.enterLink}>
                  <span aria-hidden="true">▶</span> Enter the scene
                </Link>
                <span>Live voices · {sceneMeta(featured)}</span>
              </div>
            </div>
          </section>
        ) : (
          <section className={styles.empty} aria-label="No scenes available">
            <SceneHalo variant={0} large />
            <div>
              <p className={styles.eyebrow}>The stage is quiet</p>
              <h2>No scenes are open right now.</h2>
              <p>New living scenes will appear here when they are ready.</p>
            </div>
          </section>
        )}

        <section className={styles.catalog} aria-labelledby="catalog-title">
          <div className={styles.sectionHeading}>
            <h2 id="catalog-title">All scenes</h2><span />
          </div>
          {scenes.length ? (
            <div className={styles.grid}>
              {scenes.map((scene) => (
                <Link
                  href={`/scenes/${encodeURIComponent(scene.id)}`}
                  className={styles.card}
                  key={scene.id}
                  aria-label={`Open ${scene.title}`}
                >
                  <div className={styles.cardArt}>
                    <SceneHalo variant={scene.haloVariant} />
                    <div className={styles.badges}>
                      {scene.isNew ? <span>New</span> : null}
                      {scene.visited ? <span data-visited>Visited</span> : null}
                    </div>
                  </div>
                  <div className={styles.cardCopy}>
                    <h3>{scene.title}</h3>
                    {scene.hook ? <p>{scene.hook}</p> : null}
                    <span>{sceneMeta(scene)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
