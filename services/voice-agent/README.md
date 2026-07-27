# @kawabunga/voice-agent

The LiveKit twin of `services/voice-host`. A long-running `@livekit/agents`
worker that registers with LiveKit, is dispatched into a room, and runs the
Kawabunga voice pipeline server-side over a WebRTC track — real-time
transport, AEC, and barge-in the SSE path can't do. The knowledge-graph
brain (`runVoiceStream` from `@kawabunga/voice-pipeline`) is reused
unchanged.

## Status

Fully wired — the unit of voice is a **scene**:

- **Rooms route by name** (`src/agent.ts`): `scene-<sceneId>-<sessionUUID>`
  runs the multi-character orchestrator loop; `char-<characterUUID>-<sessionId>`
  is a legacy shim resolving to that character's solo scene. Every room runs
  through one `SceneDriver`.
- **`SceneDriver`** (`src/scene-driver.ts`) owns the loop: per-turn director
  decisions (Cerebras/Groq, in-process — no HTTP hop), speculative speaker
  selection under the endpoint hold, the async **dramaturg** (director's
  notes, arc landings, durable scene facts), narration TTS, sfx cues, turn
  epochs/abort, and degraded-decision recovery.
- **Audio in**: LiveKit Inference STT (`deepgram/nova-3` default), silero
  VAD, `v1-mini` end-of-turn detector, Krisp background-voice cancellation.
- **Audio out**: a dedicated published track fed by `runVoiceStream`
  (deliberately not `session.say` — see the note in `src/agent.ts`), plus a
  second `world-audio` track for ambience beds and one-shots
  (`src/world-audio.ts`).

## Env flags

| Flag | Default | What it does |
|---|---|---|
| `VOICE_AGENT_CHARACTER_ID` | — | fallback character for rooms that encode neither scene nor character |
| `VOICE_AGENT_STT` | `deepgram/nova-3` | LiveKit Inference STT model |
| `VOICE_AGENT_SPECULATE` | on | speculative speaker selection off partial transcripts (`=0` off) |
| `VOICE_AGENT_PROACTIVE` | off | director may take a turn after `VOICE_AGENT_IDLE_MS` silence (`=1` on) |
| `VOICE_AGENT_DRAMATURG` | on | async reflection loop (notes, arc, facts; `=0` off) |
| `VOICE_AGENT_DRAMATURG_MODEL` | `claude-sonnet-4-5` | dramaturg model |
| `VOICE_AGENT_WORLD_AUDIO` | on | ambience/sfx track (`=0` off) |
| `VOICE_AGENT_PERSIST_SCENE` | off | persist SceneState snapshots to the session (`=1` on) |
| `VOICE_AGENT_SOLO_CUE` / `_ON_MISS` | on / off | latency-hidden director cues for solo scenes |
| `ORCHESTRATOR_PROVIDER` / `_TIMEOUT_MS` | auto / 10000 | director provider pin and hung-call backstop |

Plus the brain's env (`DATABASE_URL`, provider keys, `ELEVENLABS_*`, …) and
`LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`.

## Run

```bash
npm run dev -w @kawabunga/voice-agent     # loads services/voice-agent/.env + root .env
npm run agent:voice -- dev                # repo root; env must already be exported
```

Join via the admin sandbox (`NEXT_PUBLIC_VOICE_AGENT=1`) or the LiveKit
Agents Playground. `GET /healthz` reports process liveness only.

Headless, no LiveKit needed:

```bash
npm run simulate -- --scene abrahams-tent --user "a skeptical traveler"   # full loop, text-only
npm run scene-probes                                                      # director decision probes
npx vitest run services/voice-agent                                       # driver unit tests
```

## Deploy (Railway)

Dockerfile mirrors voice-host: build context = repo root, Dockerfile path
`services/voice-agent/Dockerfile`, `npm ci` + bge pre-bake, healthcheck
`/healthz`. Set the `LIVEKIT_*` env in Railway; leave `EMBEDDING_PROVIDER`
unset (warm in-process bge).
