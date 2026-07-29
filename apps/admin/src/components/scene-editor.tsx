"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type {
  SceneGraphPayload,
  SceneLibraryCharacter,
  SceneLibrarySound,
  SceneRosterEntry,
} from "@/app/(authenticated)/scenes/[sceneId]/page";
import {
  addAudioToScene,
  addCharacterToScene,
  addEventToScene,
  archiveScene,
  removeSceneNode,
  updateSceneConfig,
} from "@/app/(authenticated)/scenes/actions";
import { AdminPageShell, AdminStatusPill, adminTokens } from "@/components/admin-ui";
import { Pathname } from "@/components/pathname";
import { TabBar, type TabItem } from "@/components/tab-bar";
import { useHeaderContent } from "@/components/header-context";
import type { PickerVoice } from "@/components/voice-library-picker";
import type { StageConfig } from "@kawabunga/types";
import { CanvasTab } from "@/components/scene-stage/canvas-tab";
import { CastTab } from "@/components/scene-tabs/cast-tab";
import { EnvironmentTab } from "@/components/scene-tabs/environment-tab";
import { GameTab } from "@/components/scene-tabs/game-tab";
import { NarratorTab } from "@/components/scene-tabs/narrator-tab";
import { OverviewTab } from "@/components/scene-tabs/overview-tab";
import { relativeTime, splitVariants } from "@/components/scene-tabs/shared";
import type { SceneTab } from "@/components/scene-tabs/types";

type SceneEditorProps = {
  scene: {
    id: string;
    title: string;
    prompt: string;
    status: "draft" | "active" | "archived";
    openingBeat: string;
    defaultAmbience: string | null;
    narratorVoiceId: string | null;
    objective: string | null;
    drive: "gentle" | "balanced" | "insistent" | null;
    openingNarration: string | null;
    openingNarrationVariants: string[] | null;
    openingMode: "authored" | "generated" | "off" | null;
    narrator: "off" | "minimal" | "scenic" | null;
    stage: StageConfig | null;
  };
  roster: SceneRosterEntry[];
  graph: SceneGraphPayload;
  libraryCharacters: SceneLibraryCharacter[];
  librarySounds: SceneLibrarySound[];
};

