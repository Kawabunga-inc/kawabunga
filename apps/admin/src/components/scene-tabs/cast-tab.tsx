"use client";

import type {
  SceneGraphPayload,
  SceneLibraryCharacter,
} from "@/app/(authenticated)/scenes/[sceneId]/page";
import { resolveAvatarGradient } from "@/lib/avatar-gradients";
import {
  Field,
  InspectorSection,
  inputStyle,
  ListDetailLayout,
  NodeRow,
} from "./shared";
import { NodeInspector } from "./node-inspector";

export function CastTab({
  sceneId,
  pending,
  graphNodes,
  characterById,
  addableCharacters,
  selectedNodeId,
  onSelect,
  onAddCharacter,
  onRemoveNode,
  onNodeSaved,
}: {
  sceneId: string;
  pending: boolean;
  graphNodes: SceneGraphPayload["nodes"];
  characterById: Map<string, SceneLibraryCharacter>;
  addableCharacters: SceneLibraryCharacter[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  onAddCharacter: (characterId: string) => void;
  onRemoveNode: (nodeId: string) => void;
  onNodeSaved: (
    nodeId: string,
    patch: Partial<SceneGraphPayload["nodes"][number]>,
  ) => void;
}) {
  const cast = graphNodes.filter((n) => n.kind === "character");
  const selected = cast.find((n) => n.id === selectedNodeId) ?? cast[0] ?? null;

  return (
    <ListDetailLayout
      emptyDetailHint="Add a character to the scene, then select them here to direct their casting, intention, and knowledge."
      list={
        <>
          <InspectorSection
            title="Cast"
            hint="Who is in this scene; select a member to direct them."
          >
            <Field label="Add character">
              <select
                defaultValue=""
                onChange={(event) => {
                  onAddCharacter(event.target.value);
                  event.target.value = "";
                }}
                disabled={pending || addableCharacters.length === 0}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="" disabled>
                  {addableCharacters.length === 0
                    ? "All characters are in this scene"
                    : "Add a character"}
                </option>
                {addableCharacters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.title}
                  </option>
                ))}
              </select>
            </Field>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
              {cast.map((node) => {
                const character = node.refId ? characterById.get(node.refId) : undefined;
                return (
                  <NodeRow
                    key={node.id}
                    selected={selected?.id === node.id}
                    onClick={() => onSelect(node.id)}
                    label={node.label}
                    meta={
                      typeof node.data.roleInScene === "string"
                        ? node.data.roleInScene
                        : character?.slug ?? "character"
                    }
                    tile={
                      <span
                        aria-hidden
                        style={{
                          width: 30,
                          height: 30,
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
                    }
                  />
                );
              })}
            </div>
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
            character={selected.refId ? characterById.get(selected.refId) ?? null : null}
            sound={null}
            onRemoveNode={onRemoveNode}
            onNodeSaved={onNodeSaved}
          />
        ) : null
      }
    />
  );
}
