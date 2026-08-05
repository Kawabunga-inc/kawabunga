# Live experience — development plan & handoff prompts

Design source of truth: the Paper file **"kawabunga - agent"**
(`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0`). Every prompt
below carries full links to its artboards so it stays self-contained when
copy-pasted into a ticket or an agent session. The design system contract is
the **Kawabunga — Brand & Design System** board — its Ocean tokens are also
registered as Paper design tokens in the file. Tokens are the contract:
**never hardcode hex in product code.**

### Artboard index

| Artboard | Link | Used by |
| --- | --- | --- |
| Kawabunga — Brand & Design System | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1Z9-0 | A1, every review |
| The Narrator — session data flow (system orientation) | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0 (leftmost board on the canvas) | A2, B2 onboarding |
| Live session workbench (component) | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/R4-0 | B1 |
| Sessions — active now (component) | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/XM-0 | B3 |
| Turn analysis — turn click (inspector state) | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/10E-0 | B2 |
| Page — Sessions | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/140-0 | B3 |
| Page — Live session workbench | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/183-0 | A2, B1 |
| Page — Workbench · turn selected | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1FF-0 | B1, B2 |
| Page — Scene sessions rollup | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1OV-0 | B3 (columns), shipped rollup reference |
| Page — Scene canvas · on air | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1T0-0 | B4 |
| Web — Scene lander | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1WG-0 | C1 |
| Web — Active scene (waveform) | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1Y8-0 | C2, C3 (toggle) |
| Web — Active scene · story view | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/2R2-0 | C3 |
| Web — Active scene · session view (admin) | https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/2ST-0 | C4 |

For exact values (colors, spacing, type), pull from the artboard nodes and the
file's registered design tokens via the Paper MCP (`get_jsx`,
`get_computed_styles`, `get_tokens`) rather than eyeballing screenshots.

