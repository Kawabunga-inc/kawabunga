/**
 * Scene decision-probe runner — replays frozen multi-character decision
 * points against the REAL director executor (Cerebras/Groq) and scores the
 * decisions deterministically. See evals/scenes/suite.ts for the probes.
 *
 * The director is stochastic, so each probe runs K times and passes when
 * its observed rate clears the probe's threshold. Only the director is
 * under test: no DB, no character brains, no TTS — the whole suite is a
 * few dozen fast structured-output calls.
 *
 * Usage (repo root):
 *   npm run scene-probes                     # full suite, 5 runs per probe
 *   npm run scene-probes -- --runs 10
 *   npm run scene-probes -- --probe continuity --runs 8
 *   npm run scene-probes -- --family by-name
 *   npm run scene-probes -- --list
 *
 * Flags:
 *   --runs <n>          decisions sampled per probe (default 5)
 *   --probe <substr>    only probes whose id contains <substr>
 *   --family <name>     only probes of one family
 *   --concurrency <n>   parallel executor calls (default 4 — mind Groq TPM)
 *   --provider <name>   force cerebras|groq (default: ORCHESTRATOR_PROVIDER / key detection)
 *   --model <id>        force the director model on the chosen provider
 *   --no-ledger         don't append to evals/scenes/ledger.jsonl
 *   --list              print the probe roster and exit
 *
 * Env: CEREBRAS_API_KEY or GROQ_API_KEY (plus ORCHESTRATOR_* overrides).
 * Exits 1 when any probe fails its threshold.
 */
import * as dotenv from "dotenv";
dotenv.config({ override: true });

import { execSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildSceneDecisionRequest,
  createInitialSceneState,
  resolveOrchestratorExecutor,
  resolveSceneDecision,
  updateSceneMemory,
} from "@kawabunga/orchestration";
import type { OrchestratorDecision, SceneState } from "@kawabunga/types";
import { SCENE_PROBES, type SceneProbe } from "../evals/scenes/suite";

/* ── Flags ────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const RUNS = Math.max(1, Number(flag("--runs") ?? 5));
const CONCURRENCY = Math.max(1, Number(flag("--concurrency") ?? 4));
const PROVIDER = flag("--provider");
const MODEL = flag("--model");
const PROBE_FILTER = flag("--probe");
const FAMILY_FILTER = flag("--family");
const WRITE_LEDGER = !args.includes("--no-ledger");
const LIST_ONLY = args.includes("--list");
const DEFAULT_THRESHOLD = 0.8;

const LEDGER_PATH = join(process.cwd(), "evals", "scenes", "ledger.jsonl");

/* ── Scoring ──────────────────────────────────────────────────── */

type Sample = {
  action: OrchestratorDecision["action"];
  speaker: string | null;
  beat: string | null;
  degraded: boolean;
  reason?: string;
  ok: boolean;
  failures: string[];
  /** Wall time of the executor call — the director blocks the turn loop, so
   *  a model that decides well but slowly is still the wrong director. */
  latencyMs?: number;
};

