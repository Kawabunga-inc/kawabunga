# Pocket TTS service

Dedicated, serverless-ready Pocket TTS HTTP service. It owns synthesis and
voice extraction; `services/audio-rt` remains the streaming STT service.

## Contract

- `GET /healthz` — liveness; returns immediately while the model warms.
- `GET /readyz` — readiness; `503` until model, default voice, and inference
  path are primed.
- `POST /warm` — wake and synchronously prime `{ voice?, voiceUrl? }`.
- `POST /speak` — the existing SSE `meta` / `audio` / `done` / `error`
  contract.
- `POST /export-voice` — return a `.safetensors` embedding extracted from a
  base64 source clip.

There are deliberately no database connections, telemetry exporters, timers
that call external services, or STT dependencies. After request traffic stops,
the process emits no outbound network traffic and is eligible for Railway
Serverless sleep.

## Railway deployment

Create a service named `pocket-tts-production` from this repository, then set:

- Config-as-code path: `/railway.pocket-tts.json`
- One replica
- Generate a public domain
- Settings → Deploy → Serverless → enabled

Required service variable:

```text
HF_TOKEN=<token allowed to download kyutai/pocket-tts>
POCKET_TTS_API_TOKEN=<long random shared bearer token>
```

Defaults already baked into the image:

```text
UVICORN_WORKERS=1
POCKET_TTS_WARM_ON_STARTUP=1
POCKET_TTS_FIRST_AUDIO_TIMEOUT_SECONDS=90
POCKET_TTS_TOTAL_TIMEOUT_SECONDS=180
```

Do not add a database URL or an outbound heartbeat. Railway sleeps a service
after ten minutes without outbound traffic; either would keep it awake.

## Migration sequence

1. Deploy this service and verify `/healthz`, `/warm`, and `/speak`.
2. Set the admin, voice host, and voice agent variable:

   ```text
   POCKET_TTS_BASE_URL=https://<generated-pocket-domain>
   POCKET_TTS_API_TOKEN=<same shared bearer token>
   ```

3. Keep `KYUTAI_TTS_BASE_URL` only as a temporary legacy fallback.
4. Redeploy `audio-rt` with `POCKET_TTS_WARM_ON_STARTUP=0`. Its old TTS
   endpoints remain available for rollback but no longer hold a Pocket model
   in memory.
5. Enable Serverless on the dedicated Pocket service in Railway's Deploy
   settings. Serverless is a dashboard service setting, not part of Railway's
   deployment config file.

The admin sandbox calls `/api/audio/pocket-warm` during its pre-session phase.
That route wakes the Railway service, resolves the selected voice, and waits
for `/warm` before the first spoken turn is admitted.

## Pricing test

The new Railway service has no STT allocation, so its resource subtotal can be
divided directly by successful Pocket characters.

Run a controlled load after deployment:

```bash
npm run pocket:metrics -- \
  --base-url https://<generated-pocket-domain> \
  --target-characters 10000 \
  --concurrency 1
```

Wait for the service to sleep and Railway usage to settle. Take the dedicated
service's cost delta and normalize it:

```bash
npm run pocket:metrics -- \
  --monthly-cost-usd <service-cost-delta> \
  --monthly-characters 10000 \
  --no-benchmark
```

Use a representative session pattern when setting the production rate. With
Serverless, the effective price includes model warm-up and Railway's idle tail,
so a single synthetic burst and many isolated one-turn sessions have different
economics.

## Local validation

Build from the repository root because the image copies the existing baked
voice embeddings from `services/audio-rt/voices`:

```bash
docker build -f services/pocket-tts/Dockerfile -t kawabunga-pocket-tts .
docker run --rm -p 8080:8080 -e HF_TOKEN kawabunga-pocket-tts
curl http://127.0.0.1:8080/healthz
```