export function SceneEditor({
  scene,
  graph,
  libraryCharacters,
  librarySounds,
}: SceneEditorProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [tab, setTab] = useState<SceneTab>("overview");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [title, setTitle] = useState(scene.title);
  const [prompt, setPrompt] = useState(scene.prompt);
  const [status, setStatus] = useState(scene.status);
  const [openingBeat, setOpeningBeat] = useState(scene.openingBeat);
  const [defaultAmbience, setDefaultAmbience] = useState(scene.defaultAmbience ?? "");
  const [narratorVoiceId, setNarratorVoiceId] = useState(scene.narratorVoiceId);
  const [objective, setObjective] = useState(scene.objective ?? "");
  const [openingNarration, setOpeningNarration] = useState(scene.openingNarration ?? "");
  // Variants edit as one newline-separated block — simplest control that
  // still round-trips an array, and reads naturally for prose.
  const [openingVariants, setOpeningVariants] = useState(
    (scene.openingNarrationVariants ?? []).join("\n\n"),
  );
  const [openingMode, setOpeningMode] = useState<"authored" | "generated" | "off">(
    scene.openingMode ?? (scene.openingNarration ? "authored" : "off"),
  );
  const [narrator, setNarrator] = useState<"off" | "minimal" | "scenic">(
    scene.narrator ?? "minimal",
  );
  const [drive, setDrive] = useState<"gentle" | "balanced" | "insistent">(
    scene.drive ?? "balanced",
  );
  const [stage, setStage] = useState<StageConfig | null>(scene.stage);
  const [graphNodes, setGraphNodes] = useState(graph.nodes);

  useEffect(() => setGraphNodes(graph.nodes), [graph.nodes]);

  const [voiceOptions, setVoiceOptions] = useState<PickerVoice[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/voices")
      .then((r) => r.json())
      .then((data: { voices: PickerVoice[] }) => {
        if (cancelled) return;
        setVoiceOptions(data.voices.filter((v) => v.status === "ready"));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const characterById = useMemo(() => {
    const map = new Map<string, SceneLibraryCharacter>();
    for (const character of libraryCharacters) map.set(character.id, character);
    return map;
  }, [libraryCharacters]);

  const soundById = useMemo(() => {
    const map = new Map<string, SceneLibrarySound>();
    for (const sound of librarySounds) map.set(sound.id, sound);
    return map;
  }, [librarySounds]);

  const rosterCharacterIds = useMemo(
    () => new Set(graphNodes.filter((n) => n.kind === "character" && n.refId).map((n) => n.refId!)),
    [graphNodes],
  );
  const addableCharacters = useMemo(
    () => libraryCharacters.filter((c) => !rosterCharacterIds.has(c.id)),
    [libraryCharacters, rosterCharacterIds],
  );

  const saveConfig = useCallback(() => {
    start(async () => {
      const res = await updateSceneConfig(scene.id, {
        title: title.trim(),
        prompt,
        status,
        openingBeat,
        defaultAmbience: defaultAmbience.trim() || null,
        narratorVoiceId,
        objective: objective.trim() || null,
        drive: drive === "balanced" ? null : drive,
        openingNarration: openingNarration.trim() || null,
        narrator: narrator === "minimal" ? null : narrator,
        openingNarrationVariants: splitVariants(openingVariants),
        openingMode,
        stage,
      });
      if (res.ok) setSavedAt(Date.now());
      router.refresh();
    });
  }, [
    defaultAmbience,
    narratorVoiceId,
    openingBeat,
    objective,
    drive,
    openingNarration,
    narrator,
    openingVariants,
    openingMode,
    prompt,
    router,
    scene.id,
    stage,
    status,
    title,
  ]);

  /* Auto-save the scene config — no save button anywhere in the editor
   * (parity with the character config sidebar). Debounced 900ms past the
   * last edit; the snapshot ref keeps the mount (and post-save refresh)
   * from re-triggering a write. */
  const configSnapshot = JSON.stringify([
    title,
    prompt,
    status,
    openingBeat,
    defaultAmbience,
    narratorVoiceId,
    objective,
    drive,
    openingNarration,
    narrator,
    openingVariants,
    openingMode,
    stage,
  ]);
  const savedConfigSnapshot = useRef(configSnapshot);
  useEffect(() => {
    if (configSnapshot === savedConfigSnapshot.current) return;
    const timer = setTimeout(() => {
      savedConfigSnapshot.current = configSnapshot;
      saveConfig();
    }, 900);
    return () => clearTimeout(timer);
  }, [configSnapshot, saveConfig]);

  const saveTitle = useCallback(
    async (next: string) => {
      setTitle(next);
      const res = await updateSceneConfig(scene.id, { title: next.trim() });
      if (res.ok) {
        setSavedAt(Date.now());
        router.refresh();
      }
    },
    [router, scene.id],
  );

  const addCharacter = useCallback(
    (characterId: string) => {
      if (!characterId) return;
      start(async () => {
        await addCharacterToScene(scene.id, characterId);
        router.refresh();
      });
    },
    [router, scene.id],
  );

  const addAudio = useCallback(
    (input: {
      assetId: string;
      role: "bed" | "oneshot";
      isDefault?: boolean;
      triggerHint?: string;
    }) => {
      start(async () => {
        await addAudioToScene(scene.id, input);
        router.refresh();
      });
    },
    [router, scene.id],
  );

  const addEvent = useCallback(
    (input: { label: string; summary?: string }) => {
      // Next slot in the arc: max existing timeIndex + 1 (0-based start).
      const timeIndex =
        graphNodes
          .filter((n) => n.kind === "event")
          .reduce(
            (max, n) =>
              typeof n.data.timeIndex === "number" && n.data.timeIndex > max
                ? n.data.timeIndex
                : max,
            -1,
          ) + 1;
      start(async () => {
        await addEventToScene(scene.id, { ...input, timeIndex });
        router.refresh();
      });
    },
    [router, scene.id, graphNodes],
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      start(async () => {
        await removeSceneNode(scene.id, nodeId);
        setSelectedNodeId(null);
        router.refresh();
      });
    },
    [router, scene.id],
  );

  const archive = useCallback(() => {
    if (!confirm("Archive this scene? It will be hidden from the list.")) return;
    start(async () => {
      await archiveScene(scene.id);
      router.push("/scenes");
    });
  }, [router, scene.id]);

  const updateLocalNode = useCallback(
    (nodeId: string, patch: Partial<SceneGraphPayload["nodes"][number]>) => {
      setGraphNodes((prev) =>
        prev.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
      );
    },
    [],
  );

  const { setFlush, setContent } = useHeaderContent();
  useEffect(() => {
    setFlush(true);
    return () => setFlush(false);
  }, [setFlush]);

  useEffect(() => {
    setContent(
      <ScenePageHeader
        sceneId={scene.id}
        title={title}
        status={status}
        onTitleChange={saveTitle}
        onArchive={archive}
        pending={pending}
      />,
    );
    return () => setContent(null);
  }, [archive, pending, saveTitle, scene.id, setContent, status, title]);

  const castCount = graphNodes.filter((n) => n.kind === "character").length;
  const soundCount = graphNodes.filter(
    (n) => n.kind === "audio" || n.kind === "ambience",
  ).length;
  const beatCount = graphNodes.filter((n) => n.kind === "event").length;

  const tabs: Array<TabItem<SceneTab>> = [
    { key: "overview", label: "Overview", onClick: () => setTab("overview") },
    { key: "canvas", label: "Canvas", onClick: () => setTab("canvas") },
    {
      key: "cast",
      label: castCount ? `Cast · ${castCount}` : "Cast",
      onClick: () => setTab("cast"),
    },
    {
      key: "environment",
      label: soundCount ? `Environment · ${soundCount}` : "Environment",
      onClick: () => setTab("environment"),
    },
    { key: "narrator", label: "Narrator", onClick: () => setTab("narrator") },
    {
      key: "game",
      label: beatCount ? `Game · ${beatCount}` : "Game",
      onClick: () => setTab("game"),
    },
  ];

  const saveState = pending
    ? "saving…"
    : savedAt
      ? `auto-saved · ${relativeTime(savedAt)}`
      : "auto-save on";

  return (
    <AdminPageShell
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        minHeight: "calc(100vh - 48px)",
      }}
    >
      <div style={tabBandStyle}>
        <TabBar
          items={tabs}
          active={tab}
          trailing={
            <span style={saveStateStyle} aria-live="polite">
              {saveState}
            </span>
          }
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {tab === "overview" && (
          <OverviewTab
            sceneId={scene.id}
            scene={{
              prompt,
              openingBeat,
              status,
              objective,
              drive,
              narrator,
              openingMode,
              narratorVoiceId,
              openingNarration,
            }}
            graphNodes={graphNodes}
            characterById={characterById}
            onSceneChange={{ setPrompt, setOpeningBeat, setStatus }}
            onOpenTab={setTab}
          />
        )}

        {tab === "canvas" && (
          <CanvasTab
            sceneId={scene.id}
            pending={pending}
            graphNodes={graphNodes}
            characterById={characterById}
            stage={stage}
            onStageChange={setStage}
            selectedNodeId={selectedNodeId}
            onSelect={setSelectedNodeId}
            onNodeSaved={updateLocalNode}
            onRemoveNode={removeNode}
          />
        )}

        {tab === "cast" && (
          <CastTab
            sceneId={scene.id}
            pending={pending}
            graphNodes={graphNodes}
            characterById={characterById}
            addableCharacters={addableCharacters}
            selectedNodeId={selectedNodeId}
            onSelect={setSelectedNodeId}
            onAddCharacter={addCharacter}
            onRemoveNode={removeNode}
            onNodeSaved={updateLocalNode}
          />
        )}

        {tab === "environment" && (
          <EnvironmentTab
            sceneId={scene.id}
            pending={pending}
            graphNodes={graphNodes}
            soundById={soundById}
            librarySounds={librarySounds}
            defaultAmbience={defaultAmbience}
            selectedNodeId={selectedNodeId}
            onSelect={setSelectedNodeId}
            onAddAudio={addAudio}
            onSetDefaultAmbience={setDefaultAmbience}
            onRemoveNode={removeNode}
            onNodeSaved={updateLocalNode}
          />
        )}

        {tab === "narrator" && (
          <NarratorTab
            scene={{
              narratorVoiceId,
              narrator,
              openingMode,
              openingNarration,
              openingVariants,
            }}
            voiceOptions={voiceOptions}
            onSceneChange={{
              setNarratorVoiceId,
              setNarrator,
              setOpeningMode,
              setOpeningNarration,
              setOpeningVariants,
            }}
          />
        )}

        {tab === "game" && (
          <GameTab
            sceneId={scene.id}
            pending={pending}
            graphNodes={graphNodes}
            scene={{ objective, drive }}
            selectedNodeId={selectedNodeId}
            onSelect={setSelectedNodeId}
            onSceneChange={{ setObjective, setDrive }}
            onAddEvent={addEvent}
            onRemoveNode={removeNode}
            onNodeSaved={updateLocalNode}
          />
        )}
      </div>
    </AdminPageShell>
  );
}

