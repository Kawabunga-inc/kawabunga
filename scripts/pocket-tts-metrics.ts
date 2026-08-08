/**
 * Measure Pocket TTS latency and normalize its allocated infrastructure spend
 * into the USD-per-million-character rate consumed by the session ledger.
 *
 *   npm run pocket:metrics
 *   npm run pocket:metrics -- --runs 12 --concurrency 2
 *   npm run pocket:metrics -- --target-characters 10000 --concurrency 1
 *   npm run pocket:metrics -- --monthly-cost-usd 24.50
 */
import * as dotenv from "dotenv";
dotenv.config({ override: true });

import { getDb } from "@kawabunga/db";
import {
  getPocketTtsAuthHeaders,
  pocketTtsEffectiveUsdPerMillionCharacters,
  summarizePocketTtsLatency,
} from "@kawabunga/engine";
import { sql } from "drizzle-orm";

const DEFAULT_BASE_URL =
  "https://pocket-tts-production-production.up.railway.app";
const SAMPLE_TEXTS = [
  "Ready.",
  "The road ahead is quiet, but every step still matters.",
  "We have waited through the long night, and now the first light is beginning to reach the hills.",
] as const;

type Options = {
  baseUrl: string;
  voice: string;
  days: number;
  runs: number;
  warmups: number;
  concurrency: number;
  targetCharacters: number | null;
  monthlyCostUsd: number | null;
  monthlyCharacters: number | null;
  benchmark: boolean;
};

type BenchmarkSample = {
  run: number;
  characters: number;
  clientFirstAudioMs: number;
  gatewayFirstAudioMs: number | null;
  totalMs: number;
};

type UsageRollup = {
  operations: number;
  characters: number;
  audioDurationMs: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  turnFirstAudioMs: number[];
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const usage = await loadUsageRollup(options.days);

  console.log(`\nPocket TTS metrics (${options.days}-day window)\n`);
  if (usage) {
    console.log(`  ledger operations     ${usage.operations}`);
    console.log(`  successful characters ${formatNumber(usage.characters)}`);
    console.log(`  generated audio       ${formatDuration(usage.audioDurationMs)}`);
    console.log(`  ledger window         ${usage.firstEventAt ?? "—"} → ${usage.lastEventAt ?? "—"}`);
    printLatency("turn → audio", summarizePocketTtsLatency(usage.turnFirstAudioMs));
    console.log("                         context only; includes LLM time");
  } else {
    console.log("  ledger                unavailable (DATABASE_URL is not configured)");
  }

  let benchmarkSamples: BenchmarkSample[] = [];
  if (options.benchmark && options.runs > 0) {
    const benchmarkTexts = buildBenchmarkTexts(options);
    console.log(
      `\nLive benchmark · ${options.voice} · ${benchmarkTexts.length} runs · concurrency ${options.concurrency}`,
    );
    for (let index = 0; index < options.warmups; index += 1) {
      await benchmarkOnce(options, -(index + 1), SAMPLE_TEXTS[index % SAMPLE_TEXTS.length]!);
    }
    benchmarkSamples = await runBenchmark(options, benchmarkTexts);
    for (const sample of benchmarkSamples.sort((a, b) => a.run - b.run)) {
      console.log(
        `  #${String(sample.run + 1).padStart(2, "0")}  ${String(sample.characters).padStart(3)} chars` +
          `  client ${String(sample.clientFirstAudioMs).padStart(4)}ms` +
          `  gateway ${String(sample.gatewayFirstAudioMs ?? "—").padStart(4)}ms` +
          `  total ${String(sample.totalMs).padStart(5)}ms`,
      );
    }
    printLatency(
      "live client TTFA",
      summarizePocketTtsLatency(benchmarkSamples.map((sample) => sample.clientFirstAudioMs)),
    );
    console.log(
      `  benchmark characters ${formatNumber(
        benchmarkSamples.reduce((total, sample) => total + sample.characters, 0),
      )}`,
    );
    printLatency(
      "live gateway TTFA",
      summarizePocketTtsLatency(
        benchmarkSamples.flatMap((sample) =>
          sample.gatewayFirstAudioMs == null ? [] : [sample.gatewayFirstAudioMs],
        ),
      ),
    );
  }

  const monthlyCharacters = options.monthlyCharacters ?? usage?.characters ?? 0;
  console.log("\nEffective cost\n");
  if (options.monthlyCostUsd == null) {
    console.log("  Railway allocation    missing");
    console.log("  supply                --monthly-cost-usd <dedicated Pocket service spend>");
  } else if (monthlyCharacters <= 0) {
    console.log("  usage                 missing");
    console.log("  supply                --monthly-characters <expected monthly Pocket characters>");
  } else {
    const rate = pocketTtsEffectiveUsdPerMillionCharacters({
      allocatedCostUsd: options.monthlyCostUsd,
      characters: monthlyCharacters,
    });
    console.log(`  allocated spend       $${options.monthlyCostUsd.toFixed(2)}`);
    console.log(`  normalized usage      ${formatNumber(monthlyCharacters)} characters`);
    console.log(`  effective rate        $${rate?.toFixed(4)}/M characters`);
    console.log(`  ledger env            SESSION_COST_POCKET_TTS_USD_PER_MILLION_CHARACTERS=${rate}`);
  }

  const live = summarizePocketTtsLatency(
    benchmarkSamples.map((sample) => sample.clientFirstAudioMs),
  );
  const typical = live.p50Ms;
  const p95 = live.p95Ms;
  if (typical != null) console.log(`  card speed env        POCKET_TTS_TYPICAL_FIRST_AUDIO_MS=${typical}`);
  if (p95 != null) console.log(`  diagnostic p95        POCKET_TTS_FIRST_AUDIO_P95_MS=${p95}`);
  console.log();
}

