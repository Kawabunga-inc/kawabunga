"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type {
  SceneGraphPayload,
  SceneLibraryCharacter,
} from "@/app/(authenticated)/scenes/[sceneId]/page";
import { resolveAvatarGradient } from "@/lib/avatar-gradients";
import {
  Field,
  InspectorSection,
  inputStyle,
  kickerStyle,
  subtleLinkStyle,
  T,
  tabScrollStyle,
  textareaStyle,
} from "./shared";
import type { SceneTab } from "./types";

type ReadinessStatus = "ready" | "warning" | "blocked";

type ReadinessReport = {
  overallStatus: ReadinessStatus;
  checks: Array<{
    id: string;
    label: string;
    group: string;
    status: ReadinessStatus;
    summary: string;
    detail?: string;
  }>;
};

/* The landing tab: the prose you touch every time (premise, opening
 * beat, status) plus a readiness checklist and a preview card per
 * sibling tab so the whole scene is scannable from one screen. */
export function OverviewTab({
  sceneId,
  scene,
  graphNodes,
  characterById,
  onSceneChange,
  onOpenTab,
}: {
  sceneId: string;
  scene: {
    prompt: string;
    openingBeat: string;
    status: "draft" | "active" | "archived";
    objective: string;
    drive: "gentle" | "balanced" | "insistent";
    narrator: "off" | "minimal" | "scenic";
    openingMode: "authored" | "generated" | "off";
    narratorVoiceId: string | null;
    openingNarration: string;
  };
  graphNodes: SceneGraphPayload["nodes"];
  characterById: Map<string, SceneLibraryCharacter>;
  onSceneChange: {
    setPrompt: (next: string) => void;
    setOpeningBeat: (next: string) => void;
    setStatus: (next: "draft" | "active" | "archived") => void;
  };
  onOpenTab: (tab: SceneTab) => void;
}) {
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [readinessError, setReadinessError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/scenes/${encodeURIComponent(sceneId)}/sandbox/readiness`)
      .then((res) => {
        if (!res.ok) throw new Error("readiness failed");
        return res.json() as Promise<{ report?: ReadinessReport }>;
      })
      .then((data) => {
        if (!cancelled && data.report) setReadiness(data.report);
      })
      .catch(() => {
        if (!cancelled) setReadinessError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  const cast = graphNodes.filter((n) => n.kind === "character");
  const audio = graphNodes.filter((n) => n.kind === "audio" || n.kind === "ambience");
  const beats = graphNodes
    .filter((n) => n.kind === "event")
    .sort((a, b) => {
      const ai = typeof a.data.timeIndex === "number" ? a.data.timeIndex : 0;
      const bi = typeof b.data.timeIndex === "number" ? b.data.timeIndex : 0;
      return ai - bi;
    });
  const placedCount = graphNodes.filter((n) => n.position != null).length;

  return (
    <div style={tabScrollStyle}>
      <div style={overviewGridStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>
          <InspectorSection
            title="Premise"
            hint="What the director reads to understand the setting."
          >
            <Field label="Description / premise">
              <textarea
                value={scene.prompt}
                onChange={(event) => onSceneChange.setPrompt(event.target.value)}
                rows={4}
                placeholder="1-3 sentences the orchestrator reads to understand the setting."
                style={textareaStyle}
              />
            </Field>
            <Field label="Opening beat">
              <input
                value={scene.openingBeat}
                onChange={(event) => onSceneChange.setOpeningBeat(event.target.value)}
                placeholder="The beat the scene opens on."
                style={inputStyle}
              />
            </Field>
            <Field label="Status">
              <select
                value={scene.status}
                onChange={(event) =>
                  onSceneChange.setStatus(
                    event.target.value as "draft" | "active" | "archived",
                  )
                }
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
            </Field>
          </InspectorSection>

          <InspectorSection
            title="Ready to rehearse?"
            hint="Live checks against the definition, cast, voices, and persistence."
          >
            {readinessError ? (
              <p style={mutedTextStyle}>Readiness check unavailable.</p>
            ) : !readiness ? (
              <p style={mutedTextStyle}>Checking…</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
                {readiness.checks.map((check) => (
                  <div
                    key={check.id}
                    style={{ display: "flex", alignItems: "baseline", gap: "var(--space-10)" }}
                  >
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        width: 8,
                        height: 8,
                        borderRadius: "var(--radius-pill)",
                        background:
                          check.status === "ready"
                            ? "var(--accent-strong)"
                            : check.status === "warning"
                              ? "var(--status-draft)"
                              : T.danger,
                        transform: "translateY(-1px)",
                      }}
                    />
                    <span style={{ fontSize: "var(--font-size-sm)", color: T.fg }}>
                      {check.label}
                    </span>
                    <span
                      style={{
                        fontSize: "var(--font-size-xs)",
                        color: T.muted,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {check.summary}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </InspectorSection>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <PreviewCard
            kicker={`Canvas · ${placedCount} placed`}
            onOpen={() => onOpenTab("canvas")}
          >
            <p style={mutedTextStyle}>
              {placedCount === 0
                ? "Nothing is on the stage yet."
                : `${placedCount} of ${graphNodes.length} nodes placed on the stage.`}
            </p>
          </PreviewCard>

          <PreviewCard kicker={`Cast · ${cast.length}`} onOpen={() => onOpenTab("cast")}>
            {cast.length === 0 ? (
              <p style={mutedTextStyle}>No characters yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
                {cast.map((node) => {
                  const character = node.refId ? characterById.get(node.refId) : undefined;
                  return (
                    <div
                      key={node.id}
                      style={{ display: "flex", alignItems: "center", gap: "var(--space-8)" }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 22,
                          height: 22,
                          flexShrink: 0,
                          borderRadius: "var(--radius-pill)",
                          background: character?.image
                            ? `center / cover no-repeat url(${character.image})`
                            : resolveAvatarGradient(
                                character?.thumbnailColor ?? null,
                                character?.slug ?? node.label,
                              ),
                        }}
                      />
                      <span style={{ fontSize: "var(--font-size-sm)", color: T.fg }}>
                        {node.label}
                      </span>
                      <span style={{ fontSize: "var(--font-size-xs)", color: T.muted }}>
                        {typeof node.data.roleInScene === "string" ? node.data.roleInScene : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </PreviewCard>

          <PreviewCard
            kicker={`Environment · ${audio.length}`}
            onOpen={() => onOpenTab("environment")}
          >
            {audio.length === 0 ? (
              <p style={mutedTextStyle}>No sound in the scene yet.</p>
            ) : (
              <p style={mutedTextStyle}>
                {audio
                  .map(
                    (node) =>
                      `${node.label}${node.data.role === "oneshot" ? " (one-shot)" : node.kind === "audio" ? " (bed)" : ""}`,
                  )
                  .join(" · ")}
              </p>
            )}
          </PreviewCard>

          <PreviewCard kicker="Narrator" onOpen={() => onOpenTab("narrator")}>
            <p style={mutedTextStyle}>
              {scene.narrator === "off"
                ? "Off — no narrator in this scene."
                : `${scene.narrator} · opens ${scene.openingMode}${scene.narratorVoiceId ? "" : " · no voice bound"}`}
            </p>
            {scene.narrator !== "off" && scene.openingNarration && (
              <p style={{ ...mutedTextStyle, fontStyle: "italic" }}>
                “{scene.openingNarration.length > 140
                  ? `${scene.openingNarration.slice(0, 140)}…`
                  : scene.openingNarration}”
              </p>
            )}
          </PreviewCard>

          <PreviewCard kicker={`Game · ${beats.length} beats`} onOpen={() => onOpenTab("game")}>
            <p style={mutedTextStyle}>
              {scene.objective
                ? scene.objective
                : "No objective yet — the director follows the user's lead."}
            </p>
            {beats.length > 0 && (
              <p style={mutedTextStyle}>
                {beats.map((beat, index) => `${index + 1}. ${beat.label}`).join("  ·  ")}
              </p>
            )}
          </PreviewCard>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  kicker,
  onOpen,
  children,
}: {
  kicker: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-10)",
        padding: "16px 18px",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        background: T.panel,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={kickerStyle}>{kicker}</span>
        <button
          type="button"
          onClick={onOpen}
          style={{
            ...subtleLinkStyle,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: 0,
          }}
        >
          open tab →
        </button>
      </div>
      {children}
    </section>
  );
}

const overviewGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
  gap: 32,
  alignItems: "start",
  maxWidth: 1180,
  color: T.fg,
  fontFamily: T.fontBody,
};

const mutedTextStyle: CSSProperties = {
  margin: 0,
  color: T.muted,
  fontFamily: T.fontBody,
  fontSize: "var(--font-size-sm)",
  lineHeight: "19px",
};
