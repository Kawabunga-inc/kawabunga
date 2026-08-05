/**
 * Headless A2 smoke test — proves the voice-agent loop end-to-end without a human.
 *
 * Publishes a spoken WAV into a fresh room as a "mic" track; the registered agent
 * (automatic dispatch) joins, does STT + turn detection, runs runVoiceStream, and
 * publishes the character's voice back. We capture that response audio track and
 * report frames received + first-audio latency.
 *
 * Run the worker first (same env), then this:
 *   npx tsx --env-file=services/voice-agent/.env services/voice-agent/src/agent.ts dev
 *   npx tsx --env-file=.env services/voice-agent/scripts/smoke.ts [path.wav ...]
 */
import { readFileSync } from "node:fs";
import { resolveLiveSceneAgentName } from "@kawabunga/types";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
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
  dispose,
} from "@livekit/rtc-node";

const URL = process.env.LIVEKIT_URL;
const KEY = process.env.LIVEKIT_API_KEY;
const SECRET = process.env.LIVEKIT_API_SECRET;
if (!URL || !KEY || !SECRET) {
  console.error("set LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET (use --env-file)");
  process.exit(2);
}

const WAVS = process.argv.slice(2);
if (WAVS.length === 0) WAVS.push("/tmp/utterance.wav");
// SMOKE_ROOM lets us target a scene room (scene-<sceneId>-<uuid>) to exercise the
// multi-character orchestrator loop; default is a single-character smoke room.
const ROOM = process.env.SMOKE_ROOM ?? `char-abraham-smoke-${Date.now()}`;

