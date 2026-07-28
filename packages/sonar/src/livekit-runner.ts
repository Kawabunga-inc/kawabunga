/**
 * Sonar LiveKit runner — voice-to-voice over the REAL production transport.
 *
 * The HTTP runner (runner.ts) measures the SSE stack; this one joins a
 * LiveKit room as a real participant, publishes the suite's spoken-audio
 * fixtures on a mic track, and lets the deployed voice-agent worker do
 * everything it does in production: LiveKit Inference STT, the v1-mini
 * end-of-turn detector, SceneDriver orchestration, and audio on the
 * agent's published track. Nothing is stubbed — the numbers are what a
 * user's client would feel.
 *
 * Timing model (all relative to user speech end, stamped after
 * `waitForPlayout()` drains the mic queue, so skew ≤ the source buffer):
 *   - `lk.endpoint`     → the agent publishes the user's final transcript
 *                         (STT + turn-detector commit)
 *   - `lk.first-text`   → first agent transcript delta (LLM first token proxy)
 *   - `voice-to-voice`  → first AUDIBLE frame on the agent's track (RMS gate)
 *
 * Requires: LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET, and a
 * voice-agent worker registered against the same LiveKit project (local
 * `npm run dev -w @kawabunga/voice-agent` or the deployed worker). Rooms are
 * named `scene-<sceneId>-<uuid>` (roster suites) or `char-<characterId>-<uuid>`.
 */

import { AccessToken } from "livekit-server-sdk";
import {
  AudioFrame,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
  type RemoteTrack,
} from "@livekit/rtc-node";
import { loadRecording, resolveUtteranceSamples } from "./audio/synth";
import { SONAR_VERSION } from "./version";
import { aggregate, sloAttainmentPct } from "./stats";
import {
  DEFAULT_V2V_SLO_MS,
  SONAR_SPANS,
  type SonarAggregate,
  type SonarGitInfo,
  type SonarRunRecord,
  type SonarSpanName,
  type SonarSuite,
  type SonarTurnRecord,
} from "./types";

const SAMPLE_RATE = 24_000; // fixtures are 24kHz mono Float32 (AUDIO_RT_SAMPLE_RATE)
const FRAME_SAMPLES = 240; // 10ms frames
/** Mic source buffer — kept small so speech-end timestamps stay honest. */
const SOURCE_QUEUE_MS = 100;
/** Int16 RMS above this counts as audible agent speech (~1.2% full scale —
 *  above codec noise, far below any TTS voice). */
const AUDIBLE_RMS = 400;
/** The turn is over when the agent's transcript is final AND its track has
 *  been quiet this long. */
const QUIET_TAIL_MS = 600;
const PHASE_TIMEOUT_MS = 30_000;

export type RunLiveKitSuiteOptions = {
  suite: SonarSuite;
  repoRoot: string;
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
  /** Required when the suite has no sceneId — `char-` rooms encode the UUID. */
  characterId?: string;
  sessions?: number;
  label?: string;
  runGroupId?: string | null;
  sloMs?: number;
  git?: SonarGitInfo | null;
  log?: (line: string) => void;
};

type TranscriptMsg = {
  role: "user" | "agent";
  id: string;
  text: string;
  final: boolean;
  speaker?: { slug: string; name: string };
};

/** Per-turn observation state, filled by room event handlers. */
type TurnWatch = {
  speechEndPerf: number;
  userFinalPerf: number | null;
  userTranscript: string;
  firstAgentTextPerf: number | null;
  agentFinalPerf: number | null;
  agentText: string;
  speakerSlug: string | null;
  firstAudiblePerf: number | null;
  lastAudiblePerf: number | null;
};

