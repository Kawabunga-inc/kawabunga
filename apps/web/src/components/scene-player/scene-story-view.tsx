"use client";

import Link from "next/link";
import type { SceneTranscriptMessage } from "@/lib/scene-captions";
import type { LiveSceneStage } from "@/hooks/use-live-scene";
import { useSceneStoryFollow } from "@/hooks/use-scene-story-follow";
import { SceneViewToggle, type SceneView } from "./scene-view-toggle";
import styles from "./scene-player.module.css";

type Props = {
  title: string;
  elapsed: string;
  chapter: string;
  messages: SceneTranscriptMessage[];
  stage: LiveSceneStage;
  micLevel: number;
  currentSpeakerSlug: string | null;
  view: SceneView;
  staff?: boolean;
  ended: boolean;
  landerHref: string;
  onViewChange(view: SceneView): void;
  onLeave(): void;
};

function StoryLine({
  message,
  currentSpeakerSlug,
}: {
  message: SceneTranscriptMessage;
  currentSpeakerSlug: string | null;
}) {
  const narrator = message.role === "agent" && message.speaker?.slug === "narrator";
  const label = message.role === "user" ? "YOU" : message.speaker?.name ?? "THE SCENE";
  const active =
    message.role === "agent" &&
    !message.final &&
    message.speaker?.slug === currentSpeakerSlug;
  const text = `${message.text}${message.final ? "" : "▍"}`;

  if (narrator) {
    return <p className={styles.narration}>{text}</p>;
  }
  return (
    <div className={styles.storyLine}>
      <p className={`${styles.storySpeaker} ${active ? styles.storySpeakerActive : ""}`}>{label}</p>
      <p className={styles.dialogue}>“{text}”</p>
    </div>
  );
}

export function SceneStoryView({
  title,
  elapsed,
  chapter,
  messages,
  stage,
  micLevel,
  currentSpeakerSlug,
  view,
  staff = false,
  ended,
  landerHref,
  onViewChange,
  onLeave,
}: Props) {
  const newest = messages.at(-1);
  const { following, viewportRef, onScroll, followNow } = useSceneStoryFollow(
    `${newest?.id ?? "empty"}:${newest?.text ?? ""}`,
  );
  const speaking = newest?.role === "agent" && !newest.final ? newest.speaker?.name : null;
  const status = ended
    ? "This visit has ended."
    : speaking
      ? `${speaking} is speaking — the story writes itself as you listen.`
      : "The scene is listening.";

  return (
    <section className={styles.storyView} aria-label={ended ? "Saved scene story" : "Live scene story"}>
      <div className={styles.storyAtmosphere} aria-hidden="true" />
      <header className={styles.topbar}>
        <p>{title}</p>
        {!ended ? <SceneViewToggle value={view} staff={staff} onChange={onViewChange} /> : null}
        <div className={styles.topbarActions}>
          <time suppressHydrationWarning>{elapsed}</time>
          {!ended ? <button type="button" onClick={onLeave}>Leave quietly</button> : null}
        </div>
      </header>

      <div className={styles.storyViewport} ref={viewportRef} onScroll={onScroll}>
        <article className={styles.storyColumn}>
          <header className={styles.chapter}>
            <span />
            <p>YOUR VISIT · {chapter}</p>
          </header>
          <div className={styles.storyProse} aria-live={ended ? "off" : "polite"}>
            {messages.map((message) => (
              <StoryLine key={message.id} message={message} currentSpeakerSlug={currentSpeakerSlug} />
            ))}
            {!messages.length ? (
              <p className={styles.storyEmpty}>The first words of this visit will gather here.</p>
            ) : null}
            <div aria-hidden="true" />
          </div>
          {ended ? (
            <footer className={styles.storyEnding}>
              <span />
              <p>The scene has ended.</p>
              <Link href={landerHref}>Visit again</Link>
            </footer>
          ) : null}
        </article>
      </div>

      {!following ? (
        <button type="button" className={styles.nowButton} onClick={followNow}>↓ now</button>
      ) : null}

      {!ended ? (
        <>
          {stage === "reconnecting" ? (
            <div className={styles.reconnecting} role="status"><span aria-hidden="true" /> Reconnecting to the scene…</div>
          ) : null}
          <div className={styles.storyStatus} role="status">
            <span className={speaking ? styles.statusSpeaking : ""} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <p>{status}</p>
          </div>
          <div className={`${styles.micPill} ${micLevel > 0.12 ? styles.micActive : ""}`}>
            <span aria-hidden="true" />
            <p>{micLevel > 0.12 ? "Listening — I can hear you" : "Listening — speak whenever you like"}</p>
          </div>
          <p className={styles.storyHint}>↑ earlier in the story</p>
          <p className={styles.storySaved}>saved to My visits when the scene ends</p>
        </>
      ) : null}
    </section>
  );
}
