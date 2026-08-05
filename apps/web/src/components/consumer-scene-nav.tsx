import Link from "next/link";
import styles from "./consumer-scene-nav.module.css";

export type ConsumerSceneNavActive = "scenes" | "visits" | null;

export function ConsumerSceneNav({
  active,
  viewerInitial,
  callbackPath,
  hideScenesOnNarrow = false,
}: {
  active: ConsumerSceneNavActive;
  viewerInitial: string;
  callbackPath: string;
  hideScenesOnNarrow?: boolean;
}) {
  return (
    <header className={styles.header} data-hide-scenes-narrow={hideScenesOnNarrow || undefined}>
      <Link href="/" className={styles.wordmark} aria-label="Kawabunga home">
        Kawabunga
      </Link>
      <nav className={styles.nav} aria-label="Scene navigation">
        <Link href="/scenes" data-active={active === "scenes" || undefined}>
          Scenes
        </Link>
        <Link href="/visits" data-active={active === "visits" || undefined}>
          My visits
        </Link>
        {viewerInitial ? (
          <span className={styles.viewerAvatar} aria-label="Signed in">
            {viewerInitial.toUpperCase()}
          </span>
        ) : (
          <Link
            href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackPath)}`}
            className={styles.signIn}
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
