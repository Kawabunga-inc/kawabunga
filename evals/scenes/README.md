# Scene decision probes

Deterministic checks on the multi-character **director** (the fast per-turn
orchestrator). This is the first automated coverage of real multi-character
speaker selection — the Sonar scene suites run against single-character
sandboxes, whose solo fastpath skips speaker selection entirely.

Each probe in [suite.ts](suite.ts) freezes one decision point: a
self-contained scene fixture (no DB, no character brains), a scene state, a
transcript, and the user's latest message. The runner
([scripts/scene-probes.ts](../../scripts/scene-probes.ts)) replays that
decision K times against the real executor (Cerebras/Groq) and scores with
machine-checkable expectations — the chosen speaker is a slug, so addressee
continuity, by-name addressing, move diversity, and roster validity all
grade without an LLM judge.

The director is stochastic: a probe passes when its observed rate clears its
threshold (default 0.8; soft judgment calls 0.6). Validity (schema shape,
speaker-in-roster) is scored on every run regardless of the probe's own
expectations.

## Running

```bash
npm run scene-probes                    # full suite, 5 runs per probe
npm run scene-probes -- --runs 10
npm run scene-probes -- --probe continuity
npm run scene-probes -- --family by-name
npm run scene-probes -- --list
```

Requires `CEREBRAS_API_KEY` or `GROQ_API_KEY` (the same env the live
director uses; `ORCHESTRATOR_*` overrides are honored). On Groq's free tier
lower `--concurrency` to avoid TPM limits. Exits 1 when any probe fails, so
the suite is CI-able.

## Ledger

Every run appends one line per probe to `ledger.jsonl`:

```
{ at, gitSha, provider, model, probeId, family, runs, passes, rate,
  threshold, passed, samples: [{ action, speaker, beat, degraded, ok, failures }] }
```

`samples` keeps the raw decisions so a regression can be diagnosed from the
ledger alone (which speaker was picked, what beat was issued). Compare rates
across `gitSha`/`model` to A/B director prompt changes — e.g. before/after
adding speaker attribution to character history.

## Families

| Family | What it checks |
|---|---|
| `by-name` | A character addressed by name answers — nobody answers for them |
| `addressee-continuity` | Unaddressed follow-ups go to the character the user is already talking with |
| `step-in` | A mentioned-but-silent character steps in |
| `hold` | Silence ticks don't fill every pause; no monologuing past the user |
| `end` | A clear farewell ends the scene rather than chasing the user |
| `move-diversity` | The next `beat` breaks a run of question-ending directions |
| `arc-steering` | Directions move toward the `[next]` un-landed arc beat |
| `speaker-validity` | Off-roster names never become hallucinated speaker slugs |

Fixtures live in the suite, not the live scenes table — editing a fixture
changes what every future run measures, so treat fixture edits like prompt
changes (deliberate, reviewed).