export async function runLiveKitSuite(opts: RunLiveKitSuiteOptions): Promise<SonarRunRecord> {
  const { suite } = opts;
  const log = opts.log ?? (() => {});
  const sessions = opts.sessions ?? suite.sessions;
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();

  if (suite.sttOnly) throw new Error("STT-only suites have no LiveKit form — use the HTTP runner");
  if (!suite.sceneId && !opts.characterId) {
    throw new Error("suite has no sceneId — pass characterId so a char-<uuid> room can be minted");
  }

  log(
    `sonar v${SONAR_VERSION} · suite=${suite.name}@${suite.version} · transport=LIVEKIT · ` +
      (suite.sceneId ? `scene=${suite.sceneId}` : `character=${opts.characterId}`) +
      ` · ${sessions} session(s) × ${suite.turns.length} turn(s)`,
  );

  // Fixtures up front (same synthesis/caching as the HTTP runner).
  log("preparing spoken-input fixtures…");
  const fixtures: Array<{ samples: Float32Array; synthesized: boolean; displayText: string }> = [];
  for (let i = 0; i < suite.turns.length; i += 1) {
    const turn = suite.turns[i];
    if (typeof turn === "object" && "recording" in turn) {
      fixtures.push({
        samples: loadRecording(opts.repoRoot, turn.recording),
        synthesized: false,
        displayText: turn.script ?? turn.recording,
      });
    } else {
      const parts = typeof turn === "string" ? [turn] : turn.parts;
      const gapMs = typeof turn === "string" ? 0 : (turn.gapMs ?? 1000);
      const { samples, synthesized } = await resolveUtteranceSamples({
        repoRoot: opts.repoRoot,
        suite: suite.name,
        turnIndex: i,
        parts,
        gapMs,
        opts: { voice: suite.userVoice },
        log,
      });
      fixtures.push({ samples, synthesized, displayText: parts.join(" … ") });
    }
  }

  const turns: SonarTurnRecord[] = [];

  for (let sessionIndex = 0; sessionIndex < sessions; sessionIndex++) {
    const sessionUuid = crypto.randomUUID();
    const roomName = suite.sceneId
      ? `scene-${suite.sceneId}-${sessionUuid}`
      : `char-${opts.characterId}-${sessionUuid}`;
    log(`session ${sessionIndex + 1}/${sessions} · room=${roomName}`);

    const token = await new AccessToken(opts.apiKey, opts.apiSecret, {
      identity: `sonar-${sessionUuid.slice(0, 8)}`,
      ttl: "15m",
    });
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });

    const room = new Room();
    let watch: TurnWatch | null = null;
    const audioReaders: Array<Promise<void>> = [];

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== TrackKind.KIND_AUDIO) return;
      // Read the agent's audio; every frame updates the live turn's
      // audibility marks. (The agent publishes voice + world-audio tracks —
      // the ambience bed sits ~-12dB and narration/speech spikes above the
      // RMS gate, so the gate keys on speech.)
      const stream = new AudioStream(track);
      audioReaders.push(
        (async () => {
          for await (const frame of stream) {
            const now = performance.now();
            const data = frame.data;
            let sumSq = 0;
            for (let i = 0; i < data.length; i += 1) sumSq += data[i]! * data[i]!;
            const rms = Math.sqrt(sumSq / Math.max(1, data.length));
            if (rms >= AUDIBLE_RMS && watch && now > watch.speechEndPerf) {
              if (watch.firstAudiblePerf === null) watch.firstAudiblePerf = now;
              watch.lastAudiblePerf = now;
            }
          }
        })().catch(() => undefined),
      );
    });

    const decoder = new TextDecoder();
    room.on(RoomEvent.DataReceived, (payload: Uint8Array, _participant, _kind, topic?: string) => {
      if (topic !== "odyssey.transcript" || !watch) return;
      let msg: TranscriptMsg;
      try {
        msg = JSON.parse(decoder.decode(payload)) as TranscriptMsg;
      } catch {
        return;
      }
      const now = performance.now();
      if (msg.role === "user" && msg.final) {
        if (watch.userFinalPerf === null) watch.userFinalPerf = now;
        watch.userTranscript = msg.text;
      } else if (msg.role === "agent") {
        if (watch.firstAgentTextPerf === null && msg.text) watch.firstAgentTextPerf = now;
        watch.agentText = msg.text;
        watch.speakerSlug = msg.speaker?.slug ?? watch.speakerSlug;
        if (msg.final) watch.agentFinalPerf = now;
      }
    });

    await room.connect(opts.livekitUrl, await token.toJwt(), { autoSubscribe: true, dynacast: false });

    // Publish the "mic" and start a continuous silence pump immediately —
    // the agent's VAD/turn detector expects a live stream, not bursts.
    const source = new AudioSource(SAMPLE_RATE, 1, SOURCE_QUEUE_MS);
    const micTrack = LocalAudioTrack.createAudioTrack("sonar-mic", source);
    await room.localParticipant!.publishTrack(
      micTrack,
      new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
    );

    // Mutable refs (not bare lets): TS control-flow analysis runs through
    // IIFEs and would otherwise pin these to their initial values.
    const pumpState: {
      pumping: boolean;
      utterance: { samples: Float32Array; done: () => void } | null;
    } = { pumping: true, utterance: null };
    const silence = new Int16Array(FRAME_SAMPLES);
    const pump = (async () => {
      let offset = 0;
      while (pumpState.pumping) {
        const active = pumpState.utterance;
        if (active) {
          const chunk = active.samples.subarray(offset, offset + FRAME_SAMPLES);
          await source.captureFrame(toInt16Frame(chunk));
          offset += FRAME_SAMPLES;
          if (offset >= active.samples.length) {
            // Drain the queue so the speech-end stamp is when the LAST voiced
            // frame actually left, then hand back to silence.
            await source.waitForPlayout();
            pumpState.utterance = null;
            offset = 0;
            active.done();
          }
        } else {
          await source.captureFrame(importFrame(silence));
        }
      }
    })().catch((err) => log(`  (mic pump failed: ${String(err)})`));

    // Give the worker time to be dispatched and start its session (bge is
    // prewarmed per worker, but session start + track subscription is real).
    const agentJoined = await waitFor(
      () => room.remoteParticipants.size > 0,
      PHASE_TIMEOUT_MS,
    );
    if (!agentJoined) {
      log("  ERROR: no agent joined the room — is the voice-agent worker running?");
      pumpState.pumping = false;
      await pump;
      await room.disconnect();
      turns.push(
        errorTurn(sessionIndex, 0, fixtures[0]?.displayText ?? "", "agent-never-joined"),
      );
      continue;
    }
    // Let the agent's session finish starting (publishes its track, greet path off).
    await sleep(2_000);

    for (let turnIndex = 0; turnIndex < suite.turns.length; turnIndex++) {
      const fixture = fixtures[turnIndex]!;
      const thisWatch: TurnWatch = {
        speechEndPerf: Number.POSITIVE_INFINITY,
        userFinalPerf: null,
        userTranscript: "",
        firstAgentTextPerf: null,
        agentFinalPerf: null,
        agentText: "",
        speakerSlug: null,
        firstAudiblePerf: null,
        lastAudiblePerf: null,
      };
      watch = thisWatch;

      // Speak the fixture; resolve when the last voiced frame has left.
      await new Promise<void>((resolve) => {
        pumpState.utterance = { samples: fixture.samples, done: resolve };
      });
      thisWatch.speechEndPerf = performance.now();

      // Wait for the reply: audible audio + final transcript, then a quiet tail.
      const gotAudio = await waitFor(() => thisWatch.firstAudiblePerf !== null, PHASE_TIMEOUT_MS);
      let error: string | null = null;
      if (!gotAudio) {
        error = "timeout-waiting-for-agent-audio";
      } else {
        await waitFor(() => thisWatch.agentFinalPerf !== null, PHASE_TIMEOUT_MS);
        await waitFor(
          () =>
            thisWatch.lastAudiblePerf !== null &&
            performance.now() - thisWatch.lastAudiblePerf > QUIET_TAIL_MS,
          PHASE_TIMEOUT_MS,
        );
      }

      const v2v =
        thisWatch.firstAudiblePerf !== null
          ? round1(thisWatch.firstAudiblePerf - thisWatch.speechEndPerf)
          : null;
      const spans: Partial<Record<SonarSpanName, number | null>> = {
        "voice-to-voice": v2v,
        "lk.endpoint":
          thisWatch.userFinalPerf !== null
            ? round1(thisWatch.userFinalPerf - thisWatch.speechEndPerf)
            : null,
        "lk.first-text":
          thisWatch.firstAgentTextPerf !== null
            ? round1(thisWatch.firstAgentTextPerf - thisWatch.speechEndPerf)
            : null,
      };

      turns.push({
        sessionIndex,
        turnIndex,
        message: fixture.displayText,
        responseText: thisWatch.agentText,
        orchestratorPrompt: null,
        speakerSlug: thisWatch.speakerSlug,
        decisionAction: thisWatch.agentText ? "speak" : null,
        utterance: { kind: "complete", finals: thisWatch.userFinalPerf ? 1 : 0, cutoff: false },
        stt: {
          transcript: thisWatch.userTranscript,
          scripted: fixture.displayText,
          wordCount: thisWatch.userTranscript.split(/\s+/).filter(Boolean).length,
          fixtureSynthesized: fixture.synthesized,
        },
        spans,
        flags: {
          contextCacheHit: false,
          retrievalSkipped: false,
          ackDelivered: false,
          ttsFallback: false,
          sttEmpty: !thisWatch.userTranscript,
          error,
        },
        usage: {
          inputTokens: null,
          outputTokens: null,
          estimatedCostUsd: null,
          provider: null,
          model: null,
          ttsProvider: null,
          ttsVoice: null,
          ttsChars: thisWatch.agentText.length || null,
          ttsCostUsd: null,
        },
        serverTrace: null,
        orchestrateTrace: null,
      });

      log(
        `  turn ${turnIndex + 1}/${suite.turns.length} · ` +
          (error
            ? `ERROR ${error}`
            : (thisWatch.speakerSlug ? `${thisWatch.speakerSlug} · ` : "") +
              `v2v=${fmt(v2v)} endpoint=${fmt(spans["lk.endpoint"])} first-text=${fmt(spans["lk.first-text"])}` +
              ` · "${truncate(thisWatch.userTranscript || "(no transcript)")}"`),
      );

      watch = null;
      await sleep(suite.settleMs ?? 400);
    }

    pumpState.pumping = false;
    await pump;
    await room.disconnect();
  }

  const aggregates: Partial<Record<SonarSpanName, SonarAggregate>> = {};
  for (const span of SONAR_SPANS) {
    const values = turns.map((t) => t.spans[span]).filter((v): v is number => typeof v === "number");
    const agg = aggregate(values);
    if (agg) aggregates[span] = agg;
  }
  const v2vValues = turns
    .map((t) => t.spans["voice-to-voice"])
    .filter((v): v is number => typeof v === "number");
  const v2vTargetMs = opts.sloMs ?? suite.v2vSloMs ?? DEFAULT_V2V_SLO_MS;

  return {
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    sonarVersion: SONAR_VERSION,
    // Stamped "livekit" so ledger rows never cross-compare transports.
    suite: { name: suite.name, version: suite.version, mode: "livekit" },
    git: opts.git ?? null,
    baseUrl: opts.livekitUrl,
    label: opts.label ?? null,
    runGroupId: opts.runGroupId ?? null,
    config: {
      character: suite.sceneId ?? opts.characterId ?? suite.character,
      model: null,
      ttsVoice: null,
      commitHoldMs: 0,
      prewarm: false,
      sessions,
      turnsPerSession: suite.turns.length,
    },
    observed: { providers: [], models: [], ttsProviders: [], ttsVoices: [] },
    turns,
    aggregates,
    slo:
      v2vValues.length > 0
        ? { v2vTargetMs, v2vAttainmentPct: sloAttainmentPct(v2vValues, v2vTargetMs) }
        : null,
    endpointing: null,
    errors: turns.filter((t) => t.flags.error).length,
    totalCostUsd: 0,
  };
}

