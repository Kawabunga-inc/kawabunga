"use client";

import { useState } from "react";
import type { SceneGraphPayload } from "@/app/(authenticated)/scenes/[sceneId]/page";
import { AdminButton } from "@/components/admin-ui";
import {
  Field,
  fieldHintStyle,
  fieldLabelStyle,
  InspectorSection,
  InspectorTile,
  inputStyle,
  ListDetailLayout,
  NodeRow,
  T,
  textareaStyle,
} from "./shared";
import { NodeInspector } from "./node-inspector";
import {
  matchSceneExperiencePreset,
  SCENE_EXPERIENCE_PRESETS,
  type SceneDrive,
  type SceneInitiative,
  type SceneNarrator,
  type SceneUserCharacter,
  type SceneUserRole,
} from "./types";

export function GameTab({
  sceneId,
  pending,
  graphNodes,
  scene,
  selectedNodeId,
  onSelect,
  onSceneChange,
  onAddEvent,
  onRemoveNode,
  onNodeSaved,
}: {
  sceneId: string;
  pending: boolean;
  graphNodes: SceneGraphPayload["nodes"];
  scene: {
    objective: string;
    drive: SceneDrive;
    initiative: SceneInitiative;
    narrator: SceneNarrator;
    userDirector: boolean;
    userRole: SceneUserRole;
    userCharacter: SceneUserCharacter;
  };
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onSceneChange: {
    setObjective: (next: string) => void;
    setDrive: (next: SceneDrive) => void;
    setInitiative: (next: SceneInitiative) => void;
    setNarrator: (next: SceneNarrator) => void;
    setUserDirector: (next: boolean) => void;
    setUserRole: (next: SceneUserRole) => void;
    setUserCharacter: (next: SceneUserCharacter) => void;
  };
  onAddEvent: (input: { label: string; summary?: string }) => void;
  onRemoveNode: (nodeId: string) => void;
  onNodeSaved: (
    nodeId: string,
    patch: Partial<SceneGraphPayload["nodes"][number]>,
  ) => void;
}) {
  const [beatLabel, setBeatLabel] = useState("");
  const [beatSummary, setBeatSummary] = useState("");
  const activePreset = matchSceneExperiencePreset({
    initiative: scene.initiative,
    narrator: scene.narrator,
    drive: scene.drive,
  });

  const beats = graphNodes
    .filter((n) => n.kind === "event")
    .sort((a, b) => {
      const ai = typeof a.data.timeIndex === "number" ? a.data.timeIndex : 0;
      const bi = typeof b.data.timeIndex === "number" ? b.data.timeIndex : 0;
      return ai - bi;
    });
  const selected = beats.find((n) => n.id === selectedNodeId) ?? beats[0] ?? null;

  return (
    <ListDetailLayout
      emptyDetailHint="Add an arc beat, then select it to describe what it looks like when it lands."
      list={
        <>
          <InspectorSection
            title="Direction"
            hint="Where the scene is going, and how hard the director presses."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
              <span style={fieldLabelStyle}>Scene mode</span>
              <div
                role="group"
                aria-label="Scene mode"
                style={{
                  display: "flex",
                  width: "fit-content",
                  border: "1px solid var(--control-border)",
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden",
                }}
              >
                {(
                  [
                    ["story", "Story", SCENE_EXPERIENCE_PRESETS.story],
                    ["livingSpace", "Living space", SCENE_EXPERIENCE_PRESETS.livingSpace],
                  ] as const
                ).map(([key, label, preset], i) => {
                  const active = activePreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        onSceneChange.setInitiative(preset.initiative);
                        onSceneChange.setNarrator(preset.narrator);
                        onSceneChange.setDrive(preset.drive);
                      }}
                      style={{
                        height: 34,
                        padding: "0 16px",
                        border: "none",
                        borderLeft: i > 0 ? "1px solid var(--control-border)" : "none",
                        cursor: "pointer",
                        background: active ? "var(--accent-soft)" : "var(--control-bg)",
                        color: active ? "var(--accent-on)" : T.muted,
                        fontFamily: T.fontBody,
                        fontSize: "var(--font-size-sm)",
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p style={fieldHintStyle}>
                {activePreset === "story"
                  ? "Story — the world drives: narrator initiative, scenic narration, insistent drive."
                  : activePreset === "livingSpace"
                    ? "Living space — the visitor paces: user initiative, minimal narration, gentle drive."
                    : "Custom — the dials below are set individually. Pick a mode to snap them to a preset; changing any dial returns to Custom."}
              </p>
            </div>
            <Field label="Scene objective">
              <textarea
                value={scene.objective}
                onChange={(event) => onSceneChange.setObjective(event.target.value)}
                rows={2}
                placeholder="What the scene is driving toward — the director writes beats in service of this."
                style={textareaStyle}
              />
            </Field>
            <Field label="Director drive">
              <select
                value={scene.drive}
                onChange={(event) =>
                  onSceneChange.setDrive(
                    event.target.value as SceneDrive,
                  )
                }
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="gentle">gentle — follow the user&apos;s lead</option>
                <option value="balanced">balanced — default pacing</option>
                <option value="insistent">insistent — press toward goals</option>
              </select>
            </Field>
            <Field label="Initiative">
              <select
                value={scene.initiative}
                onChange={(event) =>
                  onSceneChange.setInitiative(event.target.value as SceneInitiative)
                }
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="user">user — the visitor paces the story</option>
                <option value="shared">shared — tension can advance the world</option>
                <option value="narrator">narrator — the world drives the story</option>
              </select>
            </Field>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
              <span style={fieldLabelStyle}>Director mode</span>
              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-8)" }}>
                <input
                  type="checkbox"
                  checked={scene.userDirector}
                  onChange={(event) => onSceneChange.setUserDirector(event.target.checked)}
                />
                <span>Visitor can author world events by addressing the narrator</span>
              </label>
            </div>
            <Field label="Visitor role">
              <select
                value={scene.userRole}
                onChange={(event) =>
                  onSceneChange.setUserRole(event.target.value as SceneUserRole)
                }
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="visitor">visitor — they enter as themselves</option>
                <option value="character">character — they play an authored role</option>
              </select>
            </Field>
            {scene.userRole === "character" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
                <Field label="Role name">
                  <input
                    value={scene.userCharacter.name}
                    onChange={(event) =>
                      onSceneChange.setUserCharacter({
                        ...scene.userCharacter,
                        name: event.target.value,
                      })
                    }
                    placeholder="The role the visitor plays"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Role description">
                  <textarea
                    value={scene.userCharacter.blurb}
                    onChange={(event) =>
                      onSceneChange.setUserCharacter({
                        ...scene.userCharacter,
                        blurb: event.target.value,
                      })
                    }
                    rows={2}
                    placeholder="Who they are in this fiction"
                    style={textareaStyle}
                  />
                </Field>
                <Field label="Relationship to the cast">
                  <input
                    value={scene.userCharacter.relationship ?? ""}
                    onChange={(event) =>
                      onSceneChange.setUserCharacter({
                        ...scene.userCharacter,
                        relationship: event.target.value,
                      })
                    }
                    placeholder="Guest, rival, sibling, messenger…"
                    style={inputStyle}
                  />
                </Field>
              </div>
            )}
          </InspectorSection>

          <InspectorSection
            title="Arc"
            hint="Ordered beats the dramaturg tracks; landed beats advance the director."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
              {beats.map((node, index) => (
                <NodeRow
                  key={node.id}
                  selected={selected?.id === node.id}
                  onClick={() => onSelect(node.id)}
                  label={node.label}
                  meta={`beat ${index + 1}`}
                  tile={
                    <span style={{ transform: "scale(0.68)", transformOrigin: "center" }}>
                      <InspectorTile kind="event" />
                    </span>
                  }
                />
              ))}
            </div>
            <Field label="Add arc beat">
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
                <input
                  value={beatLabel}
                  onChange={(event) => setBeatLabel(event.target.value)}
                  placeholder="Beat name, e.g. Sarah's laugh — and the denial"
                  style={inputStyle}
                />
                <textarea
                  value={beatSummary}
                  onChange={(event) => setBeatSummary(event.target.value)}
                  rows={2}
                  placeholder="What it looks like when this beat lands (optional)."
                  style={textareaStyle}
                />
                <AdminButton
                  type="button"
                  variant="secondary"
                  disabled={pending || !beatLabel.trim()}
                  onClick={() => {
                    onAddEvent({
                      label: beatLabel.trim(),
                      summary: beatSummary.trim() || undefined,
                    });
                    setBeatLabel("");
                    setBeatSummary("");
                  }}
                >
                  Add arc beat
                </AdminButton>
              </div>
            </Field>
          </InspectorSection>
        </>
      }
      detail={
        selected ? (
          <NodeInspector
            key={selected.id}
            sceneId={sceneId}
            pending={pending}
            node={selected}
            character={null}
            sound={null}
            onRemoveNode={onRemoveNode}
            onNodeSaved={onNodeSaved}
          />
        ) : null
      }
    />
  );
}