Already shipped (PRs #121, #123): the scene journal capture (both transports)
and the session workbench's journal rail, Director/Chronicle inspectors,
session pulse, scene rollup page, and the sandbox's polled journal panel.
Everything below builds on that.

Suggested order: A1 → A2 → (B1 → B2 → B3 → B4) ∥ (C1 → C2 → C3 → C4).
B and C tracks are parallelizable after A2. Hand off and review one at a time.

---

## A1 — Ocean design tokens in code

> **Prompt:**
> Implement the Ocean design-token contract as CSS variables shared by both
> apps, and refactor existing hardcoded values onto it.
>
> Reference: **Kawabunga — Brand & Design System** artboard
> (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1Z9-0`), sections 03 Color, 04 Typography, 05 Space/Radius/Elevation,
> 10 Theme Modes. The same values exist as Paper design tokens in the file —
> mirror their names (`--color-background: #13181D`, `--color-accent-strong:
> #8FD1CB`, `--color-warning-amber: #FFB84D`, `--radius-card: 18px`,
> `--text-*` scale, etc.).
>
> Scope:
> 1. Create a single token stylesheet (suggest `packages/ui/src/ocean.css` or
>    equivalent) defining all tokens under `:root`, with `data-theme="deep"`
>    (`#05070A` ground) and `data-theme="light"` overrides per the Theme Modes
>    section. Import it from both `apps/admin` and `apps/web` globals.
> 2. Refactor `apps/admin/src/components/session-workbench-theme.ts` so its
>    exported constants resolve to `var(--…)` references instead of literal hex.
>    Do not restyle components beyond the mapping (bg `#0C0E14`→`--color-background`,
>    inspector `#0A0C12`→`--color-sidebar`, ambers→`--color-warning-amber`,
>    error red→`--color-status-error`, radius 14→`--radius-card`, text
>    opacities→ the `--color-text-*` scale).
> 3. `apps/web/src/app/globals.css`: replace the `#0a0a0a` ground with tokens;
>    default web pages to Ocean, scene player surfaces to Deep.
>
> Acceptance: grep finds no raw Ocean-palette hex in admin/web component code;
> workbench renders visually unchanged except ground `#13181D`, card radius 18,
> and semantic amber/red; `npm run lint && npm run test && npm run build` pass.
>
> **On completion:** reply with a completion report *formatted as a prompt for
> the manager agent* — self-contained (the manager has not seen your session):
> item id (A1) + branch/PR link; what changed and why, by file; design fidelity
> vs the artboard(s) above with any deviations and reasons; verification
> evidence (commands + results, screenshots vs artboard); risks & follow-ups;
> and the 1–2 things the manager should review first.

---

## A2 — Shared live-session feed + merge hook

> **Prompt:**
> Build the incremental live feed every live surface consumes.
>
> References: design intent on **Page — Live session workbench**
> (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/183-0`) header (LIVE badge with last-event age, pause feed).
> Existing code: `packages/db/src/scene-session-store.ts` (store),
> `apps/admin/src/app/api/scene-sessions/[sessionId]/events/route.ts`
> (existing journal poll), `apps/admin/src/components/session-journal.tsx`
> (`useSessionJournal` — the pattern to generalize).
>
> Scope:
> 1. Store methods: `listTurnsUpdatedSince(sessionId, sinceIso)` (cursor on
>    `updatedAt` — turn rows mutate in place while streaming) and
>    `listEventsSince(sessionId, sinceIso)`; include memory-store parity and
>    tests.
> 2. Route: `GET /api/scene-sessions/:id/live?turnsSince=&eventsSince=` →
>    `{ session, turns, events, serverTime }` where `session` includes status +
>    `currentScene` snapshot. Cap result sizes; return cursors.
> 3. Hook: `useLiveSessionDetail(initialDetail)` in the admin app — merges
>    increments into the `SceneSessionDetailRecord` shape (upsert turns by id,
>    append events by id), polls every 2s only while `status === "active"` AND
>    `document.visibilityState === "visible"`, does one settling fetch after
>    the session ends, exposes `{ detail, isLive, lastEventAgeMs, paused,
>    setPaused }`.
>
> Acceptance: unit tests for cursor semantics (updated turn re-fetched;
> no duplicates on merge); polling stops when tab hidden/paused/ended; no
> schema changes.
>
> **On completion:** reply with a completion report *formatted as a prompt for
> the manager agent* — self-contained (the manager has not seen your session):
> item id (A2) + branch/PR link; what changed and why, by file; design fidelity
> vs the artboard(s) above with any deviations and reasons; verification
> evidence (commands + results, screenshots vs artboard); risks & follow-ups;
> and the 1–2 things the manager should review first.

---

## B1 — Workbench live mode

> **Prompt:**
> Make `/sessions/[sessionId]` live when the session is active — one workbench,
> two modes, pixel-per **Page — Live session workbench** (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/183-0`) and
> the component board **Live session workbench** (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/R4-0`).
>
> Build on A2's `useLiveSessionDetail`. Existing code:
> `apps/admin/src/components/session-detail-workbench.tsx`,
> `session-pulse.tsx`, `session-journal.tsx`.
>
> Scope:
> 1. Header live cluster: `● LIVE · last event Ns ago` pill (age from the hook,
>    honest — it ticks), `❚❚ PAUSE FEED` toggle, transport chip. Hidden for
>    ended sessions (unchanged today).
> 2. Auto-follow: while live and nothing selected, the rail pins to the newest
>    item and the inspector tracks the newest decision ("updates in place");
>    any manual selection disengages follow; a `● FOLLOWING LIVE / FOLLOWING
>    PAUSED` pill at the rail's foot shows state; clicking the pulse's NOW
>    marker resumes following (see **Page — Workbench · turn selected**,
>    `https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1FF-0`, for the paused state).
> 3. Streaming turn treatment: dashed accent border card, live cursor `▍` on
>    the partial text, TTS progress bar when available (turn row status
>    `streaming`/incomplete).
> 4. Pulse gains the dashed NOW edge + ghosted in-flight bar.
> 5. KPI strip adds Decisions / Degraded / Spec hit / Reflections (computed
>    from journal items — reuse the rollup's aggregation logic).
>
> Acceptance: an ended session renders exactly as before (no live chrome); a
> live session follows, pauses, and resumes; no interval runs after unmount or
> session end. Verify with a sandbox session running in a second tab.
>
> **On completion:** reply with a completion report *formatted as a prompt for
> the manager agent* — self-contained (the manager has not seen your session):
> item id (B1) + branch/PR link; what changed and why, by file; design fidelity
> vs the artboard(s) above with any deviations and reasons; verification
> evidence (commands + results, screenshots vs artboard); risks & follow-ups;
> and the 1–2 things the manager should review first.

---

## B2 — Turn analysis & causality chips

> **Prompt:**
> Implement the full-turn-analysis inspector state per **Turn analysis — turn
> click** (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/10E-0`) and its in-page context **Page — Workbench · turn
> selected** (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1FF-0`).
>
> Existing code: `session-detail-workbench.tsx` (Pipeline lanes already exist),
> `session-journal.tsx` (journal items carry `turnIndex`, before/after state).
>
> Scope:
> 1. Causality resolution: for a selected turn, find the decision journal item
>    that caused it (match on `turnIndex` / nearest preceding decision with
>    `action: speak|narrate`) and the first reflection that followed it.
> 2. Chip strip at the inspector top — `◂ caused by decision N · action · spec
>    · latency` and `reflection M followed · +facts · note ▸`; clicking a chip
>    selects that journal item (opens Director/Chronicle tab respectively);
>    chips render on turn, decision, AND reflection selections so the chain is
>    walkable from any entry point.
> 3. Anchor rules: turn click → Pipeline tab; director row → Director;
>    chronicler row → Chronicle (already partially true — make it consistent).
> 4. Pipeline additions per the artboard: a `director (spec hit)` lane showing
>    only the awaited ms with the footnote when speculation ran under the hold;
>    "What <speaker> was given" panel (beat, agenda, system-prompt sizes,
>    curator page chips, tokens/cost from `tokenUsage`); Voice & guards panel
>    (playable audio artifact, refusal-guard verdict from turn metadata,
>    barge-in status).
>
> Acceptance: chips navigate correctly on a journaled session; sessions
> predating the journal render the turn analysis without chips (no crashes);
> unit-test the causality matcher against journal fixtures.
>
> **On completion:** reply with a completion report *formatted as a prompt for
> the manager agent* — self-contained (the manager has not seen your session):
> item id (B2) + branch/PR link; what changed and why, by file; design fidelity
> vs the artboard(s) above with any deviations and reasons; verification
> evidence (commands + results, screenshots vs artboard); risks & follow-ups;
> and the 1–2 things the manager should review first.

---

## B3 — Sessions page: Active now

> **Prompt:**
> Rebuild `/sessions` per **Page — Sessions** (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/140-0`) / component board
> **Sessions — active now** (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/XM-0`).
>
> Existing code: `apps/admin/src/app/(authenticated)/sessions/page.tsx`,
> store `listSessionSummaries`.
>
> Scope:
> 1. Active-now rule (server-side): `status === "active"` AND newest
>    event/turn/lastActiveAt under 60s old — stale actives demote to Recent
>    automatically (crashed workers must not show phantom live sessions).
>    Render the rule as the footnote, verbatim from the artboard.
> 2. Active cards: live dot, scene title, user · mode · transport · elapsed,
>    TURNS / LAST EVENT / ARC / DEGRADED, and a `Watch live →` CTA into the
>    workbench (which opens following, per B1).
> 3. Recent table columns: Session / Scene / Started / Status / Turns /
>    p50 audio / Degraded `n (nr)` / Spec hits / Arc — reuse the rollup page's
>    batch aggregation (no N+1).
> 4. Client refresh every 5s while any session is active (visibility-gated);
>    sidebar Sessions nav item gets the live-count badge.
>
> Acceptance: a crashed session (active status, old events) appears under
> Recent; badge and cards update without reload; page renders fine with zero
> active sessions.
>
> **On completion:** reply with a completion report *formatted as a prompt for
> the manager agent* — self-contained (the manager has not seen your session):
> item id (B3) + branch/PR link; what changed and why, by file; design fidelity
> vs the artboard(s) above with any deviations and reasons; verification
> evidence (commands + results, screenshots vs artboard); risks & follow-ups;
> and the 1–2 things the manager should review first.

---

## B4 — Scene canvas On Air overlay

> **Prompt:**
> Add the live "On Air" state to the scene editor per **Page — Scene canvas ·
> on air** (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1T0-0`).
>
> Existing code: `apps/admin/src/components/scene-editor.tsx`, canvas in
> `scene-stage/` (top-down stage, character/sound nodes), A2's feed.
>
> Scope:
> 1. Header: `● ON AIR · n session(s) · user · elapsed` cluster + `Watch in
>    workbench →`; with >1 active session, a picker chooses which to monitor.
>    Poll a lightweight scene-scoped active-sessions check (reuse B3's rule).
> 2. Canvas overlay (read-only, presentation only): speaking character gets
>    concentric accent rings + `SPEAKING · TURN N` chip (from newest streaming/
>    completed turn); idle characters dim with `last spoke turn N`; characters
>    absent from `presentCharacterSlugs` grey out; visitor renders as the
>    dashed diamond; ambience chip (current bed + playing) and sound nodes show
>    last sfx age (from decision journal payloads); caption strip: `NOW` +
>    current beat prose, arc progress, last-event age.
> 3. The save chip reads "saved · edits apply to future sessions, not the one
>    on air" whenever On Air — authoring stays fully enabled.
>
> Acceptance: overlay appears/disappears with session activity without
> disturbing editor interactions; no live chrome when nothing is active; all
> data from the A2 feed + journal payloads (no new capture).
>
> **On completion:** reply with a completion report *formatted as a prompt for
> the manager agent* — self-contained (the manager has not seen your session):
> item id (B4) + branch/PR link; what changed and why, by file; design fidelity
> vs the artboard(s) above with any deviations and reasons; verification
> evidence (commands + results, screenshots vs artboard); risks & follow-ups;
> and the 1–2 things the manager should review first.

---

## C1 — Consumer scene lander

> **Prompt:**
> Build the public scene lander in `apps/web` per **Web — Scene lander**
> (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1WG-0`). Consumer register: Deep ground, mint accent, Space
> Grotesk display / Inter body — tokens from A1, no mono on this surface.
>
> Scope:
> 1. Route `apps/web/src/app/scenes/[sceneId]/page.tsx`: resolve the scene
>    (published/live status only → else 404), render kicker, title,
>    description-as-invitation, meta row (live voices · N characters & a
>    narrator · 10–20 min · headphones recommended).
> 2. Cast cards from the roster (name + one-liner from blurb) plus the dashed
>    Narrator card when `narrator !== "off"`.
> 3. `Enter the scene` primary CTA (accent-strong, `--radius-button`, glow)
>    → creates a scene session (mode voice) and routes to the player (C2);
>    mic disclosure line sits beside it. `How it works` opens a simple
>    explainer (modal or section — your call, keep it one screen).
> 4. Resume chip bottom-right when the signed-in user has a prior session for
>    this scene: date + a story-terms summary (last beat label is fine for v1),
>    `Visit again →` re-enters (new session).
> 5. The ember/halo visual is the idle state of the player's voice field —
>    static SVG/CSS is fine for v1.
>
> Acceptance: unauthenticated flow decided with product (viewing allowed,
> entering requires auth); page is fully tokenized; Lighthouse-reasonable.
>
> **On completion:** reply with a completion report *formatted as a prompt for
> the manager agent* — self-contained (the manager has not seen your session):
> item id (C1) + branch/PR link; what changed and why, by file; design fidelity
> vs the artboard(s) above with any deviations and reasons; verification
> evidence (commands + results, screenshots vs artboard); risks & follow-ups;
> and the 1–2 things the manager should review first.

---

## C2 — Active scene player: waveform view

> **Prompt:**
> Build the consumer voice player per **Web — Active scene** (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1Y8-0`).
> This is the LiveKit browser client — the heaviest item in the plan.
>
> Existing runtime: the voice agent serves rooms named
> `scene-<sceneId>-<sessionId>` (`services/voice-agent/src/agent.ts`); the
> browser needs a token-mint endpoint (LiveKit access token for that room,
> using `LIVEKIT_API_KEY/SECRET`) and a client that publishes the mic and
> subscribes to the agent's audio + transcript/data messages. Check
> `packages/scene-player` and the admin sandbox for reusable transcript
> plumbing before writing new code.
>
> Scope:
> 1. `POST /api/scenes/:id/enter` in apps/web: create session (or accept C1's),
>    mint LiveKit token, return `{ sessionId, roomToken, url }`.
> 2. Player route: join room, publish mic (permission flow with the disclosure
>    from C1), play agent audio; render the mint voice halo (animate intensity
>    from audio levels), speaker name + waveform ticks, current caption line
>    with previous line ghosted above, `NARRATOR` italic treatment for
>    narration (including the opening), ambience whisper (scene sound design),
>    captions toggle, `Listening — speak whenever you like` pill, elapsed time,
>    `Leave quietly` (ends session, routes to lander).
> 3. Speaker/caption data: consume what the agent already publishes (transcript
>    data channel / turn records); coordinate if a message type is missing —
>    do not scrape audio.
> 4. Scene-ended state: when the room closes or the director ends the scene,
>    settle into a quiet end card (v1: closing line + `Visit again`).
>
> Acceptance: full voice round-trip against a dev voice-agent worker; barge-in
> works (speak over a character); refresh mid-session rejoins the same room;
> mic permission denial produces a graceful, in-fiction error state.
>
> **On completion:** reply with a completion report *formatted as a prompt for
> the manager agent* — self-contained (the manager has not seen your session):
> item id (C2) + branch/PR link; what changed and why, by file; design fidelity
> vs the artboard(s) above with any deviations and reasons; verification
> evidence (commands + results, screenshots vs artboard); risks & follow-ups;
> and the 1–2 things the manager should review first.

---

## C3 — Story view + view toggle

> **Prompt:**
> Add the Story view and the Waveform⇄Story toggle per **Web — Active scene ·
> story view** (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/2R2-0`) and the toggle on (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/1Y8-0`).
>
> Scope:
> 1. Segmented pill top-center (accent-fill active state); view state is
>    client-only; audio never interrupts on switch.
> 2. Story view: 640px measure on Deep; chapter opener (`YOUR VISIT · <time>`
>    eyebrow + short accent rule); narration and stage directions as italic
>    prose paragraphs; dialogue with hanging margin voice labels (mono xs
>    uppercase — `YOU`/character names; active speaker's label in accent);
>    the streaming line renders with the live cursor `▍`; below it the
>    "X is speaking — the story writes itself as you listen" line.
> 3. Bottom-weighted composition: newest text in the reading zone, earlier
>    content scrolls above (`↑ earlier in the story` hint); auto-scroll follows
>    the live edge unless the reader scrolls up (then a jump-to-now affordance).
> 4. `saved to My visits when the scene ends` note — and reuse this exact view
>    as the session's post-scene readable artifact (route it from the lander's
>    resume chip when the session has ended).
>
> Acceptance: switching views mid-utterance keeps captions/prose in sync from
> the same transcript stream; prose typography matches the artboard (17px/30px
> Inter, italic narration); the ended-session story page renders from persisted
> turn records alone.
>
> **On completion:** reply with a completion report *formatted as a prompt for
> the manager agent* — self-contained (the manager has not seen your session):
> item id (C3) + branch/PR link; what changed and why, by file; design fidelity
> vs the artboard(s) above with any deviations and reasons; verification
> evidence (commands + results, screenshots vs artboard); risks & follow-ups;
> and the 1–2 things the manager should review first.

---

## C4 — Admin session view + gated journal proxy

> **Prompt:**
> Add the staff-only third view per **Web — Active scene · session view
> (admin)** (`https://app.paper.design/file/01KZ6FJRBA133B1YJZPASZW2P4/1-0/2ST-0`).
>
> Scope:
> 1. Gating, twice: the `Session` tab (with ADMIN badge) renders only for
>    staff (server-checked role claim, not client-only); AND add a role-checked
>    proxy in apps/web for the journal/live feed (`scene_session_events` is
>    currently only reachable behind the admin app's auth wall — do not open
>    it publicly). Read-only by construction: the view writes nothing.
> 2. Health line: live dot + event age, turn, decisions, spec hit, degraded
>    `n (nr)`, p50 first-audio, reflections, arc — plus `Open full workbench →`
>    deep link to the admin app.
> 3. Left panel: the live journal rail (reuse/port the admin
>    `session-journal.tsx` row components — consider moving them to a shared
>    package rather than duplicating) in following mode.
> 4. Right panel — Narrator state from the latest snapshot + reflection
>    payloads: beat now, arc bars, present list, chronicle threads, prepared
>    intent, timed event **with live countdown** (`due Ns` chip, amber),
>    director's note.
> 5. Footnote: `admin only · read-only · the visitor never sees this view`;
>    mic pill: `Listening — the scene continues while you debug`.
>
> Acceptance: non-staff users never receive the tab nor any journal data
> (verify at the network layer); the countdown matches the runtime's timed
> schedule within polling error; scene audio continues uninterrupted while the
> view is open.
>
> **On completion:** reply with a completion report *formatted as a prompt for
> the manager agent* — self-contained (the manager has not seen your session):
> item id (C4) + branch/PR link; what changed and why, by file; design fidelity
> vs the artboard(s) above with any deviations and reasons; verification
> evidence (commands + results, screenshots vs artboard); risks & follow-ups;
> and the 1–2 things the manager should review first.

---

## Review checklist (apply to every handoff)

- Tokens only — no raw hex from the Ocean palette in component code (A1 is the
  gate for all later PRs).
- Both transports — anything reading the journal must work for LiveKit voice
  sessions AND browser sandbox sessions.
- Pre-journal sessions and empty states render honestly ("—", explicit empty
  hints) — never fake data.
- Live surfaces: polling is visibility-gated, stops on end/unmount, and event
  age is real.
- Screenshots against the referenced artboard in the PR description.
- A completion report was returned in manager-prompt format (every prompt ends
  with the required structure) — reject handoffs that reply with prose only.
