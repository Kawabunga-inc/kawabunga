import type { Scene } from "@kawabunga/types";

// Static scene registry — code-authored scenes that exist without a DB row.
//
// Current role: stable fixtures for benchmarks and headless runs (sonar's
// scene-roster-baseline, simulate-scene, the LiveKit smoke path) — places
// where a canvas-editable DB scene would make results drift under edits.
// Authored production scenes live in the scenes table.
//
// ORDERING CAVEAT: every resolver (SceneDriver.load, admin resolveScene)
// checks this registry BEFORE the DB, so a registry id shadows any DB scene
// with the same id. DB ids are UUIDs and registry ids are slugs, so a
// collision takes deliberate effort — but never add a registry id that
// could collide with an authored scene's id or slug.

const ABRAHAMS_TENT: Scene = {
  id: "abrahams-tent",
  title: "Abraham's tent at Mamre",
  description:
    "Abraham and Sarah are camped beneath the oaks at Mamre, late afternoon. Three strangers have just departed after telling Abraham — well past the age of childbearing — that Sarah will bear him a son within the year. Sarah, listening from inside the tent, laughed. Abraham heard her. The user is a traveler who has come upon their camp at this moment.",
  characters: [
    {
      characterSlug: "abraham",
      displayName: "Abraham",
      // sarah.safetensors may not exist in every local audio runtime yet.
      // Keep Abraham on the baked voice slug until voice binding resolves it.
      voice: "abraham",
      blurb:
        "Old shepherd-patriarch. Plainspoken. Just heard from three strangers that Sarah will bear a son. Caught between awe and the embarrassment of his wife's laughter.",
    },
    {
      characterSlug: "sarah",
      displayName: "Sarah",
      voice: "sarah",
      blurb:
        "Sarah, ninety years old, barren her whole life. She laughed inside the tent when she overheard the promise. Now denying she laughed — afraid, defensive, sharp-tongued.",
    },
  ],
  openingBeat:
    "The strangers have just left. Sarah's laughter still hangs in the air. The user has arrived at the camp.",
  defaultAmbience: "tent-evening",
  // Routed through OpenAI TTS in the current scene runner.
  narratorVoice: "fable",
};

const SCENES: Record<string, Scene> = {
  [ABRAHAMS_TENT.id]: ABRAHAMS_TENT,
};

export function getScene(id: string): Scene | null {
  return SCENES[id] ?? null;
}

export function listScenes(): Scene[] {
  return Object.values(SCENES);
}