function scoreDecision(probe: SceneProbe, sceneState: SceneState, raw: unknown): Sample {
  const resolution = resolveSceneDecision({ scene: probe.scene, sceneState }, raw);
  const failures: string[] = [];
  // Validity is always scored: a degraded resolution means the model broke
  // the contract (bad shape, hallucinated speaker, empty narration).
  if (resolution.degraded) failures.push(`invalid:${resolution.reason ?? "unknown"}`);

  const decision = resolution.decision;
  const rawDecision = resolution.degraded ? (raw as OrchestratorDecision) : decision;
  const action = resolution.degraded ? (rawDecision?.action ?? decision.action) : decision.action;
  const speaker = resolution.speakerSlug;
  const beat = decision.action === "speak" ? (decision.beat?.trim() ?? null) : null;
  const expect = probe.expect;

  if (expect.action && !expect.action.includes(action)) {
    failures.push(`action:${action}`);
  }
  if (action === "speak" && !resolution.degraded) {
    if (expect.speaker && (!speaker || !expect.speaker.includes(speaker))) {
      failures.push(`speaker:${speaker ?? "none"}`);
    }
    if (expect.notSpeaker && speaker && expect.notSpeaker.includes(speaker)) {
      failures.push(`forbidden-speaker:${speaker}`);
    }
    if (expect.beatNotEndingInQuestion && beat && /[?？]["'”]?\s*$/.test(beat)) {
      failures.push("beat-ends-in-question");
    }
    if (
      expect.beatMentionsAny &&
      !(beat && expect.beatMentionsAny.some((m) => beat.toLowerCase().includes(m.toLowerCase())))
    ) {
      failures.push("beat-off-target");
    }
  }

  return {
    action,
    speaker,
    beat,
    degraded: resolution.degraded,
    ...(resolution.reason ? { reason: resolution.reason } : {}),
    ok: failures.length === 0,
    failures,
  };
}

/* ── Runner ───────────────────────────────────────────────────── */

/** Execute with retry on transient provider failures: rate limits (429,
 *  honoring the provider's suggested wait) and empty completions (observed
 *  on gpt-oss-120b for violence-adjacent content — the output burns in the
 *  reasoning/safety channel; a fresh sample usually completes). Probes
 *  measure the DIRECTOR's decisions, not provider flakiness. */
async function executeWithRetry(
  execute: () => Promise<unknown>,
  maxAttempts = 4,
): Promise<unknown> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await execute();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const rateLimited = /\b429\b|rate limit|empty completion/i.test(message);
      if (!rateLimited || attempt >= maxAttempts) throw err;
      const suggested = message.match(/try again in (\d+(?:\.\d+)?)s/i);
      const waitMs = Math.min(
        30_000,
        suggested ? Math.ceil(Number(suggested[1]) * 1000) + 500 : 5_000 * attempt,
      );
      console.log(`  (rate limited — retrying in ${(waitMs / 1000).toFixed(1)}s)`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  let probes = SCENE_PROBES;
  if (PROBE_FILTER) probes = probes.filter((p) => p.id.includes(PROBE_FILTER));
  if (FAMILY_FILTER) probes = probes.filter((p) => p.family === FAMILY_FILTER);
  if (probes.length === 0) {
    console.error("No probes match the filter.");
    process.exit(1);
  }

  if (LIST_ONLY) {
    for (const p of probes) {
      console.log(`${p.id.padEnd(28)} [${p.family}] ${p.description}`);
    }
    return;
  }

  const { executor, reason } = resolveOrchestratorExecutor({
    ...(PROVIDER ? { provider: PROVIDER } : {}),
    ...(MODEL ? { cerebrasModel: MODEL, groqModel: MODEL } : {}),
  });
  if (!executor) {
    console.error(`No director executor available: ${reason}`);
    process.exit(1);
  }
  let gitSha: string | null = null;
  try {
    gitSha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    /* not a git checkout */
  }

  console.log(
    `scene-probes: ${probes.length} probe(s) × ${RUNS} run(s) — director ${executor.provider}/${executor.model}${gitSha ? ` @ ${gitSha}` : ""}\n`,
  );

  // Flatten to (probe, runIndex) jobs so concurrency spans probes.
  const jobs = probes.flatMap((probe) => Array.from({ length: RUNS }, () => probe));
  const startedAt = Date.now();
  const flat = await mapWithConcurrency(jobs, CONCURRENCY, async (probe) => {
    const sceneState: SceneState = {
      ...createInitialSceneState(probe.scene),
      turnIndex: probe.recentTurns.length,
      ...probe.state,
    };
    // Production-faithful context: the driver folds its rolling transcript
    // into scene memory every turn — replay that fold so long-transcript
    // probes measure exactly what a live scene's director would see.
    const sceneMemory = updateSceneMemory({
      previousMemory: [],
      recentTurns: probe.recentTurns,
    });
    const request = buildSceneDecisionRequest({
      scene: probe.scene,
      sceneState,
      recentTurns: probe.recentTurns,
      sceneMemory,
      sceneFacts: probe.facts,
      lastUserMessage: probe.lastUserMessage,
    });
    try {
      const startedAt = Date.now();
      const raw = await executeWithRetry(() => executor.execute(request));
      const latencyMs = Date.now() - startedAt;
      return { probe, sample: { ...scoreDecision(probe, sceneState, raw), latencyMs } };
    } catch (err) {
      const sample: Sample = {
        action: "wait-for-user",
        speaker: null,
        beat: null,
        degraded: true,
        reason: `executor-error: ${err instanceof Error ? err.message : String(err)}`,
        ok: false,
        failures: ["executor-error"],
      };
      return { probe, sample };
    }
  });

  // Group back per probe, in suite order.
  const byProbe = new Map<string, Sample[]>();
  for (const { probe, sample } of flat) {
    const list = byProbe.get(probe.id) ?? [];
    list.push(sample);
    byProbe.set(probe.id, list);
  }

  const at = new Date().toISOString();
  let failedProbes = 0;
  const familyTotals = new Map<string, { passes: number; runs: number }>();

  for (const probe of probes) {
    const samples = byProbe.get(probe.id)!;
    const passes = samples.filter((s) => s.ok).length;
    const rate = passes / samples.length;
    const threshold = probe.threshold ?? DEFAULT_THRESHOLD;
    const passed = rate >= threshold;
    if (!passed) failedProbes += 1;

    const fam = familyTotals.get(probe.family) ?? { passes: 0, runs: 0 };
    fam.passes += passes;
    fam.runs += samples.length;
    familyTotals.set(probe.family, fam);

    const failureCounts = new Map<string, number>();
    for (const s of samples) {
      for (const f of s.failures) failureCounts.set(f, (failureCounts.get(f) ?? 0) + 1);
    }
    const failureSummary = [...failureCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `${f}×${n}`)
      .join(", ");

    console.log(
      `${passed ? "PASS" : "FAIL"}  ${probe.id.padEnd(28)} ${passes}/${samples.length}` +
        ` (need ≥${Math.ceil(threshold * samples.length)})${failureSummary ? `  — ${failureSummary}` : ""}`,
    );

    if (WRITE_LEDGER) {
      mkdirSync(dirname(LEDGER_PATH), { recursive: true });
      appendFileSync(
        LEDGER_PATH,
        `${JSON.stringify({
          at,
          gitSha,
          provider: executor.provider,
          model: executor.model,
          probeId: probe.id,
          family: probe.family,
          runs: samples.length,
          passes,
          rate: Number(rate.toFixed(3)),
          threshold,
          passed,
          samples,
        })}\n`,
      );
    }
  }

  console.log("\nBy family:");
  for (const [family, { passes, runs }] of familyTotals) {
    console.log(`  ${family.padEnd(22)} ${passes}/${runs} (${Math.round((passes / runs) * 100)}%)`);
  }
  const latencies = flat
    .map(({ sample }) => sample.latencyMs)
    .filter((ms): ms is number => typeof ms === "number")
    .sort((a, b) => a - b);
  if (latencies.length > 0) {
    const mean = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const p50 = latencies[Math.floor(latencies.length * 0.5)]!;
    const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]!;
    console.log(`\nDirector latency: mean ${mean}ms · p50 ${p50}ms · p95 ${p95}ms`);
  }
  console.log(
    `\n${probes.length - failedProbes}/${probes.length} probes passed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s` +
      (WRITE_LEDGER ? ` — ledger: ${LEDGER_PATH}` : ""),
  );
  if (failedProbes > 0) process.exit(1);
}

void main();