async function loadUsageRollup(days: number): Promise<UsageRollup | null> {
  const db = getDb();
  if (!db) return null;
  const usageResult = await db.execute(sql`
    select count(*)::int as operations,
           coalesce(sum((payload->'usage'->>'characters')::numeric), 0) as characters,
           coalesce(sum((payload->'usage'->>'audioDurationMs')::numeric), 0) as audio_duration_ms,
           min(created_at)::text as first_event_at,
           max(created_at)::text as last_event_at
      from scene_session_events
     where type = 'session.cost.recorded'
       and payload->>'category' = 'tts'
       and payload->>'provider' = 'pocket_tts'
       and payload->>'status' = 'succeeded'
       and created_at > now() - (${days} || ' days')::interval
  `);
  const latencyResult = await db.execute(sql`
    with pocket_turns as (
      select distinct turn_id
        from scene_session_events
       where type = 'session.cost.recorded'
         and payload->>'category' = 'tts'
         and payload->>'provider' = 'pocket_tts'
         and payload->>'status' = 'succeeded'
         and turn_id is not null
         and created_at > now() - (${days} || ' days')::interval
    )
    select coalesce(
             nullif(t.latency_summary->>'firstAudioMs', '')::numeric,
             nullif(t.audio_metrics->>'firstAudioMs', '')::numeric
           ) as first_audio_ms
      from scene_session_turns t
      join pocket_turns p on p.turn_id = t.id
  `);
  const usageRow = rowsOf(usageResult)[0] ?? {};
  return {
    operations: numeric(usageRow.operations),
    characters: numeric(usageRow.characters),
    audioDurationMs: numeric(usageRow.audio_duration_ms),
    firstEventAt: text(usageRow.first_event_at),
    lastEventAt: text(usageRow.last_event_at),
    turnFirstAudioMs: rowsOf(latencyResult)
      .map((row) => numeric(row.first_audio_ms, Number.NaN))
      .filter(Number.isFinite),
  };
}

async function runBenchmark(
  options: Options,
  texts: string[],
): Promise<BenchmarkSample[]> {
  let next = 0;
  const samples: BenchmarkSample[] = [];
  await Promise.all(
    Array.from({ length: options.concurrency }, async () => {
      while (true) {
        const run = next;
        next += 1;
        if (run >= texts.length) return;
        samples.push(await benchmarkOnce(options, run, texts[run]!));
      }
    }),
  );
  return samples;
}

