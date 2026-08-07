/**
 * Kawabunga voice-agent — A2 (runVoiceStream behind a LiveKit AgentSession).
 *
 * The LiveKit twin of `services/voice-host`. voice-host is a Fastify SSE server
 * the browser POSTs to; this is a long-running `@livekit/agents` WORKER that
 * registers with LiveKit, is dispatched into a room, and runs the pipeline
 * server-side over a WebRTC track (transport + AEC + barge-in come from the room).
 *
 * SHAPE: LiveKit owns the USER side — mic track → STT (LiveKit Inference model
 * string, billed via LiveKit, no separate key) → silero VAD (auto) → v1-mini
 * end-of-turn detector. At the real end of each user turn (gated by that detector
 * via onUserTurnCompleted — NOT raw STT finals) we call `runVoiceStream` —
 * the SAME generator voice-host uses, the unchanged knowledge-graph brain — and
 * push its audio onto a dedicated published track we own (NOT session.say, which
 * the AgentSession interrupts while finalizing the user turn). No session
 * llm/tts: runVoiceStream does its own retrieve→curate→LLM→TTS.
 *
 * Wire: runVoiceStream yields `{ event: "audio", data: { pcm: base64<Float32>,
 * samples, sampleRate } }`; we convert Float32→Int16 AudioFrames.
 *
 * Run (repo root):  npx tsx --env-file=services/voice-agent/.env services/voice-agent/src/agent.ts dev
 * Requires LIVEKIT_URL / _API_KEY / _API_SECRET + VOICE_AGENT_CHARACTER_ID
 * (which character this worker voices) + the brain's env (DATABASE_URL,
 * CEREBRAS_API_KEY, ELEVENLABS_*, …) — see .env.example.
 *
 * Still A-series: A4 = tune the v1 detector; A5 = browser LiveKit client + token
 * mint; A6 = deploy + A/B. Multi-character/world is Arc 2.
 */
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { getChatProviderForModel, modelMetaFor, warmLocalEmbedder } from "@kawabunga/engine";
import {
  type JobContext,
  WorkerOptions,
  cli,
  defineAgent,
  inference,
  llm,
  voice,
} from "@livekit/agents";
import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
} from "@livekit/rtc-node";
import { BackgroundVoiceCancellation } from "@livekit/noise-cancellation-node";
import {
  type CharacterRecord,
  getCharacterStore,
  getSceneSessionStore,
} from "@kawabunga/db";
import {
  encodePcm16Wav,
  makeAudioStorageKey,
  summarizePcm16,
  writeSessionAudio,
} from "@kawabunga/db/session-audio-storage";
import { resolveLiveSceneAgentName, SESSION_COST_EVENT_TYPE } from "@kawabunga/types";
import {
  buildInfrastructureSessionCostEntry,
  buildStreamingSttOperationId,
  buildSttSessionCostEntry,
  buildTtsSessionCostEntry,
  resolveTtsModelId,
  runVoiceStream,
} from "@kawabunga/voice-pipeline";
import { toAudioFrame } from "./audio-frame";
import {
  buildNarrationTurnRecord,
  resolveNarrationRouting,
  streamNarration,
} from "./narration";
import { SceneDriver } from "./scene-driver";
import { buildIdentity } from "./build-identity";
import { isNarratorAddressed } from "@kawabunga/orchestration";
import { buildProactiveSuppressedJournalEntry } from "@kawabunga/orchestration";
import { createSceneEndPublisher } from "./scene-lifecycle";
import { buildSceneKeyterms, supportsKeyterms } from "./stt-keyterms";
import { narratorKeepsFloor, resolveLiveVoiceMaxTokens } from "./live-turn-policy";
import { WorldAudioChannel } from "./world-audio";

// --- Railway healthcheck: the agents worker doesn't serve HTTP itself, so expose
// a tiny /healthz on its own port. It reports process liveness only: prewarm (and
// thus bge readiness) happens in forked job subprocesses whose module state this
// process can't see, and the model is baked into the image at build time anyway —
// unlike voice-host, whose single process warms bge itself and can report it.
//
// IMPORTANT: @livekit/agents forks job + inference SUBPROCESSES that re-import
// this module (worker.js / job_proc_executor use child_process.fork). A forked
// child has an IPC channel (process.send is defined); the main worker process
// does not. Bind /healthz ONLY in the main process — otherwise the subprocess
// double-binds the port → EADDRINUSE → "process exited before initializing" →
// the dispatched job dies before the session ever starts. ---
const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? process.env.PORT ?? 8080);
if (!process.send) {
  const healthServer = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "voice-agent", ...buildIdentity() }));
      return;
    }
    res.writeHead(404).end();
  });
  // Defensive: a stray bind error must never crash the worker (see above).
  healthServer.on("error", (err) =>
    console.error(`[voice-agent] healthz server error: ${(err as Error).message}`),
  );
  healthServer.listen(HEALTH_PORT, "0.0.0.0", () =>
    console.log(`[voice-agent] healthz on :${HEALTH_PORT}`),
  );
}

// Which character this worker voices, and which LiveKit Inference STT model.
// (Single-character for A2; the world-agent will pick the character per turn.)
const CHARACTER_ID = process.env.VOICE_AGENT_CHARACTER_ID;
const STT_MODEL = process.env.VOICE_AGENT_STT ?? "deepgram/nova-3";
// Brain-model override for every character turn this worker voices — the live
// A/B knob. Rides runVoiceStream's request-level `model` input, so it outranks
// each character's saved brainModel (same precedence as the wavefield UI's
// live picker) without touching L04 config. Resolved once at startup:
// an id the model registry doesn't know is dropped with a warning, because
// runVoiceStream would otherwise 400 EVERY turn of every session.
const BRAIN_MODEL_OVERRIDE = resolveBrainModelOverride(
  process.env.VOICE_AGENT_BRAIN_MODEL,
);
const warnedUnavailableReactionModels = new Set<string>();

