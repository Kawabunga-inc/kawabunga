/**
 * THE NARRATOR — the unified scene orchestrator.
 *
 * One mind, three faculties, split by latency so authorship and
 * performance never compete for the same milliseconds:
 *
 *   - The DIRECTOR (client.ts + executor.ts) — fast, strict-JSON, on the
 *     voice hot path. Picks who speaks, writes the one-line `beat`,
 *     manages presence/ambience/sfx. It PERFORMS the story; it does not
 *     write it.
 *   - The CHRONICLER (dramaturg.ts; code keeps the original name) — a
 *     stronger model, async, off the hot path. It WRITES the story: the
 *     chronicle (story-so-far, open threads, world state, prepared
 *     intentions — SceneChronicle in client.ts), plus durable facts, arc
 *     landings, roster truth, and the director's note. The director reads
 *     all of it on every decision.
 *   - The VOICE — the narration channel (SceneDriver.onNarrate, the
 *     narrate action, openings). It renders the world aloud; it has no
 *     mind of its own.
 *
 * Planned evolutions (seams already in place):
 *   - Anticipatory drafting: extend SceneDriver.speculate() from
 *     decisions to chronicler-authored candidate narration/beats, so the
 *     hot path selects-and-adapts instead of generating.
 *   - Timed world events: chronicle intents with schedules feeding the
 *     host's idle loop, so the world originates events on its own clock.
 *   - Streaming narration: route the voice through the streaming TTS
 *     pipeline (today it is batch complete() + batch synthesis).
 */
export * from "./client";
export * from "./dramaturg";
export * from "./executor";
export * from "./journal";
export * from "./journal-reader";
export * from "./server";
