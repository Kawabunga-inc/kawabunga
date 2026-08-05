"use client";

import { useMemo } from "react";
import {
  createHttpLiveSceneProvider,
  ScenePlayer,
  type ScenePlayerProps,
} from "@kawabunga/live-scene";
import styles from "./admin-live-scene-player.module.css";

type Props = Omit<ScenePlayerProps, "provider" | "viewer" | "landerHref" | "workbenchHref">;

export function AdminLiveScenePlayer(props: Props) {
  const { sceneId, sessionId } = props;
  const base = `/api/scenes/${encodeURIComponent(sceneId)}/session/${encodeURIComponent(sessionId)}`;
  const provider = useMemo(
    () => createHttpLiveSceneProvider({
      join: `${base}/join`,
      end: `${base}/end`,
      transcript: `${base}/transcript`,
      journal: `${base}/journal`,
    }),
    [base],
  );

  return (
    <div className={styles.overlay}>
      <ScenePlayer
        {...props}
        provider={provider}
        viewer={{ isStaff: true }}
        landerHref={`/scenes/${encodeURIComponent(sceneId)}`}
        workbenchHref={`/sessions/${encodeURIComponent(sessionId)}`}
      />
    </div>
  );
}
