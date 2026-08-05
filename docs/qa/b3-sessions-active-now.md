# B3 · Sessions Active now QA

## Browser evidence

- `b3-active-and-recent.jpg` — a sandbox-started voice session appears in Active now with a `livekit` transport label, ticking elapsed/last-event values, aligned stats, `Watch live →`, the Recent table, and a Sessions sidebar badge of `1`.
- `b3-ended-auto-demotion.jpg` — after ending that fixture, the page's own five-second refresh removes Active now and places the session first in Recent with status `ended`; the badge also disappears.
- `b3-zero-active-stale-recent.jpg` — zero-active state with the Active section fully collapsed and persisted crashed-style sessions rendered in Recent as muted `stale` rows.
- `b3-rollup-before-dev.jpg` / `b3-rollup-after-b3.jpg` — scene rollup before and after extracting shared aggregation. Both files are byte-identical at 1280 × 720 and share SHA-256 `caea78948ec7bfcdfa2b059803afab8f0f8c3dd58a3c48276bc1319682803418`.

## Interaction sequence

1. Opened the Abraham's tent scene sandbox and selected **Enter scene**.
2. Confirmed one Active now card and sidebar badge; card text advanced from `0m 12s elapsed / 12s ago` to `0m 14s elapsed / 14s ago` without a server refresh.
3. Ended the evidence session while `/sessions` remained open.
4. Waited for the page's five-second refresh; Active now became empty and the first Recent row became the evidence session with status `ended`.
5. Confirmed an older persisted `active` session with old timestamps appeared under Recent as `stale` (kill-test behavior).

## Automated verification

- `npm run lint && npm run test && npm run build`
  - lint: passed (three pre-existing web debug-page warnings, zero errors)
  - tests: 334 passed, 7 skipped
  - build: passed for all workspaces
- Added-line raw-hex sweep: empty.
- `git diff --check`: clean.