/* ── helpers ── */

function toInt16Frame(chunk: Float32Array): AudioFrame {
  const i16 = new Int16Array(FRAME_SAMPLES); // zero-padded tail keeps 10ms cadence
  for (let i = 0; i < chunk.length; i += 1) {
    const s = Math.max(-1, Math.min(1, chunk[i]!));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new AudioFrame(i16, SAMPLE_RATE, 1, FRAME_SAMPLES);
}

function importFrame(i16: Int16Array): AudioFrame {
  return new AudioFrame(i16, SAMPLE_RATE, 1, i16.length);
}

function errorTurn(
  sessionIndex: number,
  turnIndex: number,
  scripted: string,
  error: string,
): SonarTurnRecord {
  return {
    sessionIndex,
    turnIndex,
    message: scripted,
    responseText: "",
    orchestratorPrompt: null,
    speakerSlug: null,
    decisionAction: null,
    utterance: { kind: "complete", finals: 0, cutoff: false },
    stt: { transcript: "", scripted, wordCount: 0, fixtureSynthesized: true },
    spans: {},
    flags: {
      contextCacheHit: false,
      retrievalSkipped: false,
      ackDelivered: false,
      ttsFallback: false,
      sttEmpty: true,
      error,
    },
    usage: {
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: null,
      provider: null,
      model: null,
      ttsProvider: null,
      ttsVoice: null,
      ttsChars: null,
      ttsCostUsd: null,
    },
    serverTrace: null,
    orchestrateTrace: null,
  };
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return true;
    await sleep(25);
  }
  return predicate();
}

function fmt(value: number | null | undefined): string {
  return typeof value === "number" ? `${Math.round(value)}ms` : "–";
}

function truncate(text: string, max = 40): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
