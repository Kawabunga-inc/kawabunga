"use client";

import { useState } from "react";
import type {
  SceneGraphPayload,
  SceneLibrarySound,
} from "@/app/(authenticated)/scenes/[sceneId]/page";
import { AdminButton } from "@/components/admin-ui";
import {
  checkboxRowStyle,
  Field,
  InspectorSection,
  InspectorTile,
  inputStyle,
  ListDetailLayout,
  NodeRow,
} from "./shared";
import { NodeInspector } from "./node-inspector";

export function EnvironmentTab({
  sceneId,
  pending,
  graphNodes,
  soundById,
  librarySounds,
  defaultAmbience,
  selectedNodeId,
  onSelect,
  onAddAudio,
  onSetDefaultAmbience,
  onRemoveNode,
  onNodeSaved,
}: {
  sceneId: string;
  pending: boolean;
  graphNodes: SceneGraphPayload["nodes"];
  soundById: Map<string, SceneLibrarySound>;
  librarySounds: SceneLibrarySound[];
  defaultAmbience: string;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onAddAudio: (input: {
    assetId: string;
    role: "bed" | "oneshot";
    isDefault?: boolean;
    triggerHint?: string;
  }) => void;
  onSetDefaultAmbience: (next: string) => void;
  onRemoveNode: (nodeId: string) => void;
  onNodeSaved: (
    nodeId: string,
    patch: Partial<SceneGraphPayload["nodes"][number]>,
  ) => void;
}) {
  const [audioAssetId, setAudioAssetId] = useState("");
  const [audioRole, setAudioRole] = useState<"bed" | "oneshot">("bed");
  const [audioDefault, setAudioDefault] = useState(false);
  const [audioTriggerHint, setAudioTriggerHint] = useState("");

  const soundNodes = graphNodes.filter(
    (n) => n.kind === "audio" || n.kind === "ambience",
  );
  const selected = soundNodes.find((n) => n.id === selectedNodeId) ?? soundNodes[0] ?? null;

  const addAudio = () => {
    if (!audioAssetId) return;
    onAddAudio({
      assetId: audioAssetId,
      role: audioRole,
      isDefault: audioRole === "bed" ? audioDefault : false,
      triggerHint: audioTriggerHint.trim() || undefined,
    });
    setAudioAssetId("");
    setAudioRole("bed");
    setAudioDefault(false);
    setAudioTriggerHint("");
  };

  return (
    <ListDetailLayout
      emptyDetailHint="Add a sound from the library, then select it here to set its role, cue hint, and gain."
      list={
        <InspectorSection
          title="Sound"
          hint="Beds loop under the scene; one-shots wait for a director cue."
        >
          <Field label="Add audio">
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
              <select
                value={audioAssetId}
                onChange={(event) => setAudioAssetId(event.target.value)}
                disabled={pending || librarySounds.length === 0}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="" disabled>
                  {librarySounds.length === 0
                    ? "Enviro sounds library is empty - add enviro sounds at /sounds"
                    : "Pick an enviro sound from the library"}
                </option>
                {librarySounds.map((sound) => (
                  <option key={sound.id} value={sound.id}>
                    {sound.name}
                    {sound.status !== "ready" ? " (needs processing)" : ""}
                  </option>
                ))}
              </select>
              <select
                value={audioRole}
                onChange={(event) => setAudioRole(event.target.value as "bed" | "oneshot")}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="bed">bed — looping ambience</option>
                <option value="oneshot">one-shot — cueable effect</option>
              </select>
              <input
                value={audioTriggerHint}
                onChange={(event) => setAudioTriggerHint(event.target.value)}
                placeholder="Cue hint for the director, optional"
                style={inputStyle}
              />
              {audioRole === "bed" && (
                <label style={checkboxRowStyle}>
                  <input
                    type="checkbox"
                    checked={audioDefault}
                    onChange={(event) => setAudioDefault(event.target.checked)}
                  />
                  Default background bed
                </label>
              )}
              <AdminButton
                type="button"
                variant="secondary"
                disabled={pending || !audioAssetId}
                onClick={addAudio}
              >
                Add audio
              </AdminButton>
            </div>
          </Field>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            {soundNodes.map((node) => (
              <NodeRow
                key={node.id}
                selected={selected?.id === node.id}
                onClick={() => onSelect(node.id)}
                label={node.label}
                meta={
                  node.kind === "ambience"
                    ? "legacy ambience"
                    : `${node.data.role === "oneshot" ? "one-shot" : "bed"}${
                        node.data.isDefault ? " · default" : ""
                      }`
                }
                tile={
                  <span style={{ transform: "scale(0.68)", transformOrigin: "center" }}>
                    <InspectorTile kind={node.kind} />
                  </span>
                }
              />
            ))}
          </div>

          <Field label="Default ambience (legacy track id)">
            <input
              value={defaultAmbience}
              onChange={(event) => onSetDefaultAmbience(event.target.value)}
              placeholder="Ambience track id, or blank for silence."
              style={inputStyle}
            />
          </Field>
        </InspectorSection>
      }
      detail={
        selected ? (
          <NodeInspector
            key={selected.id}
            sceneId={sceneId}
            pending={pending}
            node={selected}
            character={null}
            sound={selected.refId ? soundById.get(selected.refId) ?? null : null}
            onRemoveNode={onRemoveNode}
            onNodeSaved={onNodeSaved}
          />
        ) : null
      }
    />
  );
}