function resolveBrainModelOverride(raw: string | undefined): string | null {
  const id = raw?.trim();
  if (!id) return null;
  const meta = modelMetaFor(id);
  if (!meta) {
    console.warn(
      `[voice-agent] VOICE_AGENT_BRAIN_MODEL="${id}" is not in the model registry — override IGNORED (characters keep their saved brainModel)`,
    );
    return null;
  }
  // Experiment knob, so tier mismatches warn rather than block — but say it
  // loudly: a non-voice or slow model here is felt by every user in the room.
  if (!meta.modes.includes("voice")) {
    console.warn(
      `[voice-agent] brain override "${id}" is not tagged for voice mode in the registry — proceeding anyway (experiment at your own latency)`,
    );
  } else if (meta.latencyTier !== "instant" && meta.latencyTier !== "fast") {
    console.warn(
      `[voice-agent] brain override "${id}" has latencyTier="${meta.latencyTier}" — expect slower turns`,
    );
  }
  console.log(
    `[voice-agent] brain override: ${id} (${meta.provider}) for ALL character turns this worker voices`,
  );
  return id;
}
// B4: speculative speaker-selection. Orchestrate off the partial transcript during
// the endpoint hold so the multi-character speaker is usually already chosen when
// the turn completes (hiding the ~0.5s orchestrate gap). Kill-switch: =0.
const SPECULATE_ENABLED = process.env.VOICE_AGENT_SPECULATE !== "0";
// Phase 4: the proactive director loop — ON by default. After the user goes
// quiet for IDLE_MS the director may take a turn (a character re-engages or
// presses), bounded to MAX_PROACTIVE consecutive turns so it never
// monologues; barge-in always wins. The silence brakes are probe-verified
// (hold family, evals/scenes) — the director reliably chooses wait-for-user
// when the last turn already put a question to the user. Kill-switch: =0.
const PROACTIVE_ENABLED = process.env.VOICE_AGENT_PROACTIVE !== "0";
const MAX_PROACTIVE = Number(process.env.VOICE_AGENT_MAX_PROACTIVE ?? 2);
const IDLE_MS = Number(process.env.VOICE_AGENT_IDLE_MS ?? 3500);
// Persist the live SceneState snapshot after each decision (visible/resumable in
// /sessions). Fire-and-forget; default off — most useful for real multi-char scenes.
const PERSIST_SCENE = process.env.VOICE_AGENT_PERSIST_SCENE === "1";
// Phase 2 (scene audio): publish a second "world-audio" track carrying the looping
// ambience bed (SceneState.ambience → sound library asset). Default ON — scenes
// without a default bed stay silent, so the only audible change is authored beds.
// Kill-switch: =0. Gains are dB relative to the ingest-normalized assets.
const WORLD_AUDIO_ENABLED = process.env.VOICE_AGENT_WORLD_AUDIO !== "0";
// Headless E2E feeds synthetic speech directly into LiveKit. Background-voice
// cancellation correctly treats that speaker as non-primary and removes it, so
// tests can disable only this pre-STT filter while production remains default-on.
const NOISE_CANCELLATION_ENABLED =
  process.env.VOICE_AGENT_NOISE_CANCELLATION !== "0";
const LIVE_VOICE_MAX_TOKENS = resolveLiveVoiceMaxTokens();
const WORLD_GAIN_DB = Number(process.env.VOICE_AGENT_WORLD_GAIN_DB ?? -12);
const WORLD_DUCK_DB = Number(process.env.VOICE_AGENT_WORLD_DUCK_DB ?? -12);

/** LEGACY shim: `char-<characterId>-<sessionId>` rooms, minted by pre-unification
 *  token routes. The characterId resolves to the character's SOLO scene via
 *  SceneDriver.fromCharacter — same destination as the `scene-…` rooms the token
 *  route mints today. Keep until no deployed client mints char- rooms; the
 *  sessionId lets the agent persist turns to the SAME session /sessions shows
 *  (so they're gradeable) instead of an orphan it invents. */
function parseCharacterFromRoom(
  roomName: string | undefined,
): { characterId: string; sessionId: string } | null {
  const match = roomName?.match(
    /^char-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(.+)$/i,
  );
  return match ? { characterId: match[1]!, sessionId: match[2]! } : null;
}

/** `scene-<sceneId>-<sessionId>` rooms run the multi-character orchestrator loop.
 *  sceneId may be a slug ("abrahams-tent") or a DB UUID; the trailing session UUID
 *  anchors the split. */
