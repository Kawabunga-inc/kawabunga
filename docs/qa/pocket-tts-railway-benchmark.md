# Pocket TTS Railway deployment and pricing evidence

Date: 2026-08-07

Environment: Railway `orchestration / production`

Service: `pocket-tts-production` (`f9a04d19-ed64-40a3-87c9-ac0f79e17a29`)

Domain: `https://pocket-tts-production-production.up.railway.app`

Deployment source: `codex/pocket-tts-service` at `b42dbab`

## Deployment contract

- Dedicated Pocket-only FastAPI process; `audio-rt` remains the STT service.
- One Railway replica in US West.
- Railway Serverless enabled.
- `/healthz` deployment health check with a 120-second timeout.
- Config-as-code path `/railway.pocket-tts.json`.
- `HF_TOKEN` references the existing `audio-rt` variable; its value was not copied or exposed.
- `/warm`, `/speak`, and `/export-voice` require the shared Pocket bearer token.
- `voice-agent` and `voice-host` reference the Pocket URL and bearer token through Railway variables.

## Live contract checks

| Check | Result |
| --- | --- |
| `GET /healthz` | `200`, `ok: true`, `mode: tts-only` |
| `GET /readyz` | `200`, ready after startup prime |
| Authenticated `POST /warm` | `200`, `ok: true`, voice `abraham` |
| Unauthenticated `POST /warm` | `401` |
| Authenticated `POST /speak` | `200`, `meta` + `audio` + `done` |
| Smoke synthesis | 45 characters, 42 audio chunks, 1,842 ms client total |

## Controlled pricing run

Window: `2026-08-07T23:25:06.382Z` to `2026-08-07T23:31:55.461Z`

Workload: 50 sequential requests × 200 characters

Concurrency: 1

Characters: 10,000 exact

Failures: 0

Wall time: 409,079 ms

| Metric | Min | Mean | p50 | p95 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Client first audio | 302 ms | 387 ms | 365 ms | 528 ms | 622 ms |
| Gateway first audio | 149 ms | 164 ms | 161 ms | 178 ms | 197 ms |
| Request total | 6,751 ms | 7,212 ms | 7,155 ms | 7,728 ms | 8,000 ms |

The first Railway service-cost snapshot, taken immediately after the workload,
was `$0.0088`: `$0.0038` CPU, `$0.0024` RAM, `$0.0026` egress, and no volume
cost. The final rate below includes the Serverless idle tail so it represents
the effective cost of an isolated production burst, not only warm marginal
generation.

## Settled burst cost

Railway showed the service as `Sleeping` after the configured inactivity
window. The settled service subtotal for deployment, startup priming, the
45-character smoke test, the controlled 10,000-character run, and the complete
Serverless idle tail was `$0.0104`:

| Resource | Usage | Cost |
| --- | ---: | ---: |
| CPU | 8.14 minutely vCPU | $0.0038 |
| RAM | 17.32 minutely GB | $0.0040 |
| Egress | 0.05 GB | $0.0026 |
| Volume | 0.00 GB | $0.0000 |
| **Total** |  | **$0.0104** |

Normalized against the controlled 10,000-character denominator, the effective
isolated-burst rate is **$1.04 per million characters**. This intentionally
includes cold startup and the idle tail; it is the conservative rate configured
in Railway's `SESSION_COST_POCKET_TTS_USD_PER_MILLION_CHARACTERS` variable.
Including the 45-character smoke output in the denominator would produce about
`$1.035` per million characters.

## Cold wake verification

The following check ran only after the settled cost snapshot above, so it is not
part of the pricing denominator:

| Check | Result |
| --- | --- |
| First `GET /healthz` while Sleeping | `200` in 1,537 ms |
| Immediate `GET /readyz` | `503`, correctly not ready |
| Authenticated `POST /warm` | `200` in 2,954 ms wall time; 2,718 ms gateway prime |
| `GET /readyz` after warm | `200`, ready |

This proves the intended boundary: Railway can route to a cheap liveness
endpoint as the container wakes, while callers explicitly wait for `/warm`
before admitting the first spoken turn.