function buildBenchmarkTexts(options: Options): string[] {
  if (options.targetCharacters == null) {
    return Array.from(
      { length: options.runs },
      (_, index) => SAMPLE_TEXTS[index % SAMPLE_TEXTS.length]!,
    );
  }

  const texts: string[] = [];
  let remaining = options.targetCharacters;
  let index = 0;
  while (remaining > 0) {
    const sample = SAMPLE_TEXTS[index % SAMPLE_TEXTS.length]!;
    const text = sample.slice(0, remaining);
    texts.push(text || "A");
    remaining -= text.length || 1;
    index += 1;
  }
  return texts;
}

async function benchmarkOnce(options: Options, run: number, textValue: string): Promise<BenchmarkSample> {
  const started = performance.now();
  const response = await fetch(`${options.baseUrl}/speak`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...getPocketTtsAuthHeaders(),
    },
    body: JSON.stringify({ text: textValue, voice: options.voice }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Pocket /speak failed (${response.status}): ${(await response.text()).slice(0, 240)}`);
  }

  let buffer = "";
  let clientFirstAudioMs: number | null = null;
  let gatewayFirstAudioMs: number | null = null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let frameEnd = buffer.indexOf("\n\n");
    while (frameEnd >= 0) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      const event = frame.match(/^event:\s*(.+)$/m)?.[1]?.trim();
      const data = frame.match(/^data:\s*(.+)$/m)?.[1];
      if (event === "audio" && clientFirstAudioMs == null) {
        clientFirstAudioMs = Math.round(performance.now() - started);
      }
      if (event === "done" && data) {
        const payload = JSON.parse(data) as { firstAudioMs?: number };
        gatewayFirstAudioMs = finiteOrNull(payload.firstAudioMs);
      }
      if (event === "error" && data) {
        const payload = JSON.parse(data) as { message?: string };
        throw new Error(payload.message ?? "Pocket emitted an error event");
      }
      frameEnd = buffer.indexOf("\n\n");
    }
  }
  if (clientFirstAudioMs == null) throw new Error("Pocket returned no audio chunks");
  return {
    run,
    characters: textValue.length,
    clientFirstAudioMs,
    gatewayFirstAudioMs,
    totalMs: Math.round(performance.now() - started),
  };
}

function parseOptions(args: string[]): Options {
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    baseUrl: (
      value("--base-url") ??
      process.env.POCKET_TTS_BASE_URL ??
      process.env.KYUTAI_TTS_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/$/, ""),
    voice: value("--voice") ?? "abraham",
    days: positiveInteger(value("--days"), 30),
    runs: positiveInteger(value("--runs"), 10),
    warmups: nonNegativeInteger(value("--warmups"), 1),
    concurrency: positiveInteger(value("--concurrency"), 1),
    targetCharacters: optionalPositiveInteger(value("--target-characters")),
    monthlyCostUsd: optionalNumber(
      value("--monthly-cost-usd") ?? process.env.POCKET_TTS_MONTHLY_INFRASTRUCTURE_COST_USD,
    ),
    monthlyCharacters: optionalNumber(value("--monthly-characters")),
    benchmark: !args.includes("--no-benchmark"),
  };
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  }
  return [];
}

function numeric(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function finiteOrNull(value: unknown): number | null {
  const parsed = numeric(value, Number.NaN);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function optionalNumber(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalPositiveInteger(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function printLatency(label: string, summary: ReturnType<typeof summarizePocketTtsLatency>) {
  if (summary.samples === 0) {
    console.log(`  ${label.padEnd(21)} —`);
    return;
  }
  console.log(
    `  ${label.padEnd(21)} p50 ${summary.p50Ms}ms · p95 ${summary.p95Ms}ms` +
      ` · range ${summary.minMs}–${summary.maxMs}ms · n=${summary.samples}`,
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  return `${(ms / 60_000).toFixed(2)} min`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