function parseSceneFromRoom(
  roomName: string | undefined,
): { sceneId: string; sessionId: string } | null {
  const match = roomName?.match(
    /^scene-(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  return match ? { sceneId: match[1]!, sessionId: match[2]! } : null;
}

/**
 * Agent that replies via a caller-supplied callback at the REAL end of the user's
 * turn. We override `onUserTurnCompleted` (fired after the v1 turn detector
 * confirms the turn is over) instead of reacting to raw STT finals — Deepgram emits
 * a "final" at every pause, so keying off those made Abraham cut in mid-sentence.
 * Then we throw `StopResponse`: the reply is on our own track, so the session must
 * skip its own (LLM-less) `generateReply`.
 */
class BrainAgent extends voice.Agent {
  readonly #respond: (text: string) => void;

  constructor(respond: (text: string) => void) {
    super({ instructions: "" });
    this.#respond = respond;
  }

  override async onUserTurnCompleted(
    _chatCtx: llm.ChatContext,
    newMessage: llm.ChatMessage,
  ): Promise<void> {
    const text = newMessage.textContent?.trim();
    if (text) this.#respond(text);
    throw new voice.StopResponse();
  }
}

export default defineAgent({
  // prewarm runs once per worker process before any job — warm bge so the first
  // real turn is hot, matching voice-host's warm-bge boot.
  prewarm: async () => {
    await warmLocalEmbedder();
    console.log("[voice-agent] bge warm — embedder ready");
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();

    // The unit of voice is a SCENE. A `scene-<sceneId>-<sessionId>` room runs the
    // multi-character orchestrator loop (SceneDriver picks who speaks each turn); a
    // `char-<characterId>-<sessionId>` room is the degenerate one-character case.
    // VOICE_AGENT_CHARACTER_ID is only a fallback for rooms that encode neither
    // (e.g. the LiveKit Playground / direct tests).
    const sceneRef = parseSceneFromRoom(ctx.room.name);
    const charRef = sceneRef ? null : parseCharacterFromRoom(ctx.room.name);
    // Every room runs through the SAME driver: a `scene-…` room loads a multi-
    // character scene; a `char-…` (single-character) room is a synthesized one-actor
    // scene (the 1-char fastpath). One driving path, so the director cues and the
    // proactive loop apply uniformly.
    let sceneDriver: SceneDriver;
    let character: CharacterRecord | null = null;
    if (sceneRef) {
      const loaded = await SceneDriver.load(sceneRef.sceneId);
      if (!loaded) {
        throw new Error(`scene "${sceneRef.sceneId}" (room "${ctx.room.name}") did not resolve`);
      }
      sceneDriver = loaded;
    } else {
      const characterRef = charRef?.characterId ?? CHARACTER_ID;
      if (!characterRef) {
        throw new Error(
          `no character: room "${ctx.room.name}" didn't encode one and VOICE_AGENT_CHARACTER_ID is unset`,
        );
      }
      character =
        (await getCharacterStore().getById(characterRef)) ??
        (await getCharacterStore().getBySlug(characterRef));
      if (!character) {
        throw new Error(`character "${characterRef}" (from room "${ctx.room.name}") did not resolve`);
      }
      sceneDriver = await SceneDriver.fromCharacter(character);
    }

    // Persist to the sandbox's OWN scene_session — the one in the room name, already
    // created by the browser before connecting. Reusing it means the agent's turns
    // land in the SAME session /sessions shows, so they're gradeable in the Eval tab
    // (instead of an orphan session the agent invents). runVoiceStream needs the row
    // to FK-resolve, which the sandbox guarantees. Only create one when the room
    // carries none or it doesn't resolve (e.g. the LiveKit Playground / direct tests).
    const sessionStore = getSceneSessionStore();
    const roomSessionId = sceneRef?.sessionId ?? charRef?.sessionId ?? null;
    const existingSession = roomSessionId
      ? await sessionStore.getSession(roomSessionId).catch(() => null)
      : null;
    // Solo scenes carry their character on the roster — resolve it so the
    // session row is filterable by BOTH sceneId and characterId in /sessions.
    const soloRosterSlug =
      sceneDriver.scene.characters.length === 1
        ? sceneDriver.scene.characters[0]!.characterSlug
        : null;
    const sessionCharacterId =
      character?.id ??
      (soloRosterSlug
        ? (await getCharacterStore().getBySlug(soloRosterSlug).catch(() => null))?.id ?? null
        : null);
    const createStampedSession = async () => {
      const base = {
        // Keep the room's session id: the browser generated it and uses it for
        // /sessions detail lookups — creating under a fresh id orphans the row.
        id: roomSessionId ?? undefined,
        characterId: sessionCharacterId,
        mode: "voice",
        metadata: { source: sceneRef ? "scene-voice" : "character-voice" },
      };
      try {
        return await sessionStore.createSession({ ...base, sceneId: sceneDriver.scene.id });
      } catch {
        // Registry-only scenes (no scenesTable row) fail the sceneId FK —
        // fall back to an unstamped row rather than losing the session.
        return await sessionStore.createSession({ ...base, sceneId: null });
      }
    };
    const sceneSession = existingSession ?? (await createStampedSession());
    const sessionId = sceneSession.id;
    const ledgerStartedAt = Date.now();
    const agentName = resolveLiveSceneAgentName(process.env.LIVEKIT_AGENT_NAME);
    console.log(
      `[voice-agent] session ${sessionId} (${existingSession ? "reused sandbox session — gradeable" : "created"})`,
    );
    const roster = sceneDriver.scene.characters.length;
    console.log(
      `[voice-agent] connected to room "${ctx.room.name}" — scene=${sceneDriver.scene.id} (${roster} character${roster === 1 ? "" : "s"}) session=${sessionId} stt=${STT_MODEL}`,
    );

    // Phase 2 (scene audio): the world-audio channel executes the SceneDriver's
    // ambience decisions on a second published track. Constructed up front (cheap —
    // nothing is published until the first bed lands); wired below via onState.
    const worldAudio = WORLD_AUDIO_ENABLED
      ? new WorldAudioChannel(ctx.room, { masterGainDb: WORLD_GAIN_DB, duckDb: WORLD_DUCK_DB })
      : null;
    // Per-slug placement facts from the scene's audio roster (Phase 3):
    // the per-scene gain trim authored on the node. Empty for legacy scenes.
    const soundBySlug = new Map(
      (sceneDriver.scene.sounds ?? []).map((s) => [s.slug, s]),
    );
    // Warm the whole roster (beds + one-shots) so cues at runtime are
    // zero-fetch; fall back to just the default bed for legacy scenes.
    if (worldAudio) {
      worldAudio.prefetch(
        sceneDriver.scene.sounds?.map((s) => s.slug) ?? [
          sceneDriver.scene.defaultAmbience,
        ],
      );
    }

    // onState is a single-callback slot on the driver — one subscription fans out to
    // both consumers: the world-audio bed follows SceneState.ambience on every
    // decision, and Phase 5 persistence stays behind its flag.
    sceneDriver.onState((snapshot) => {
      if (worldAudio) {
        const bedSlug = snapshot.sceneState.ambience;
        void worldAudio.setBed(bedSlug, {
          gainDb: bedSlug ? soundBySlug.get(bedSlug)?.gainDb : undefined,
        });
      }
      if (PERSIST_SCENE) {
        void sessionStore
          .updateCurrentScene({ sessionId, currentScene: snapshot })
          .catch(() => undefined);
      }
    });

    // The scene journal — every director decision, chronicler reflection, and
    // timed-event arming lands as a typed scene_session_events row (the
    // session's flight recorder; read by the /sessions workbench). Persisted
    // unconditionally, like turn rows: it IS the session's debugging record —
    // matching the browser orchestrate route, which has always persisted its
    // decision events.
    const pendingJournalWrites = new Set<Promise<void>>();
    const persistJournalEntry = (entry: {
      turnId?: string;
      type: string;
      source: string;
      payload: Record<string, unknown>;
    }) => {
      const write = sessionStore
        .appendEvent({
          sessionId,
          turnId: entry.turnId ?? null,
          type: entry.type,
          source: entry.source,
          payload: entry.payload,
        })
        .catch((err) =>
          console.warn(`[voice-agent] journal append failed: ${(err as Error).message}`),
        );
      pendingJournalWrites.add(write);
      void write.finally(() => pendingJournalWrites.delete(write));
      return write;
    };
    sceneDriver.onJournal((entry) => {
      persistJournalEntry(entry);
    });
    sceneDriver.onCost((entry) => {
      persistJournalEntry({
        type: SESSION_COST_EVENT_TYPE,
        source: "billing",
        payload: entry,
      });
    });
    persistJournalEntry({
      type: "scene.journal.ready",
      source: "orchestration",
      payload: {
        journalVersion: 1,
        agentName,
        sceneId: sceneDriver.scene.id,
      },
    });

    // Phase 3: the director's sfx cues (already roster-validated by
    // resolveSceneDecision). Fired before the speaker's turn — "now" cues
    // precede the voice; "with-speaker" cues park until first audio.
    if (worldAudio) {
      sceneDriver.onSfx((cues) => {
        for (const cue of cues) {
          void worldAudio.playOneShot(cue.id, {
            at: cue.at,
            gainDb: soundBySlug.get(cue.id)?.gainDb,
          });
        }
      });
    }

    // Bias STT toward the roster's proper nouns. Character names carry the
    // routing (by-name addressing, vocative classification, addressee
    // continuity), so a mangled name breaks the scene silently — observed:
    // "Abraham, are you there?" transcribed as "Married, are you there?".
    const keyterms = buildSceneKeyterms(sceneDriver.scene);
    const sttConfig = new inference.STT({
      model: STT_MODEL,
      ...(supportsKeyterms(STT_MODEL) && keyterms.length > 0
        ? { modelOptions: { keyterms } }
        : {}),
    });
    let sttUsageSequence = 0;
    sttConfig.on("metrics_collected", (metrics) => {
      sttUsageSequence += 1;
      persistJournalEntry({
        type: SESSION_COST_EVENT_TYPE,
        source: "billing",
        payload: buildSttSessionCostEntry({
          operationId: buildStreamingSttOperationId({
            requestId: metrics.requestId,
            timestamp: metrics.timestamp,
            sequence: sttUsageSequence,
          }),
          provider: `livekit/${metrics.metadata?.modelProvider || "inference"}`,
          model: metrics.metadata?.modelName || STT_MODEL,
          audioDurationMs: metrics.audioDurationMs,
          inputTokens: metrics.inputTokens,
          outputTokens: metrics.outputTokens,
        }),
      });
    });
    if (supportsKeyterms(STT_MODEL) && keyterms.length > 0) {
      console.log(`[voice-agent] stt keyterms: ${keyterms.join(", ")}`);
    }

    // User side handled by LiveKit: STT (inference model string) + auto silero VAD
    // + the bundled v1-mini end-of-turn detector. No llm/tts — the brain generates.
    const session = new voice.AgentSession({
      stt: sttConfig,
      turnDetection: new inference.TurnDetector({ version: "v1-mini" }),
      // Raise the endpointing floor above the 300ms default so a brief mid-sentence
      // pause (e.g. "…different than [pause] the rest of the days?") doesn't end the
      // turn early when the detector over-eagerly calls it complete. maxDelay
      // (2500ms) for clearly-incomplete turns stays the default.
      turnHandling: { endpointing: { minDelay: 700 } },
    });

    // Own the agent's audio OUTPUT directly: a dedicated published track fed from
    // runVoiceStream. We deliberately do NOT use session.say — the AgentSession
    // interrupts its own speech while finalizing the user turn ("speech
    // interrupted, new user turn detected"), which truncated say()-driven replies
    // to ~12ms. A separate track sidesteps that machinery; barge-in is an explicit
    // audioSource.clearQueue() on the next user turn.
    const OUTPUT_SAMPLE_RATE = 24000; // runVoiceStream/ElevenLabs emit 24 kHz mono
    const audioSource = new AudioSource(OUTPUT_SAMPLE_RATE, 1);
    const outTrack = LocalAudioTrack.createAudioTrack("agent-voice", audioSource);

    let turn: AbortController | null = null;
    // Phase 4 loop state. `turn` is the single shared gate (aborted on barge-in AND on
    // each new turn). These booleans only gate whether we ARM a follow-up — the abort
    // is always the same `turn.abort()`.
    let speaking = false;
    let userIsSpeaking = false;
    let proactiveCount = 0;
    // One budget-spent entry per user turn — the brake is re-checked on every
    // arm, and repeating it would bury the rest of the journal.
    let budgetSpentJournaled = false;
    // NARRATOR PROTECTION. A character is a conversational partner and can be
    // cut off mid-word; the narrator is not, and losing its line loses a beat
    // of the story that nothing replays. Session a726ec1b lost its climax this
    // way — the armed-men narration was cancelled at 158 characters billed and
    // 0ms of audio, and the visitor left 18 seconds later.
    //
    // While the narrator speaks, speech does not abort it. Speech ADDRESSED to
    // the narrator still does (that is the visitor taking the helm, which is
    // the whole point of the narrator channel). Anything else is deferred and
    // replayed the moment narration ends — never dropped, so the visitor is
    // not ignored, merely answered a beat later.
    let narrating = false;
    // The opening narration is a skippable preamble rather than a story beat
    // (see narratorKeepsFloor) — tracked separately so only it yields.
    let narratingOpening = false;
    let deferredUserText: string | null = null;
    /** Narration has ended: release the floor and replay anything the visitor
     *  said under it, as a normal turn. Declared before respond() (a function
     *  declaration, so it hoists past the const). */
    function endNarration(): void {
      narrating = false;
      narratingOpening = false;
      const pending = deferredUserText;
      deferredUserText = null;
      if (!pending || sceneEnded) return;
      console.log(`[voice-agent] replaying deferred turn: ${pending}`);
      respond(pending);
    }
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let sceneEnded = false;

    // Publish turn transcripts over a data channel so the sandbox can render them —
    // the user's FULL turn (grouped, not raw per-pause STT segments) and the
    // character's streaming reply text. Topic-scoped; the client filters by it.
    const transcriptEncoder = new TextEncoder();
    const publishTurn = (msg: {
      role: "user" | "agent";
      id: string;
      text: string;
      final: boolean;
      // Multi-character scenes: which character voiced this agent turn so the
      // client can label it (single-character rooms omit it — the UI knows who).
      speaker?: { slug: string; name: string };
    }): void => {
      void ctx.room.localParticipant?.publishData(
        transcriptEncoder.encode(JSON.stringify(msg)),
        { reliable: true, topic: "odyssey.transcript" },
      );
    };
    const publishSceneEnded = createSceneEndPublisher({
      sessionId,
      publish: (payload, options) =>
        ctx.room.localParticipant?.publishData(payload, options),
    });

    // Voice one character's turn: run the brain for input.characterId, push its audio
    // onto our output track, stream its text as a transcript, and resolve to the full
    // reply (fed back into the scene's running transcript). captureFrame paces to
    // real-time, so the loop naturally tracks playback.
    const speak = async (
      input: {
        characterId: string;
        message: string;
        history?: Array<{ role: "user" | "assistant"; content: string }>;
        promptChunk?: string;
        speaker?: { slug: string; name: string };
        // Speaker's scene knowledge horizon — rides the spread into
        // runVoiceStream, which filters later-timeIndexed pages.
        currentMoment?: { era: string; index: number };
        // Director-side feature statuses (arc, speaker selection) — ride the
        // spread into runVoiceStream's `sceneFeatures` observability block.
        sceneFeatures?: Record<string, string>;
        // Rides the spread into runVoiceStream, which turns it into a TTS
        // speed for providers that support one.
        delivery?: "brief" | "natural" | "expansive" | null;
        model?: string;
        audioGate?: {
          waitUntilOpen: Promise<void>;
          onReady: () => void;
          onAudioStart: () => void;
        };
      },
      signal: AbortSignal,
      replyId: string,
    ): Promise<string> => {
      const { speaker, audioGate, model: reactionModel, ...streamInput } = input;
      let modelOverride = reactionModel ?? BRAIN_MODEL_OVERRIDE;
      if (reactionModel) {
        try {
          getChatProviderForModel(reactionModel);
        } catch (err) {
          if (!warnedUnavailableReactionModels.has(reactionModel)) {
            warnedUnavailableReactionModels.add(reactionModel);
            console.warn(
              `[voice-agent] reaction model "${reactionModel}" unavailable (${(err as Error).message}) — using the default brain model`,
            );
          }
          modelOverride = BRAIN_MODEL_OVERRIDE;
          streamInput.sceneFeatures = {
            ...streamInput.sceneFeatures,
            reactionModel: `unavailable — ${reactionModel}; using default brain model`,
          };
        }
      }
      // runVoiceStream only persists the turn (context build + record the workbench
      // renders) when given BOTH sessionId AND turnId — pass one per turn so live
      // voice turns are debuggable in /sessions, not just the SSE sandbox.
      const turnId = crypto.randomUUID();
      let replyText = "";
      const capturedAudio: Int16Array[] = [];
      const bufferedFrames: AudioFrame[] = [];
      let capturedSampleRate = 0;
      let capturedSamples = 0;
      try {
        for await (const ev of runVoiceStream(
          {
            ...streamInput,
            promptChunk: streamInput.promptChunk,
            maxTokens: LIVE_VOICE_MAX_TOKENS,
            sessionId,
            turnId,
            ...(narrationRouting ? { narrationTts: narrationRouting } : {}),
            // Worker-level experiment override (VOICE_AGENT_BRAIN_MODEL) —
            // request-level `model` outranks the character's saved brainModel.
            ...(modelOverride ? { model: modelOverride } : {}),
          },
          { signal },
        )) {
          if (signal.aborted) break;
          if (ev.event === "audio") {
            const d = ev.data as { pcm: string; sampleRate: number };
            const frame = toAudioFrame(d.pcm, d.sampleRate);
            capturedSampleRate ||= frame.sampleRate;
            capturedSamples += frame.samplesPerChannel;
            capturedAudio.push(frame.data.slice());
            if (audioGate) bufferedFrames.push(frame);
            else await audioSource.captureFrame(frame);
          } else if (ev.event === "token") {
            const delta = (ev.data as { delta: string }).delta;
            if (delta) {
              replyText += delta;
              publishTurn({ role: "agent", id: replyId, text: replyText, final: false, speaker });
            }
          } else if (ev.event === "first-audio") {
            console.log(`[voice-agent] first audio ${(ev.data as { latencyMs: number }).latencyMs}ms`);
            // The speaker just became audible — release any with-speaker sfx.
            if (!audioGate) worldAudio?.flushSpeakerCues();
          } else if (ev.event === "error") {
            console.error("[voice-agent] pipeline error", ev.data);
          }
        }
        if (replyText && !signal.aborted) {
          publishTurn({ role: "agent", id: replyId, text: replyText, final: true, speaker });
        }
      } catch (err) {
        if (!signal.aborted) console.error("[voice-agent] turn failed", err);
      }
      if (audioGate) {
        audioGate.onReady();
        await audioGate.waitUntilOpen;
        if (!signal.aborted && bufferedFrames.length > 0) {
          audioGate.onAudioStart();
          worldAudio?.flushSpeakerCues();
          for (const frame of bufferedFrames) {
            if (signal.aborted) break;
            await audioSource.captureFrame(frame);
          }
        }
        // The pipeline persists completion when synthesis finishes, before
        // this host-level gate opens. Rejected hidden work is rewritten using
        // the established aborted terminal status.
        if (signal.aborted) {
          try {
            await sessionStore.upsertTurn({
              id: turnId,
              sessionId,
              inputMode: "voice",
              speakerSlug: speaker?.slug ?? null,
              userText: streamInput.message,
              ...(replyText ? { assistantText: replyText } : {}),
              status: "aborted",
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              metadata: {
                source: "voice-agent",
                terminalReason: "superseded before deferred audio commit",
              },
            });
          } catch (err) {
            console.warn(
              `[voice-agent] deferred turn abort persist failed: ${(err as Error).message}`,
            );
          }
        }
      }
      if (capturedAudio.length > 0 && capturedSampleRate > 0) {
        const artifactId = crypto.randomUUID();
        const mimeType = "audio/wav";
        const storageKey = makeAudioStorageKey({
          sessionId,
          artifactId,
          direction: "output",
          mimeType,
        });
        try {
          const bytes = encodePcm16Wav(capturedAudio, capturedSampleRate);
          await writeSessionAudio(storageKey, bytes);
          const artifact = await sessionStore.addAudioArtifact({
            id: artifactId,
            sessionId,
            turnId,
            direction: "output",
            mimeType,
            durationMs: Math.round((capturedSamples / capturedSampleRate) * 1_000),
            sampleRate: capturedSampleRate,
            byteSize: bytes.byteLength,
            storageKey,
            waveformSummary: summarizePcm16(capturedAudio),
            metadata: {
              source: "voice-agent",
              speakerSlug: speaker?.slug ?? null,
              speakerName: speaker?.name ?? null,
              status: signal.aborted ? "aborted" : "completed",
            },
          });
          await sessionStore.appendEvent({
            sessionId,
            turnId,
            type: "audio.artifact",
            source: "assistant",
            payload: {
              artifactId: artifact.id,
              direction: artifact.direction,
              mimeType: artifact.mimeType,
              byteSize: artifact.byteSize,
              durationMs: artifact.durationMs,
              sampleRate: artifact.sampleRate,
            },
          });
        } catch (error) {
          console.warn(
            `[voice-agent] output audio persist failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return replyText;
    };

    // Narration sink: voice `narrate` decisions on the same output track the
    // characters use. Routing resolves once (library voice by id/slug, else the
    // first roster character's voice); a null routing leaves narration recorded
    // in the driver's transcript but unvoiced (the driver logs that once).
    const narrationRouting = await resolveNarrationRouting({
      narratorVoice: sceneDriver.scene.narratorVoice,
      fallbackVoiceSlug: sceneDriver.scene.characters[0]!.voice,
    });
    // PREWARM the opening. A generated opening costs a model call, and it
    // used to be requested only after the room was live — so the user
    // arrived to silence, said "Hello?" into the gap, and that first
    // utterance aborted the opening before it ever played (observed across
    // seven sessions: never once heard). Start it NOW and let it resolve
    // while the LiveKit session starts and the track publishes; by the time
    // there is anywhere to play it, it is usually already in hand.
    const openingPromise: Promise<string | null> = narrationRouting
      ? sceneDriver.resolveOpening().catch((err) => {
          console.warn(`[voice-agent] opening resolve failed: ${(err as Error).message}`);
          return null;
        })
      : Promise.resolve(null);
    if (narrationRouting) {
      sceneDriver.onNarrate(async (text, meta) => {
        const signal = turn?.signal;
        if (signal?.aborted) return;
        speaking = true;
        narrating = true;
        worldAudio?.setDucked(true);
        const turnId = crypto.randomUUID();
        const startedAt = new Date();
        let voiced = false;
        let narrationStatus: "succeeded" | "failed" | "cancelled" = "succeeded";
        publishTurn({
          role: "agent",
          id: turnId,
          text,
          final: true,
          speaker: { slug: "narrator", name: "Narrator" },
        });
        try {
          await streamNarration({
            routing: narrationRouting,
            text,
            audioSource,
            signal,
            onFirstAudio: () => {
              voiced = true;
              worldAudio?.flushSpeakerCues();
            },
          });
        } catch (error) {
          narrationStatus = signal?.aborted ? "cancelled" : "failed";
          throw error;
        } finally {
          speaking = false;
          endNarration();
          worldAudio?.setDucked(false);
          // Narration bypasses runVoiceStream (TTS only), so record the turn
          // here — otherwise the narrator never appears in /sessions and its
          // lines can't be graded. Best-effort: never disrupt the scene.
          void sessionStore
            .upsertTurn(
              buildNarrationTurnRecord({
                turnId,
                sessionId,
                text,
                provider: narrationRouting.provider,
                voiceSlug: narrationRouting.voiceContext.slug,
                startedAt,
                completedAt: new Date(),
                voiced,
                aborted: signal?.aborted === true,
                ...(meta.userText ? { userText: meta.userText } : {}),
              }),
            )
            .catch((err) =>
              console.warn(`[voice-agent] narration turn persist failed: ${(err as Error).message}`),
            );
          persistJournalEntry({
            turnId,
            type: SESSION_COST_EVENT_TYPE,
            source: "billing",
            payload: buildTtsSessionCostEntry({
              operationId: `narration:${turnId}:tts`,
              provider: narrationRouting.provider,
              model: resolveTtsModelId(narrationRouting.provider),
              characters: text.length,
              status: signal?.aborted ? "cancelled" : narrationStatus,
              note: "Narrator speech synthesis.",
            }),
          });
        }
      }, { realtimePlayback: true });
    }

    // B4: accumulate the user's finalized STT segments so we can orchestrate off the
    // running transcript while the turn is still being held open. Reset each turn.
    let userSegments: string[] = [];

    // Conversation history lives in the SceneDriver (`#recentTurns`): it pushes both
    // the user turn and each reply, and threads role-tagged history into every turn —
    // so single- and multi-character rooms share one store (no agent-side history).

    // Phase 4: proactive loop helpers. `armIdle` schedules a director follow-up after a
    // turn finishes speaking; the director's own `wait-for-user` (or MAX_PROACTIVE)
    // decides when to stop. (Mutually recursive with proactiveTick — fine, both are
    // only called at session runtime, after all consts are initialized.)
    const clearIdle = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };
    // The scene's FIRST MOVE: prompt the director shortly after the opening
    // (or immediately-ish in silent-open scenes) so a host character can
    // receive the visitor. Faster than the idle cadence — a greeting 3.5s
    // after the narration reads as a frozen stage. Same guards as armIdle;
    // proactiveTick itself re-checks who holds the floor.
    const FIRST_MOVE_MS = Number(process.env.VOICE_AGENT_FIRST_MOVE_MS ?? 1500);
    const sceneIdleMs =
      process.env.VOICE_AGENT_IDLE_MS !== undefined
        ? IDLE_MS
        : sceneDriver.pacing().idleMs;
    const armFirstMove = () => {
      clearIdle();
      if (!PROACTIVE_ENABLED || sceneEnded) return;
      if (userIsSpeaking || speaking) return;
      idleTimer = setTimeout(proactiveTick, FIRST_MOVE_MS);
    };
    const armIdle = () => {
      clearIdle();
      if (!PROACTIVE_ENABLED || sceneEnded) return;
      if (userIsSpeaking || speaking) return;
      armWorldEvent();
      if (proactiveCount >= MAX_PROACTIVE) {
        // Bounded → wait for the user. Journaled so "the narrator went quiet"
        // is legible as a budget decision rather than a failure.
        if (!budgetSpentJournaled) {
          budgetSpentJournaled = true;
          persistJournalEntry(
            buildProactiveSuppressedJournalEntry({
              sceneId: sceneDriver.scene.id,
              reason: "budget-spent",
              decisionSpent: false,
              beatsUsed: proactiveCount,
            }),
          );
        }
        return;
      }
      idleTimer = setTimeout(proactiveTick, sceneIdleMs);
    };
    // TIMED world events outlive the MAX_PROACTIVE brake: that brake stops
    // characters monologuing at the user, but a chronicler-scheduled event is
    // the WORLD acting once at its appointed time — it gets its own timer for
    // the due moment (re-armed whenever a reflection schedules new events).
    let worldEventTimer: ReturnType<typeof setTimeout> | null = null;
    const armWorldEvent = () => {
      if (worldEventTimer) {
        clearTimeout(worldEventTimer);
        worldEventTimer = null;
      }
      if (!PROACTIVE_ENABLED || sceneEnded) return;
      const dueIn = sceneDriver.nextWorldEventDueInMs();
      if (dueIn === null) return;
      worldEventTimer = setTimeout(() => {
        worldEventTimer = null;
        proactiveTick();
      }, Math.max(dueIn, 1000));
    };
    sceneDriver.onWorldEvents(() => armWorldEvent());
    const proactiveTick = () => {
      idleTimer = null;
      if (userIsSpeaking || speaking || sceneEnded) {
        // The timer elapsed and we still yielded. Journaled (unlike armIdle's
        // cheap pre-checks) because a tick that fired and stood down is the
        // signal that distinguishes "kept giving the user the floor" from
        // "never woke up at all".
        if (!sceneEnded) {
          persistJournalEntry(
            buildProactiveSuppressedJournalEntry({
              sceneId: sceneDriver.scene.id,
              reason: "floor-held",
              decisionSpent: false,
            }),
          );
        }
        return;
      }
      turn?.abort(); // supersede any straggler (defensive — barge-in already aborts)
      audioSource.clearQueue();
      turn = new AbortController();
      const signal = turn.signal;
      proactiveCount += 1;
      console.log(`[voice-agent] proactive tick #${proactiveCount}`);
      void sceneDriver
        .driveProactive(
          (input, replyId) => {
            if (signal.aborted) return Promise.resolve("");
            speaking = true;
            worldAudio?.setDucked(true);
            return speak(input, signal, replyId).finally(() => {
              speaking = false;
              worldAudio?.setDucked(false);
            });
          },
          { signal },
        )
        .then((spoke) => {
          if (spoke) armIdle(); // chain another bounded follow-up
          else armWorldEvent(); // a hold must not orphan a pending world event
        });
    };

    // The director may end the scene; we just stop driving (go quiet). Room teardown
    // is left to the client.
    const stopSceneWork = (): boolean => {
      if (sceneEnded) return false;
      sceneEnded = true;
      clearIdle();
      if (worldEventTimer) {
        clearTimeout(worldEventTimer);
        worldEventTimer = null;
      }
      turn?.abort();
      audioSource.clearQueue();
      worldAudio?.setDucked(false);
      speaking = false;
      sceneDriver.cancelActiveWork();
      return true;
    };
    const endScene = () => {
      if (!stopSceneWork()) return;
      void publishSceneEnded("director").catch((error) =>
        console.error(`[voice-agent] scene-ended publish failed: ${(error as Error).message}`),
      );
      console.log("[voice-agent] scene ended by director — going quiet");
    };

    // The browser disconnects from LiveKit before marking the session ended in
    // the HTTP store. Treat that transport event as the authoritative stop
    // signal: abort the active voice request and invalidate any momentum chain
    // before another director/model/TTS operation can begin.
    ctx.room.on(RoomEvent.ParticipantDisconnected, () => {
      const newlyStopped = stopSceneWork();
      session.shutdown({ drain: false });
      if (newlyStopped) {
        console.log("[voice-agent] visitor left — active turn and scene cascade cancelled");
      }
    });

    // Reply at the REAL end of the user's turn (gated by the v1 detector), superseding
    // whatever's in flight. Every room routes through the driver (who speaks + the
    // director cue); a single-character room is just the 1-char fastpath. A real user
    // turn resets the proactive budget; after the character speaks, we arm a follow-up.
    const respond = (rawText: string) => {
      if (sceneEnded) return;
      // Mid-narration: only the narrator can be interrupted, and only by being
      // addressed. Everything else waits for the line to land — kept, not
      // discarded, and replayed by endNarration().
      if (
        narratorKeepsFloor({
          narrating,
          opening: narratingOpening,
          addressesNarrator: isNarratorAddressed(rawText),
        })
      ) {
        deferredUserText = deferredUserText ? `${deferredUserText} ${rawText}` : rawText;
        console.log(`[voice-agent] deferred under narration: ${rawText}`);
        return;
      }
      // Absorb anything already deferred, in the order it was said. Addressing
      // the narrator aborts its line, which fires endNarration() — and that
      // would otherwise replay the deferred text straight over the turn we are
      // starting here, killing the very command that interrupted.
      const text = deferredUserText ? `${deferredUserText} ${rawText}` : rawText;
      deferredUserText = null;
      turn?.abort();
      audioSource.clearQueue();
      clearIdle();
      proactiveCount = 0;
      budgetSpentJournaled = false;
      turn = new AbortController();
      const signal = turn.signal;
      console.log(`[voice-agent] user: ${text}`);
      publishTurn({ role: "user", id: `u${Date.now()}`, text, final: true });
      void sceneDriver
        .drive(
          text,
          (input, replyId) => {
            speaking = true;
            worldAudio?.setDucked(true);
            return speak(input, signal, replyId).finally(() => {
              speaking = false;
              worldAudio?.setDucked(false);
              armIdle();
            });
          },
          { signal },
        )
        .then((outcome) => {
          if (outcome.action === "end-scene" && !outcome.superseded) endScene();
          // A narrated bridge hands the floor back — arm a bounded follow-up so
          // the director can continue (speak turns arm via speak's finally).
          if (outcome.action === "narrate" && outcome.spoke && !outcome.superseded) armIdle();
        });
      userSegments = []; // next turn starts a fresh speculation accumulation
    };
    const agent = new BrainAgent(respond);

    // B4: speculative speaker-selection. Each finalized STT segment (Deepgram emits
    // one per pause) extends the running transcript; orchestrate off it NOW so the
    // speaker is usually decided before the turn formally completes. Read-only — we
    // never SPEAK here (that's onUserTurnCompleted), so there's no mid-sentence cut-in.
    if (SPECULATE_ENABLED) {
      session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
        if (!ev.isFinal) return;
        const seg = ev.transcript.trim();
        if (!seg) return;
        userSegments.push(seg);
        sceneDriver.speculate(userSegments.join(" "));
      });
    }

    // Responsive barge-in: the instant the user starts speaking, cancel the
    // in-flight brain turn and drop buffered audio so Abraham stops mid-word
    // (don't wait for the transcript to finalize). The mic track is AEC'd by the
    // browser, so this fires on real user speech — not Abraham's own audio echoing
    // back — and the session suppresses it during AEC warmup.
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      userIsSpeaking = ev.newState === "speaking";
      if (ev.newState === "speaking") {
        clearIdle(); // the user has the floor — cancel any pending proactive tick
        // The narrator holds its line. We cannot know yet whether this is a
        // cough or "narrator, do X" — VAD fires on sound, the words arrive
        // ~700ms later at the endpoint — so the decision waits for the
        // transcript in respond(). Cutting here would be deciding without it.
        if (narrating) return;
        turn?.abort();
        audioSource.clearQueue();
        // Agent is now instantly silent — bring the bed back without waiting
        // for the aborted speak()'s finally to land.
        worldAudio?.setDucked(false);
      }
    });

    await session.start({
      agent,
      room: ctx.room,
      // Krisp background-voice + noise cancellation on the USER's audio, applied
      // before STT / VAD / turn-detection — so room noise and other voices don't
      // trigger turns or interrupt the agent.
      inputOptions: NOISE_CANCELLATION_ENABLED
        ? { noiseCancellation: BackgroundVoiceCancellation() }
        : {},
    });
    // Publish our output track now that the room is connected.
    await ctx.room.localParticipant!.publishTrack(
      outTrack,
      new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
    );
    console.log("[voice-agent] session started — listening (own output track)");

    // Start the scene's opening bed (SceneState.ambience initializes to the scene's
    // defaultAmbience; later decisions flow through onState). Lazy — publishes the
    // world-audio track only when a bed actually exists.
    if (worldAudio) {
      const openingBed = sceneDriver.scene.defaultAmbience;
      void worldAudio.setBed(openingBed, {
        gainDb: openingBed ? soundBySlug.get(openingBed)?.gainDb : undefined,
      });
      ctx.addShutdownCallback(() => worldAudio.close());
    }
    ctx.addShutdownCallback(async () => {
      // A participant can leave while the off-path chronicler is still
      // finishing. Let it land, then drain its journal write before the job
      // process exits so the post-session Chronicle never loses the tail.
      await sceneDriver.settleReflection();
      await persistJournalEntry({
        type: SESSION_COST_EVENT_TYPE,
        source: "billing",
        payload: buildInfrastructureSessionCostEntry({
          operationId: `session:${sessionId}:livekit`,
          provider: "livekit",
          sessionDurationMs: Date.now() - ledgerStartedAt,
          note: "LiveKit room/media allocation for this session.",
        }),
      });
      await Promise.allSettled([...pendingJournalWrites]);
      await publishSceneEnded("host").catch((error) =>
        console.error(`[voice-agent] scene-ended publish failed: ${(error as Error).message}`),
      );
    });

    // The authored OPENING NARRATION — the unseen narrator sets the scene the
    // moment the user arrives, before any character speaks. Recorded into the
    // driver's transcript so the director and the characters know it was said.
    // Barge-in wins: the user speaking aborts it like any turn.
    // authored → the authored line (one of its variants); generated → the
    // narrator writes it from the premise, falling back to authored on any
    // failure; off → silence. Resolved once, at session open.
    const openingNarration = await openingPromise;
    if (openingNarration && narrationRouting) {
      turn = new AbortController();
      const openingSignal = turn.signal;
      const openingTurnId = crypto.randomUUID();
      let openingStatus: "succeeded" | "failed" | "cancelled" = "succeeded";
      speaking = true;
      narrating = true;
      narratingOpening = true;
      worldAudio?.setDucked(true);
      publishTurn({
        role: "agent",
        id: openingTurnId,
        text: openingNarration,
        final: true,
        speaker: { slug: "narrator", name: "Narrator" },
      });
      sceneDriver.recordNarration(openingNarration);
      const openingStartedAt = Date.now();
      let openingVoiced = false;
      const openingPlaybackDone = streamNarration({
        routing: narrationRouting,
        text: openingNarration,
        audioSource,
        signal: openingSignal,
        onFirstAudio: () => {
          openingVoiced = true;
          worldAudio?.flushSpeakerCues();
        },
      })
        .catch((err) => {
          openingStatus = openingSignal.aborted ? "cancelled" : "failed";
          if (!openingSignal.aborted) {
            console.warn(`[voice-agent] opening narration failed: ${(err as Error).message}`);
          }
        })
        .then(() => ({ voiced: openingVoiced, endedAt: Date.now() }))
        .finally(() => {
          // The opening is the single most abandoned moment we have — it can
          // take 30s+ to arrive, so a visitor speaking into the wait must not
          // be what silences it. Release the floor once it has played.
          endNarration();
          persistJournalEntry({
            turnId: openingTurnId,
            type: SESSION_COST_EVENT_TYPE,
            source: "billing",
            payload: buildTtsSessionCostEntry({
              operationId: `narration:${openingTurnId}:tts`,
              provider: narrationRouting.provider,
              model: resolveTtsModelId(narrationRouting.provider),
              characters: openingNarration.length,
              status: openingSignal.aborted ? "cancelled" : openingStatus,
              note: "Opening narration speech synthesis.",
            }),
          });
        });
      // Start the scene-open director + brain immediately. Character PCM is
      // buffered by speak() and released only after openingPlaybackDone.
      if (PROACTIVE_ENABLED && !sceneEnded) {
        proactiveCount += 1;
        console.log(`[voice-agent] opening proactive tick #${proactiveCount}`);
        void sceneDriver
          .driveProactive(
            (input, replyId) => speak(input, openingSignal, replyId),
            {
              signal: openingSignal,
              openingPlayback: { startedAt: openingStartedAt, done: openingPlaybackDone },
            },
          )
          .then((spoke) => {
            if (spoke) armIdle();
            else armWorldEvent();
          })
          .finally(() => {
            speaking = false;
            worldAudio?.setDucked(false);
          });
      } else {
        void openingPlaybackDone.finally(() => {
          speaking = false;
          worldAudio?.setDucked(false);
        });
      }
    } else {
      // No opening narration (openingMode off / no routing): the scene still
      // owes the visitor a first move — a character noticing the arrival.
      armFirstMove();
    }

    // DIAGNOSTIC (gated): on join, drive ONE turn from a canned user message so the
    // smoke client can verify the loop WITHOUT STT — a scene room exercises the full
    // orchestrate→speaker→brain path; a single-character room just runs the brain.
    // Set VOICE_AGENT_GREET=1.
    if (process.env.VOICE_AGENT_GREET === "1") {
      turn = new AbortController();
      const greetSignal = turn.signal;
      if (sceneRef) {
        console.log("[voice-agent] greet-test: driving one scene turn on join");
        void sceneDriver.drive("Hello? Who's here?", (input, replyId) =>
          speak(input, greetSignal, replyId),
        );
      } else {
        // Single-character opening line: voice the greet directly and seed only the
        // reply into the driver's transcript — the meta-instruction is NOT recorded as
        // a user turn (matching the pre-unification single-char greet).
        console.log("[voice-agent] greet-test: opening line on join");
        void speak(
          { characterId: character!.id, message: "Greet me warmly in one short sentence." },
          greetSignal,
          `greet${Date.now()}`,
        ).then((reply) => sceneDriver.recordOpening(reply));
      }
    }
  },
});

cli.runApp(new WorkerOptions({
  agent: fileURLToPath(import.meta.url),
  agentName: resolveLiveSceneAgentName(process.env.LIVEKIT_AGENT_NAME),
}));
