"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "@/app/scenes/[sceneId]/page.module.css";

type EnterActionProps = {
  sceneId: string;
  signedIn: boolean;
  className: string;
  children: React.ReactNode;
  autoEnter?: boolean;
};

function EnterAction({
  sceneId,
  signedIn,
  className,
  children,
  autoEnter = false,
}: EnterActionProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const hasSubmitted = useRef(false);
  const returnPath = `/scenes/${encodeURIComponent(sceneId)}?enter=1`;
  const signInHref = `/auth/signin?callbackUrl=${encodeURIComponent(returnPath)}`;

  useEffect(() => {
    if (!signedIn || !autoEnter || hasSubmitted.current) return;
    hasSubmitted.current = true;
    formRef.current?.requestSubmit();
  }, [autoEnter, signedIn]);

  if (!signedIn) {
    return (
      <Link href={signInHref} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <form
      ref={formRef}
      action={`/api/scenes/${encodeURIComponent(sceneId)}/enter`}
      method="post"
      className={styles.enterForm}
    >
      <button className={className} type="submit">
        {children}
      </button>
    </form>
  );
}

export function SceneEnterControls({
  sceneId,
  signedIn,
  autoEnter,
}: {
  sceneId: string;
  signedIn: boolean;
  autoEnter: boolean;
}) {
  const [showExplainer, setShowExplainer] = useState(false);

  return (
    <>
      <div className={styles.ctaRow}>
        <EnterAction
          sceneId={sceneId}
          signedIn={signedIn}
          autoEnter={autoEnter}
          className={styles.enterButton}
        >
          <span aria-hidden="true" className={styles.playIcon}>
            ▶
          </span>
          <span>Enter the scene</span>
        </EnterAction>
        <button
          type="button"
          className={styles.howButton}
          aria-expanded={showExplainer}
          aria-controls="scene-explainer"
          onClick={() => setShowExplainer(true)}
        >
          How it works
        </button>
        <p className={styles.micDisclosure}>
          Your mic turns on when you enter — just speak.
        </p>
      </div>

      {showExplainer ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={() => setShowExplainer(false)}
        >
          <section
            id="scene-explainer"
            className={styles.explainer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="scene-explainer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.explainerHeading}>
              <div>
                <p className={styles.explainerKicker}>Inside a living scene</p>
                <h2 id="scene-explainer-title">How it works</h2>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                aria-label="Close how it works"
                onClick={() => setShowExplainer(false)}
              >
                ×
              </button>
            </div>
            <ol className={styles.steps}>
              <li>
                <span>01</span>
                <div>
                  <strong>You speak</strong>
                  <p>Use your voice to choose what you say and do.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>They answer</strong>
                  <p>
                    Characters respond in the moment as the scene changes around you.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>The story is saved</strong>
                  <p>Your visit becomes a story you can return to later.</p>
                </div>
              </li>
            </ol>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function VisitAgainButton({
  sceneId,
  signedIn,
}: {
  sceneId: string;
  signedIn: boolean;
}) {
  return (
    <EnterAction
      sceneId={sceneId}
      signedIn={signedIn}
      className={styles.visitAgain}
    >
      Visit again →
    </EnterAction>
  );
}