/** Minimal 16-bit PCM WAV reader → { sampleRate, channels, pcm: Int16Array }. */
function readWav(path: string): { sampleRate: number; channels: number; pcm: Int16Array } {
  const b = readFileSync(path);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${path}: not a RIFF/WAVE file`);
  }
  let off = 12;
  let sampleRate = 16000;
  let channels = 1;
  let dataOff = 44;
  let dataLen = b.length - 44;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === "fmt ") {
      channels = b.readUInt16LE(off + 10);
      sampleRate = b.readUInt32LE(off + 12);
    } else if (id === "data") {
      dataOff = off + 8;
      dataLen = size;
      break;
    }
    off += 8 + size + (size % 2);
  }
  const pcm = new Int16Array(dataLen / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = b.readInt16LE(dataOff + i * 2);
  return { sampleRate, channels, pcm };
}

async function main() {
  const at = new AccessToken(KEY!, SECRET!, { identity: "smoke-tester", ttl: 300 });
  at.addGrant({ roomJoin: true, room: ROOM, canPublish: true, canSubscribe: true });
  if (ROOM.startsWith("scene-")) {
    at.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: resolveLiveSceneAgentName(process.env.LIVEKIT_AGENT_NAME),
          metadata: JSON.stringify({ source: "headless-e2e", room: ROOM }),
        }),
      ],
    });
  }
  const token = await at.toJwt();

  const room = new Room();
  const VOICE_THRESHOLD = 500; // Int16 |amp| > ~1.5% of full scale = real audio, not silence
  let agentJoined = false;
  let agentVoiceSubscribed = false;
  let activeTurn:
    | {
        sentAt: number;
        firstVoicedMs: number;
        lastVoicedAt: number;
        voicedFrames: number;
        peak: number;
        frames: number;
        userTranscript: string | null;
        agentTranscript: string | null;
        agentStarted: boolean;
      }
    | undefined;
  const turnResults: NonNullable<typeof activeTurn>[] = [];
  const liveMessages: unknown[] = [];

  room.on(RoomEvent.ParticipantConnected, (p) => {
    agentJoined = true;
    console.log(`[smoke] participant joined: ${p.identity} (← the agent)`);
  });
  room.on(RoomEvent.DataReceived, (payload) => {
    try {
      const message = JSON.parse(new TextDecoder().decode(payload));
      liveMessages.push(message);
      if (
        activeTurn &&
        message.role === "agent" &&
        message.speaker?.slug !== "narrator" &&
        !activeTurn.agentStarted
      ) {
        activeTurn.agentStarted = true;
        // Character partial text precedes speech. Start scoring here so the
        // latency is response audio, not opening narration or a post-final tail.
        activeTurn.firstVoicedMs = 0;
        activeTurn.lastVoicedAt = 0;
        activeTurn.voicedFrames = 0;
        activeTurn.peak = 0;
        activeTurn.frames = 0;
      }
      if (message?.final && typeof message?.text === "string") {
        console.log(`[smoke] transcript: ${message.role ?? "?"} ${message.speaker?.name ?? ""}: ${message.text}`);
        if (activeTurn && message.role === "user") activeTurn.userTranscript = message.text;
        if (
          activeTurn &&
          message.role === "agent" &&
          message.speaker?.slug !== "narrator"
        ) {
          activeTurn.agentTranscript = message.text;
        }
      }
    } catch {
      // Non-transcript data is irrelevant to this smoke test.
    }
  });
  room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
    console.log(
      `[smoke] subscribed ${track.kind} track=${pub.name} from ${participant.identity}`,
    );
    if (track.kind === TrackKind.KIND_AUDIO && pub.name === "agent-voice") {
      agentVoiceSubscribed = true;
      const stream = new AudioStream(track);
      void (async () => {
        for await (const frame of stream) {
          // Energy gate: an idle AgentSession publishes a SILENT output track, so
          // "received frames" ≠ "received speech". Count only frames with real amplitude.
          const data = frame.data;
          let framePeak = 0;
          for (let j = 0; j < data.length; j++) {
            const a = Math.abs(data[j] ?? 0);
            if (a > framePeak) framePeak = a;
          }
          if (activeTurn) {
            activeTurn.frames++;
            if (framePeak > activeTurn.peak) activeTurn.peak = framePeak;
            if (framePeak > VOICE_THRESHOLD) {
              activeTurn.voicedFrames++;
              activeTurn.lastVoicedAt = Date.now();
              if (activeTurn.firstVoicedMs === 0) {
                activeTurn.firstVoicedMs = Date.now() - activeTurn.sentAt;
                console.log(
                  `[smoke] ◀ FIRST voiced agent audio @ ${activeTurn.firstVoicedMs}ms (peak ${framePeak})`,
                );
              }
            }
          }
        }
      })();
    }
  });

  await room.connect(URL!, token, { autoSubscribe: true, dynacast: false });
  console.log(`[smoke] connected to room ${ROOM}`);

  const readinessDeadline = Date.now() + 30_000;
  while ((!agentJoined || !agentVoiceSubscribed) && Date.now() < readinessDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!agentJoined || !agentVoiceSubscribed) {
    throw new Error("agent did not join and publish agent-voice within 30 seconds");
  }
  // Enter while the authored opening is still playing. This exercises the real
  // barge-in path; response scoring below begins only after character text lands.
  await new Promise((resolve) => setTimeout(resolve, 1_000));

  const firstWav = readWav(WAVS[0]!);
  const { sampleRate, channels } = firstWav;
  // The rtc-node default queue is only 1s. A multi-second WAV pushed faster
  // than playout gets truncated; use a room-sized buffer and await its drain.
  const source = new AudioSource(sampleRate, channels, 10_000);
  const track = LocalAudioTrack.createAudioTrack("smoke-mic", source);
  await room.localParticipant!.publishTrack(
    track,
    new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
  );
  const FRAME = Math.floor(sampleRate / 100); // 10ms frames queued for continuous playout
  for (const [index, wavPath] of WAVS.entries()) {
    const { sampleRate: wavRate, channels: wavChannels, pcm } = readWav(wavPath);
    if (wavRate !== sampleRate || wavChannels !== channels) {
      throw new Error(`${wavPath}: all utterances must share sample rate and channel count`);
    }
    activeTurn = {
      sentAt: Date.now(),
      firstVoicedMs: 0,
      lastVoicedAt: 0,
      voicedFrames: 0,
      peak: 0,
      frames: 0,
      userTranscript: null,
      agentTranscript: null,
      agentStarted: false,
    };
    console.log(
      `[smoke] ▶ turn ${index + 1}: "${wavPath}" (${sampleRate}Hz ${channels}ch, ${(pcm.length / sampleRate).toFixed(1)}s)`,
    );
    for (let i = 0; i < pcm.length; i += FRAME) {
      const slice = pcm.subarray(i, Math.min(i + FRAME, pcm.length));
      // rtc-node's AudioFrame proto reads from the start of data.buffer and does
      // not preserve a typed-array byteOffset. Copy the view or every frame
      // repeats the WAV's first 10ms instead of advancing through the utterance.
      const frameData = new Int16Array(slice.length);
      frameData.set(slice);
      await source.captureFrame(
        new AudioFrame(frameData, sampleRate, channels, frameData.length),
      );
    }
    const sil = new Int16Array(FRAME);
    for (let k = 0; k < 100; k++) {
      await source.captureFrame(new AudioFrame(sil, sampleRate, channels, sil.length));
    }
    await source.waitForPlayout();
    console.log(`[smoke] turn ${index + 1} sent; waiting up to 40s for voiced response…`);
    const responseDeadline = Date.now() + 40_000;
    while (Date.now() < responseDeadline) {
      if (
        activeTurn.voicedFrames >= 20 &&
        activeTurn.userTranscript !== null &&
        activeTurn.agentTranscript !== null &&
        activeTurn.lastVoicedAt > 0 &&
        Date.now() - activeTurn.lastVoicedAt >= 1_500
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    turnResults.push(activeTurn);
    activeTurn = undefined;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("\n=== SMOKE RESULT ===");
  console.log(`agent joined room : ${agentJoined}`);
  for (const [index, result] of turnResults.entries()) {
    console.log(
      `turn ${index + 1}: frames=${result.frames}, voiced=${result.voicedFrames}, peak=${result.peak}/32767, first=${result.firstVoicedMs ? `${result.firstVoicedMs}ms` : "none"}`,
    );
    console.log(`  user: ${result.userTranscript ?? "—"}`);
    console.log(`  agent: ${result.agentTranscript ?? "—"}`);
  }
  console.log(`live data messages: ${liveMessages.length}`);
  // PASS needs real speech energy, not just the session's silent keepalive track.
  const ok = turnResults.every(
    (result) =>
      result.voicedFrames >= 20 &&
      result.peak > VOICE_THRESHOLD &&
      result.userTranscript !== null &&
      result.agentTranscript !== null,
  );
  console.log(
    ok
      ? "✅ A2 LOOP WORKS — the agent heard the utterance and spoke a real response."
      : "❌ no real speech from the agent (silent track only) — STT/brain didn't complete; see worker logs.",
  );
  await room.disconnect();
  await dispose();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("[smoke] error:", e);
  process.exit(1);
});
