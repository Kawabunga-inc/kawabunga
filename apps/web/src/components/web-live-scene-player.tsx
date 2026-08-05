"use client";

import { useMemo } from "react";
import {
  createHttpLiveSceneProvider,
  ScenePlayer,
  type ScenePlayerProps,
} from "@kawabunga/live-scene";

type Props = Omit<ScenePlayerProps, "provider" | "viewer" | "landerHref" | "workbenchHref"> & {
  staff: boolean;
  adminBaseUrl: string;
};

export function WebLiveScenePlayer({ staff, adminBaseUrl, ...props }: Props) {
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
    <ScenePlayer
      {...props}
      provider={provider}
      viewer={{ isStaff: staff }}
      landerHref={`/scenes/${encodeURIComponent(sceneId)}`}
      workbenchHref={`${adminBaseUrl.replace(/\/$/, "")}/sessions/${encodeURIComponent(sessionId)}`}
    />
  );
}