function ScenePageHeader({
  sceneId,
  title,
  status,
  pending,
  onTitleChange,
  onArchive,
}: {
  sceneId: string;
  title: string;
  status: SceneEditorProps["scene"]["status"];
  pending: boolean;
  onTitleChange: (next: string) => void | Promise<void>;
  onArchive: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        gap: "var(--space-16)",
      }}
    >
      <Pathname
        segments={[
          { label: "scenes", href: "/scenes" },
          {
            label: title,
            href: `/scenes/${sceneId}`,
            tag: true,
            editable: { onRename: onTitleChange, ariaLabel: "Scene name" },
          },
        ]}
      />
      <AdminStatusPill tone={status === "active" ? "success" : "muted"} dot>
        {status}
      </AdminStatusPill>
      <div style={{ flex: 1 }} />
      <Link href={`/scenes/${sceneId}/sandbox`} style={sandboxLinkStyle}>
        rehearse
      </Link>
      <button
        type="button"
        aria-label="Archive scene"
        title="Archive scene"
        disabled={pending}
        onClick={onArchive}
        style={headerIconButtonStyle}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect width="20" height="5" x="2" y="3" rx="1" />
          <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
          <path d="M10 12h4" />
        </svg>
      </button>
    </div>
  );
}

const tabBandStyle: CSSProperties = {
  display: "flex",
  height: 40,
  flexShrink: 0,
  paddingLeft: "var(--space-24)",
  borderBottom: "1px solid var(--ink-fill)",
  background: "var(--background)",
};

const saveStateStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0 18px",
  marginLeft: "auto",
  color: "var(--text-tertiary)",
  fontFamily: adminTokens.fontMono,
  fontSize: "var(--font-size-xs)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const sandboxLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 30,
  padding: "0 16px",
  border: `1px solid ${adminTokens.accent}`,
  borderRadius: "var(--radius-pill)",
  background: adminTokens.accent,
  color: "var(--background)",
  fontFamily: adminTokens.fontBody,
  fontSize: "var(--font-size-base)",
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const headerIconButtonStyle: CSSProperties = {
  width: 30,
  height: 30,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)",
  borderRadius: "var(--radius-pill)",
  background: "transparent",
  color: "var(--text-tertiary)",
  cursor: "pointer",
};
