"use client";

import { VoiceLibraryPicker, type PickerVoice } from "@/components/voice-library-picker";
import {
  Field,
  fieldHintStyle,
  InspectorSection,
  inputStyle,
  tabColumnStyle,
  tabScrollStyle,
  textareaStyle,
} from "./shared";

export function NarratorTab({
  scene,
  voiceOptions,
  onSceneChange,
}: {
  scene: {
    narratorVoiceId: string | null;
    narrator: "off" | "minimal" | "scenic";
    openingMode: "authored" | "generated" | "off";
    openingNarration: string;
    openingVariants: string;
  };
  voiceOptions: PickerVoice[];
  onSceneChange: {
    setNarratorVoiceId: (next: string | null) => void;
    setNarrator: (next: "off" | "minimal" | "scenic") => void;
    setOpeningMode: (next: "authored" | "generated" | "off") => void;
    setOpeningNarration: (next: string) => void;
    setOpeningVariants: (next: string) => void;
  };
}) {
  return (
    <div style={tabScrollStyle}>
      <div style={tabColumnStyle}>
        <InspectorSection
          title="Narrator"
          hint="The unseen presence: sets the scene on entry, answers the user, and renders what they do."
        >
          <Field label="Narrator voice">
            <VoiceLibraryPicker
              currentVoiceId={scene.narratorVoiceId}
              voices={voiceOptions}
              onChange={onSceneChange.setNarratorVoiceId}
            />
          </Field>
          <Field label="Presence">
            <select
              value={scene.narrator}
              onChange={(event) =>
                onSceneChange.setNarrator(event.target.value as "off" | "minimal" | "scenic")
              }
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="off">off — no narrator in this scene</option>
              <option value="minimal">
                minimal — opening, answers the user, renders their actions
              </option>
              <option value="scenic">scenic — also grounds the space and unfolds events</option>
            </select>
          </Field>
          <Field label="Opening">
            <select
              value={scene.openingMode}
              onChange={(event) =>
                onSceneChange.setOpeningMode(
                  event.target.value as "authored" | "generated" | "off",
                )
              }
              disabled={scene.narrator === "off"}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="authored">authored — play what you write, every time</option>
              <option value="generated">
                generated — the narrator writes it fresh each session
              </option>
              <option value="off">off — the scene opens in silence</option>
            </select>
          </Field>
          {scene.narrator !== "off" && scene.openingMode !== "off" && (
            <Field
              label={
                scene.openingMode === "generated"
                  ? "Opening narration (fallback)"
                  : "Opening narration"
              }
            >
              <textarea
                value={scene.openingNarration}
                onChange={(event) => onSceneChange.setOpeningNarration(event.target.value)}
                rows={4}
                placeholder="What the narrator says the moment the user arrives — before anyone speaks. Present tense, sensory, 2-4 sentences."
                style={textareaStyle}
              />
              <p style={fieldHintStyle}>
                {scene.openingMode === "generated"
                  ? "Generated openings are written from the premise, cast, and opening beat — and fenced off from arc beats so the scene still earns them. This line plays if generation is unavailable."
                  : "Played verbatim on arrival."}
              </p>
            </Field>
          )}
          {scene.narrator !== "off" && scene.openingMode === "authored" && (
            <Field label="Alternate openings">
              <textarea
                value={scene.openingVariants}
                onChange={(event) => onSceneChange.setOpeningVariants(event.target.value)}
                rows={4}
                placeholder="Optional. One per line — a session picks at random, so repeat visits don't replay the same words."
                style={textareaStyle}
              />
            </Field>
          )}
        </InspectorSection>
      </div>
    </div>
  );
}
