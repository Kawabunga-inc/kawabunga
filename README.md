# Kawabunga

Kawabunga is a Vercel-ready Next.js application for voice-first AI simulations. Phase 1 ships a reusable engine that supports structured worlds, dynamic event generation, explicit state tracking, resumable sessions, and a minimal web client with chat fallback.

## Stack

- Next.js 16 App Router
- Tailwind CSS v4
- Neon Postgres with Drizzle ORM
- OpenAI for text, speech-to-text, and text-to-speech
- Vitest for engine tests

## What is implemented

- A generic simulation model for worlds, roles, factions, characters, relationships, and event templates
- A reference world pack, `The King`, built on monarchy and governance dynamics
- A turn-processing pipeline:
  - ingest text or voice transcript
  - enforce policy guardrails
  - select a plausible event
  - update structured world state
  - generate narration and NPC responses
  - persist sessions and turn logs
- API routes for worlds, sessions, turns, speech transcription, and speech synthesis
- Neon-backed persistence with an in-memory fallback when `DATABASE_URL` is absent
- A Tailwind-based browser UI for starting a world, issuing turns, seeing transcript output, and watching state meters change

## Project structure

```text
src/app                 App Router pages and API routes
src/components          Client UI
src/data/worlds         Structured world definitions
src/lib/db              Neon + Drizzle persistence
src/lib/simulation      Engine services and adapters
src/types               Domain schemas and types
```

## Environment

Create `.env.local` with:

```bash
DATABASE_URL=postgresql://user:password@your-neon-endpoint/odyssey?sslmode=require
NEXT_PUBLIC_SITE_URL=http://localhost:3000
AUTH_SECRET=...
AUTH_TRUST_HOST=true
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
OPENAI_API_KEY=sk-...
TTS_PROVIDER=openai
TTS_ENABLE_FALLBACK=false
# Optional fallback if you explicitly enable it
TTS_FALLBACK_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

Auth requires `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and
`AUTH_GOOGLE_SECRET`. Use `AUTH_TRUST_HOST=true` for local development and for
deployments behind a trusted platform/proxy. Google OAuth must allow these
callback URLs for local development:

```text
http://localhost:3000/api/auth/callback/google
http://localhost:3001/api/auth/callback/google
```

`AUTH_SECRET` can be generated with:

```bash
npx auth secret
```

If `DATABASE_URL` is missing, some non-auth stores fall back to in-memory
persistence, but sign-in, account creation, Google OAuth persistence, and admin
user management require a working Postgres database.

If `OPENAI_API_KEY` is missing, the app still runs with deterministic fallback narration/dialogue generation and disables real OpenAI STT/TTS behavior.

For a strict pay-per-usage setup, keep `TTS_PROVIDER=openai` and `TTS_ENABLE_FALLBACK=false`.

## Development

Install dependencies and start the app:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database

Generate or push the Drizzle schema:

```bash
npm run db:generate
npm run db:push
```

For auth-only database setup or verification:

```bash
npm run auth:db:ensure
npm run auth:db:verify
```

The schema lives in [`packages/db/src/schema.ts`](packages/db/src/schema.ts).

## Test and build

```bash
npm run lint
npm run test
npm run build
```

## Notes

- The current voice button uses browser speech recognition when available and keeps text as a first-class fallback.
- OpenAI is the default audio provider for pay-per-usage deployment.
- ElevenLabs is optional and can be used as a fallback only when `TTS_ENABLE_FALLBACK=true`.
- The app is structured to deploy on Vercel, but Neon and OpenAI credentials must be configured in the Vercel project environment before production use.
