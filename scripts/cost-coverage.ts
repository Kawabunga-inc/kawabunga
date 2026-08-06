/**
 * Pricing coverage report — which of the things this stack actually bills for
 * have a rate, and which land in the ledger as unpriced.
 *
 *   npm run cost:coverage            # what we route to today + what it costs
 *   npm run cost:coverage -- --days 14
 *
 * The ledger deliberately records unpriced work rather than dropping it (an
 * op with `amountUsd: null` is visible, just uncosted). That is the right
 * default, but it means a gap only surfaces by finding a null after a session.
 * This probes every provider the system can currently route to — using the
 * REAL entry builders, so the report can never drift from the pricing code —
 * and cross-checks it against what recent sessions actually spent.
 */
import * as dotenv from "dotenv";
dotenv.config({ override: true });

import { getVoiceStore, getDb } from "@kawabunga/db";
import { MODEL_REGISTRY } from "@kawabunga/engine";
import {
  buildEmbeddingSessionCostEntry,
  buildInfrastructureSessionCostEntry,
  buildLlmSessionCostEntry,
  buildSttSessionCostEntry,
  buildTtsSessionCostEntry,
} from "@kawabunga/voice-pipeline";
import { sql } from "drizzle-orm";

const args = process.argv.slice(2);
const days = Number(args[args.indexOf("--days") + 1]) || 7;

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

type Probe = {
  what: string;
  /** The env var that would supply a missing rate. */
  envVar?: string;
  priced: boolean;
  detail: string;
};

/** Probe a builder with 1 unit of usage: priced iff amountUsd comes back non-null. */
function probe(what: string, entry: { amountUsd: number | null; pricing: { rateUsd: number; unit: string; source: string }[] }, envVar?: string): Probe {
  const rate = entry.pricing[0];
  return {
    what,
    envVar,
    priced: entry.amountUsd !== null,
    detail: rate
      ? `$${rate.rateUsd} / ${rate.unit}  ${dim(rate.source)}`
      : "—",
  };
}

async function main() {
  const probes: Probe[] = [];

  // ── TTS: one probe per provider a voice row can actually bind to ──────
  const voices = await getVoiceStore().list({}).catch(() => []);
  const boundProviders = new Map<string, number>();
  for (const voice of voices) {
    if (voice.status !== "ready") continue;
    boundProviders.set(voice.provider, (boundProviders.get(voice.provider) ?? 0) + 1);
  }
  // Providers with a streaming adapter, even if no voice binds them yet.
  for (const provider of ["elevenlabs", "cartesia", "pocket_tts"]) {
    if (!boundProviders.has(provider)) boundProviders.set(provider, 0);
  }

  for (const [provider, count] of [...boundProviders].sort()) {
    const entry = buildTtsSessionCostEntry({
      operationId: "probe",
      provider,
      characters: 1_000_000,
    });
    probes.push(
      probe(
        `tts · ${provider}${count ? dim(` (${count} ready voice${count === 1 ? "" : "s"})`) : dim(" (no voices bound)")}`,
        entry,
        `SESSION_COST_${provider.toUpperCase()}_USD_PER_MILLION_CHARACTERS`,
      ),
    );
  }

  // ── STT ───────────────────────────────────────────────────────────────
  probes.push(
    probe(
      "stt · deepgram/nova-3",
      buildSttSessionCostEntry({
        operationId: "probe",
        provider: "livekit/livekit",
        model: "deepgram/nova-3",
        audioDurationMs: 60_000,
      }),
      "SESSION_COST_STT_USD_PER_MINUTE",
    ),
  );

  // ── Infrastructure (room/media minutes) ───────────────────────────────
  probes.push(
    probe(
      "infrastructure · livekit room",
      buildInfrastructureSessionCostEntry({
        operationId: "probe",
        provider: "livekit",
        sessionDurationMs: 60_000,
      }),
      "SESSION_COST_LIVEKIT_SESSION_USD_PER_MINUTE",
    ),
  );

  // ── Embeddings ────────────────────────────────────────────────────────
  for (const [provider, model] of [
    ["openai", "text-embedding-3-small"],
    ["local", "bge-small-en-v1.5"],
  ] as const) {
    probes.push(
      probe(
        `embedding · ${provider}/${model}`,
        buildEmbeddingSessionCostEntry({
          operationId: "probe",
          provider,
          model,
          inputTokens: 1_000_000,
        }),
        "SESSION_COST_EMBEDDING_USD_PER_MILLION_TOKENS",
      ),
    );
  }

  // ── LLM: the registry prices every model, so report it as one line ────
  const models = MODEL_REGISTRY as Array<{ id: string; pricing?: unknown }>;
  const unpricedModels = models.filter((m) => !m.pricing);
  probes.push({
    what: `llm · model registry ${dim(`(${models.length} models)`)}`,
    priced: unpricedModels.length === 0,
    detail:
      unpricedModels.length === 0
        ? dim("every registry model carries input/output rates")
        : `missing: ${unpricedModels.map((m) => m.id).join(", ")}`,
  });

  // ── Report ────────────────────────────────────────────────────────────
  console.log(bold("\nPricing coverage — what this stack can bill for\n"));
  const pad = Math.max(...probes.map((p) => stripAnsi(p.what).length));
  for (const p of probes) {
    const mark = p.priced ? green("✓") : red("✗");
    const padding = " ".repeat(pad - stripAnsi(p.what).length);
    console.log(`  ${mark} ${p.what}${padding}  ${p.detail}`);
    if (!p.priced && p.envVar) console.log(`      ${dim(`set ${p.envVar}`)}`);
  }

  // ── What recent sessions actually left uncosted ────────────────────────
  const rows = await unpricedSpend(days);
  console.log(bold(`\nUnpriced operations in the last ${days} day${days === 1 ? "" : "s"}\n`));
  if (rows.length === 0) {
    console.log(dim("  none — every recorded operation carried a rate\n"));
  } else {
    for (const row of rows) {
      console.log(
        `  ${red("✗")} ${row.category} · ${row.provider ?? "—"}${row.model ? dim(` · ${row.model}`) : ""}` +
          `  ${row.ops} op${row.ops === 1 ? "" : "s"}` +
          (row.failed > 0 ? dim(`  (${row.failed} failed/unknown-usage — expected)`) : ""),
      );
    }
    console.log(
      dim("\n  Failed ops with unknown usage are correctly unpriced. Everything else is a missing rate.\n"),
    );
  }
}

/** Group the ledger's null-amount entries so real gaps stand out from
 *  failed operations, which have nothing to price by definition. */
async function unpricedSpend(days: number) {
  const db = getDb();
  if (!db) return [];
  const result = await db.execute(sql`
    select payload->>'category' as category,
           payload->>'provider'  as provider,
           payload->>'model'     as model,
           count(*)::int         as ops,
           count(*) filter (where payload->>'status' <> 'succeeded')::int as failed
    from scene_session_events
    where type = 'session.cost.recorded'
      and created_at > now() - (${days} || ' days')::interval
      and payload->>'amountUsd' is null
    group by 1, 2, 3
    order by 4 desc
  `);
  return (result.rows ?? result) as Array<{
    category: string;
    provider: string | null;
    model: string | null;
    ops: number;
    failed: number;
  }>;
}

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
