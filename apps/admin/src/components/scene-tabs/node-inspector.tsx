"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  SceneGraphPayload,
  SceneLibraryCharacter,
  SceneLibrarySound,
} from "@/app/(authenticated)/scenes/[sceneId]/page";
import { updateSceneNode } from "@/app/(authenticated)/scenes/actions";
import { AdminButton } from "@/components/admin-ui";
import type { TabItem } from "@/components/tab-bar";
import { resolveAvatarGradient } from "@/lib/avatar-gradients";
import {
  asString,
  checkboxRowStyle,
  compactObject,
  Field,
  InspectorSection,
  InspectorShellHeader,
  InspectorTabBand,
  InspectorTile,
  inputStyle,
  inspectorScrollStyle,
  relativeTime,
  subtleLinkStyle,
  T,
  textareaStyle,
} from "./shared";

/* Per-node editor (character / audio / ambience / event), moved
 * verbatim from scene-editor.tsx's GraphNodeInspector when the editor
 * went tabbed. Owns its own 900ms-debounced autosave per node. */
export function NodeInspector({
  sceneId,
  pending,
  node,
  character,
  sound,
  onRemoveNode,
  onNodeSaved,
}: {
  sceneId: string;
  pending: boolean;
  node: SceneGraphPayload["nodes"][number];
  character: SceneLibraryCharacter | null;
  sound: SceneLibrarySound | null;
  onRemoveNode: (nodeId: string) => void;
  onNodeSaved: (
    nodeId: string,
    patch: Partial<SceneGraphPayload["nodes"][number]>,
  ) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"casting" | "intention" | "knowledge">("casting");
  const [label, setLabel] = useState(node.label);
  const [summary, setSummary] = useState(node.summary ?? "");
  const [roleInScene, setRoleInScene] = useState(asString(node.data.roleInScene));
  const [archetype, setArchetype] = useState(asString(node.data.archetype));
  const [emotionalBaseline, setEmotionalBaseline] = useState(
    asString(node.data.emotionalBaseline),
  );
  const [motivations, setMotivations] = useState(asString(node.data.motivations));
  const [speakingStyle, setSpeakingStyle] = useState(asString(node.data.speakingStyle));
  // Condition → behavior pairs the director acts on ("when the promise is
  // doubted" → "press with the story of the stars"). Rows with either half
  // empty are dropped on save.
  const [behaviorTriggers, setBehaviorTriggers] = useState<
    Array<{ condition: string; behavior: string }>
  >(
    Array.isArray(node.data.behaviorTriggers)
      ? (node.data.behaviorTriggers as Array<{ condition?: string; behavior?: string }>).map(
          (t) => ({ condition: t.condition ?? "", behavior: t.behavior ?? "" }),
        )
      : [],
  );
  // Knowledge horizon: the scene's dramatic present on THIS character's era
  // timeline. Era "" = no horizon (the character knows their whole life).
  const savedHorizon = node.data.knowledgeHorizon as
    | { era?: string; index?: number }
    | undefined;
  const [horizonEra, setHorizonEra] = useState(asString(savedHorizon?.era));
  const [horizonIndex, setHorizonIndex] = useState(
    typeof savedHorizon?.index === "number" ? String(savedHorizon.index) : "0",
  );
  const [trackId, setTrackId] = useState(asString(node.data.trackId));
  const [ambienceDescription, setAmbienceDescription] = useState(
    asString(node.data.description),
  );
  const [isDefaultAmbience, setIsDefaultAmbience] = useState(node.data.isDefault === true);
  const [audioRole, setAudioRole] = useState<"bed" | "oneshot">(
    asString(node.data.role) === "oneshot" ? "oneshot" : "bed",
  );
  const [audioTriggerHint, setAudioTriggerHint] = useState(
    asString(node.data.triggerHint),
  );
  const [audioGainDb, setAudioGainDb] = useState(
    typeof node.data.gainDb === "number" ? String(node.data.gainDb) : "",
  );
  const [eventTimeIndex, setEventTimeIndex] = useState(
    typeof node.data.timeIndex === "number" ? String(node.data.timeIndex) : "0",
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, startSaving] = useTransition();

  const saveNode = useCallback(() => {
    const parsedGain = Number(audioGainDb);
    const cleanedTriggers = behaviorTriggers
      .map((t) => ({ condition: t.condition.trim(), behavior: t.behavior.trim() }))
      .filter((t) => t.condition && t.behavior);
    const nextData =
      node.kind === "character"
        ? compactObject({
            ...node.data,
            roleInScene,
            archetype,
            emotionalBaseline,
            motivations,
            speakingStyle,
            behaviorTriggers: cleanedTriggers.length ? cleanedTriggers : undefined,
            knowledgeHorizon: horizonEra
              ? {
                  era: horizonEra,
                  index: Number.isFinite(Number(horizonIndex))
                    ? Math.trunc(Number(horizonIndex))
                    : 0,
                }
              : undefined,
          })
        : node.kind === "ambience"
          ? compactObject({
              trackId,
              description: ambienceDescription,
              isDefault: isDefaultAmbience,
            })
        : node.kind === "event"
          ? compactObject({
              ...node.data,
              timeIndex: Number.isFinite(Number(eventTimeIndex))
                ? Math.trunc(Number(eventTimeIndex))
                : 0,
            })
        : node.kind === "audio"
          ? {
              ...(typeof node.data.rangeM === "number" ? { rangeM: node.data.rangeM } : {}),
              role: audioRole,
              ...(audioTriggerHint.trim()
                ? { triggerHint: audioTriggerHint.trim() }
                : {}),
              ...(audioRole === "bed" && isDefaultAmbience
                ? { isDefault: true }
                : {}),
              ...(audioGainDb.trim() && Number.isFinite(parsedGain)
                ? { gainDb: parsedGain }
                : {}),
            }
        : node.data;

    startSaving(async () => {
      const res = await updateSceneNode(sceneId, node.id, {
        label: label.trim() || node.label,
        summary: summary.trim() || null,
        data: nextData,
      });
      if (res.ok) {
        setSavedAt(Date.now());
        onNodeSaved(node.id, {
          label: label.trim() || node.label,
          summary: summary.trim() || null,
          data: nextData,
        });
      }
    });
  }, [
    ambienceDescription,
    archetype,
    audioGainDb,
    audioRole,
    audioTriggerHint,
    behaviorTriggers,
    emotionalBaseline,
    eventTimeIndex,
    horizonEra,
    horizonIndex,
    isDefaultAmbience,
    label,
    motivations,
    node,
    onNodeSaved,
    roleInScene,
    sceneId,
    speakingStyle,
    summary,
    trackId,
  ]);

  /* Auto-save — no save button, matching the character config sidebar.
   * Debounced 900ms past the last edit; the snapshot ref stops the mount
   * from writing before anything changed. */
  const fieldSnapshot = JSON.stringify([
    label,
    summary,
    roleInScene,
    archetype,
    emotionalBaseline,
    motivations,
    speakingStyle,
    behaviorTriggers,
    horizonEra,
    horizonIndex,
    trackId,
    ambienceDescription,
    isDefaultAmbience,
    audioRole,
    audioTriggerHint,
    audioGainDb,
    eventTimeIndex,
  ]);
  const savedFieldSnapshot = useRef(fieldSnapshot);
  useEffect(() => {
    if (fieldSnapshot === savedFieldSnapshot.current) return;
    const timer = setTimeout(() => {
      savedFieldSnapshot.current = fieldSnapshot;
      saveNode();
    }, 900);
    return () => clearTimeout(timer);
  }, [fieldSnapshot, saveNode]);

  const metaSlug = character
    ? character.slug
    : sound
      ? sound.slug
      : asString(node.data.trackId) || (node.refId ?? "native node");
  const saveState = saving || pending
    ? "saving…"
    : savedAt
      ? `auto-saved · ${relativeTime(savedAt)}`
      : "auto-save on";

  const menuItems = [
    ...(character
      ? [{ value: "open-character", label: "Open character", meta: character.slug }]
      : []),
    ...(node.kind === "audio"
      ? [{ value: "open-sounds", label: "Open enviro sounds", meta: "library" }]
      : []),
    { value: "remove", label: "Remove from scene", meta: "deletes this node" },
  ];

  const characterTabs: Array<TabItem<"casting" | "intention" | "knowledge">> = [
    { key: "casting", label: "Casting", onClick: () => setTab("casting") },
    { key: "intention", label: "Intention", onClick: () => setTab("intention") },
    { key: "knowledge", label: "Knowledge", onClick: () => setTab("knowledge") },
  ];

  return (
    <>
      <InspectorShellHeader
        tile={
          <InspectorTile
            kind={node.kind}
            image={character?.image ?? null}
            gradient={
              character
                ? resolveAvatarGradient(character.thumbnailColor, character.slug)
                : undefined
            }
            initial={(label || "•").charAt(0).toUpperCase()}
          />
        }
        title={label}
        onTitleChange={setLabel}
        meta={`${node.kind === "audio" ? `audio · ${audioRole}` : node.kind} · ${metaSlug} · ${saveState}`}
        menuItems={menuItems}
        onMenuAction={(action) => {
          if (action === "open-character" && character) {
            router.push(`/characters/${character.slug}`);
          } else if (action === "open-sounds") {
            router.push("/sounds");
          } else if (action === "remove") {
            onRemoveNode(node.id);
          }
        }}
      />

      {node.kind === "character" && (
        <InspectorTabBand tabs={characterTabs} active={tab} />
      )}

      <div style={inspectorScrollStyle}>
        {node.kind === "character" && tab === "casting" && (
          <InspectorSection
            title="Casting"
            hint="How this character sits in the scene — the director reads all of it."
          >
            <Field label="Scene summary">
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                rows={3}
                placeholder="How this node matters in this scene."
                style={textareaStyle}
              />
            </Field>
            <Field label="Role in scene">
              <input
                value={roleInScene}
                onChange={(event) => setRoleInScene(event.target.value)}
                placeholder="Host, witness, antagonist..."
                style={inputStyle}
              />
            </Field>
            <Field label="Archetype">
              <input
                value={archetype}
                onChange={(event) => setArchetype(event.target.value)}
                placeholder="Reluctant matriarch, anxious servant..."
                style={inputStyle}
              />
            </Field>
            <Field label="Emotional baseline">
              <input
                value={emotionalBaseline}
                onChange={(event) => setEmotionalBaseline(event.target.value)}
                placeholder="Guarded, hopeful, defensive..."
                style={inputStyle}
              />
            </Field>
          </InspectorSection>
        )}

        {node.kind === "character" && tab === "intention" && (
          <>
            <InspectorSection
              title="Intention"
              hint="What they want here, and how they speak while wanting it."
            >
              <Field label="Motivations">
                <textarea
                  value={motivations}
                  onChange={(event) => setMotivations(event.target.value)}
                  rows={3}
                  style={textareaStyle}
                />
              </Field>
              <Field label="Speaking style">
                <textarea
                  value={speakingStyle}
                  onChange={(event) => setSpeakingStyle(event.target.value)}
                  rows={3}
                  placeholder="Imagery, cadence, deflections — rides every turn as their manner in this scene."
                  style={textareaStyle}
                />
              </Field>
            </InspectorSection>
            <InspectorSection
              title="Behavior triggers"
              hint="Condition → behavior pairs the director fires when the moment matches."
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}
              >
                {behaviorTriggers.map((trigger, index) => (
                  <div
                    key={index}
                    style={{ display: "flex", gap: "var(--space-6)", alignItems: "center" }}
                  >
                    <input
                      value={trigger.condition}
                      onChange={(event) =>
                        setBehaviorTriggers((prev) =>
                          prev.map((t, i) =>
                            i === index ? { ...t, condition: event.target.value } : t,
                          ),
                        )
                      }
                      placeholder="when…"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <input
                      value={trigger.behavior}
                      onChange={(event) =>
                        setBehaviorTriggers((prev) =>
                          prev.map((t, i) =>
                            i === index ? { ...t, behavior: event.target.value } : t,
                          ),
                        )
                      }
                      placeholder="they…"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      type="button"
                      aria-label="Remove trigger"
                      onClick={() =>
                        setBehaviorTriggers((prev) => prev.filter((_, i) => i !== index))
                      }
                      style={{
                        flexShrink: 0,
                        width: 28,
                        height: 28,
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--ink-line)",
                        background: "transparent",
                        color: T.muted,
                        cursor: "pointer",
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <AdminButton
                  type="button"
                  variant="secondary"
                  disabled={behaviorTriggers.length >= 6}
                  onClick={() =>
                    setBehaviorTriggers((prev) => [
                      ...prev,
                      { condition: "", behavior: "" },
                    ])
                  }
                >
                  + add trigger
                </AdminButton>
              </div>
            </InspectorSection>
          </>
        )}

        {node.kind === "character" && tab === "knowledge" && (
          <InspectorSection
            title="Knowledge horizon"
            hint="The scene's dramatic present on this character's own timeline."
          >
            <div style={{ display: "flex", gap: "var(--space-6)", alignItems: "center" }}>
              <select
                value={horizonEra}
                onChange={(event) => setHorizonEra(event.target.value)}
                style={{ ...inputStyle, flex: 1, cursor: "pointer" }}
              >
                <option value="">none — knows their whole life</option>
                {[...(character?.eras ?? [])]
                  .sort((a, b) => a.order - b.order)
                  .map((era) => (
                    <option key={era.key} value={era.key}>
                      {era.title}
                    </option>
                  ))}
              </select>
              <input
                type="number"
                value={horizonIndex}
                onChange={(event) => setHorizonIndex(event.target.value)}
                disabled={!horizonEra}
                title="Position within the era (wiki-page timeIndex)"
                style={{ ...inputStyle, width: 88, flexShrink: 0 }}
              />
            </div>
            <p
              style={{
                margin: 0,
                color: T.muted,
                lineHeight: "19px",
                fontSize: "var(--font-size-sm)",
              }}
            >
              Wiki pages time-indexed after this moment are withheld from their
              context (pages marked &quot;knows future&quot; still pass).
            </p>
          </InspectorSection>
        )}

        {node.kind === "ambience" && (
          <InspectorSection title="Ambience">
            <Field label="Track ID">
              <input
                value={trackId}
                onChange={(event) => setTrackId(event.target.value)}
                placeholder="Existing public ambience filename without .mp3"
                style={inputStyle}
              />
            </Field>
            <Field label="Description">
              <textarea
                value={ambienceDescription}
                onChange={(event) => setAmbienceDescription(event.target.value)}
                rows={3}
                placeholder="How this bed should feel in the scene."
                style={textareaStyle}
              />
            </Field>
            <label style={checkboxRowStyle}>
              <input
                type="checkbox"
                checked={isDefaultAmbience}
                onChange={(event) => setIsDefaultAmbience(event.target.checked)}
              />
              Default background bed
            </label>
          </InspectorSection>
        )}

        {node.kind === "audio" && (
          <>
            <InspectorSection title="In the scene">
              {sound?.description && (
                <p
                  style={{
                    margin: 0,
                    color: T.muted,
                    fontFamily: T.fontBody,
                    fontSize: "var(--font-size-base)",
                    lineHeight: "19px",
                  }}
                >
                  {sound.description}
                </p>
              )}
              <Field label="Scene summary">
                <textarea
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  rows={3}
                  placeholder="How this sound matters in this scene."
                  style={textareaStyle}
                />
              </Field>
            </InspectorSection>
            <InspectorSection
              title="Playback"
              hint="Beds loop under the scene; one-shots wait for a director cue."
            >
              <Field label="Role">
                <select
                  value={audioRole}
                  onChange={(event) =>
                    setAudioRole(event.target.value as "bed" | "oneshot")
                  }
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="bed">bed — looping ambience</option>
                  <option value="oneshot">one-shot — cueable effect</option>
                </select>
              </Field>
              <Field label="Cue hint (what the director reads)">
                <input
                  value={audioTriggerHint}
                  onChange={(event) => setAudioTriggerHint(event.target.value)}
                  placeholder="e.g. when the fire is mentioned"
                  style={inputStyle}
                />
              </Field>
              <Field label="Gain trim (dB, −24…+12)">
                <input
                  value={audioGainDb}
                  onChange={(event) => setAudioGainDb(event.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  style={inputStyle}
                />
              </Field>
              {audioRole === "bed" && (
                <label style={checkboxRowStyle}>
                  <input
                    type="checkbox"
                    checked={isDefaultAmbience}
                    onChange={(event) => setIsDefaultAmbience(event.target.checked)}
                  />
                  Default background bed
                </label>
              )}
            </InspectorSection>
          </>
        )}

        {node.kind === "event" && (
          <InspectorSection
            title="Arc beat"
            hint="The dramaturg lands this when it happens on stage."
          >
            <Field label="Scene summary">
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                rows={3}
                placeholder="What it looks like when this beat lands."
                style={textareaStyle}
              />
            </Field>
            <Field label="Arc position (0 = first beat)">
              <input
                value={eventTimeIndex}
                onChange={(event) => setEventTimeIndex(event.target.value)}
                inputMode="numeric"
                style={inputStyle}
              />
            </Field>
          </InspectorSection>
        )}

        {node.kind === "character" && tab === "casting" && (
          <p style={{ margin: 0 }}>
            <Link href={`/characters/${character?.slug ?? ""}`} style={subtleLinkStyle}>
              open character
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
