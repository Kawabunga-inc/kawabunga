import Link from "next/link";
import { ConsumerSceneNav } from "./consumer-scene-nav";
import { VisitLocalMeta } from "./visit-local-meta";
import styles from "../app/visits/page.module.css";

export type VisitCard = {
  sessionId: string;
  sceneId: string;
  title: string;
  startedAt: string;
  duration: string;
  outcome: { label: string; complete: boolean } | null;
  openingLine: string;
};

export type FreshVisit = {
  sessionId: string;
  sceneId: string;
  title: string;
  ageMinutes: number;
};

export function VisitsView({
  viewerInitial,
  fresh,
  visits,
  hasMore,
  nextShow,
}: {
  viewerInitial: string;
  fresh: FreshVisit | null;
  visits: VisitCard[];
  hasMore: boolean;
  nextShow: number;
}) {
  return (
    <main className={styles.page} data-theme="deep">
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.frame}>
        <ConsumerSceneNav active="visits" viewerInitial={viewerInitial} callbackPath="/visits" />

        <section className={styles.intro} aria-labelledby="visits-title">
          <div className={styles.kicker}><span />Your stories</div>
          <h1 id="visits-title">My visits</h1>
          <p>Every scene you enter becomes a story — written as you spoke it, kept here to reread.</p>
        </section>

        {fresh ? (
          <aside className={styles.rejoin} aria-label="Active scene visit">
            <span className={styles.liveDot} aria-hidden="true" />
            <div>
              <strong>You left mid-scene — the scene still waits.</strong>
              <p>{fresh.title} · started {fresh.ageMinutes < 1 ? "just now" : `${fresh.ageMinutes} min ago`}</p>
            </div>
            <Link href={`/scenes/${encodeURIComponent(fresh.sceneId)}/session/${encodeURIComponent(fresh.sessionId)}`}>
              Rejoin
            </Link>
          </aside>
        ) : null}

        <section className={styles.history} aria-labelledby="history-title">
          <div className={styles.sectionHeading}>
            <h2 id="history-title">Earlier visits</h2><span />
          </div>

          {visits.length ? (
            <div className={styles.list}>
              {visits.map((visit) => (
                <article className={styles.card} key={visit.sessionId}>
                  <div className={styles.visitSummary}>
                    <h3>{visit.title}</h3>
                    <VisitLocalMeta startedAt={visit.startedAt} duration={visit.duration} />
                    {visit.outcome ? (
                      <p data-complete={visit.outcome.complete || undefined}>{visit.outcome.label}</p>
                    ) : null}
                  </div>
                  <div className={styles.opening}>
                    {visit.openingLine ? <p>{visit.openingLine}</p> : <p className={styles.noOpening}>No completed lines were saved for this visit.</p>}
                    <span>the opening of your story</span>
                  </div>
                  <div className={styles.actions}>
                    <Link href={`/scenes/${encodeURIComponent(visit.sceneId)}/session/${encodeURIComponent(visit.sessionId)}`}>
                      Read your visit →
                    </Link>
                    <Link href={`/scenes/${encodeURIComponent(visit.sceneId)}`}>Visit again</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <h3>You haven&apos;t visited a scene yet.</h3>
              <p>Choose a living scene and your story will be kept here after you leave.</p>
              <Link href="/scenes">Browse scenes →</Link>
            </div>
          )}

          {hasMore ? (
            <div className={styles.more}>
              <Link href={`/visits?show=${nextShow}`}>Show more visits</Link>
            </div>
          ) : null}
        </section>

        <footer className={styles.privacy}>
          Stories are kept privately for you — only sessions you finish or leave appear here.
        </footer>
      </div>
    </main>
  );
}
