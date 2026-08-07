import { afterEach, describe, expect, it } from "vitest";
import { resolveOrchestratorExecutor } from "../executor";
import { buildSceneDecisionRequest, createInitialSceneState } from "../client";
import type { Scene } from "@kawabunga/types";

const SCENE: Scene = {
  id: "exec-test",
  title: "Executor test",
  description: "A scene.",
  characters: [
    { characterSlug: "ada", displayName: "Ada", voice: "ada", blurb: "A mathematician." },
  ],
  openingBeat: "Opens.",
  defaultAmbience: null,
};

function decisionRequest() {
  return buildSceneDecisionRequest({
    scene: SCENE,
    sceneState: createInitialSceneState(SCENE),
    recentTurns: [],
    lastUserMessage: "Hello?",
  });
}

function okResponse(decision: unknown, usage?: { prompt_tokens: number; completion_tokens: number }): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }], usage }),
    { status: 200 },
  );
}

afterEach(() => {
  delete process.env.ORCHESTRATOR_TIMEOUT_MS;
  delete process.env.ORCHESTRATOR_MODEL;
});

describe("orchestrator executor", () => {
  it("passes a signal to fetch and parses the decision", async () => {
    let seenSignal: AbortSignal | null | undefined;
    const { executor } = resolveOrchestratorExecutor({
      provider: "cerebras",
      cerebrasApiKey: "test-key",
      fetchImpl: async (_url, init) => {
        seenSignal = init?.signal;
        return okResponse({ action: "speak", speakerId: "ada" });
      },
    });
    const decision = await executor!.execute(decisionRequest());
    expect(decision).toEqual({ action: "speak", speakerId: "ada" });
    // The hung-provider timeout is always armed, so fetch always gets a signal.
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal!.aborted).toBe(false);
  });

  it("reports director token usage from the provider response", async () => {
    let usage: unknown;
    const { executor } = resolveOrchestratorExecutor({
      provider: "cerebras",
      cerebrasApiKey: "test-key",
      fetchImpl: async () =>
        okResponse(
          { action: "speak", speakerId: "ada" },
          { prompt_tokens: 420, completion_tokens: 36 },
        ),
    });
    await executor!.execute(decisionRequest(), { onUsage: (value) => { usage = value; } });
    expect(usage).toEqual({ inputTokens: 420, outputTokens: 36, cacheReadTokens: 0 });
  });

  it("aborts a hung provider call via ORCHESTRATOR_TIMEOUT_MS", async () => {
    process.env.ORCHESTRATOR_TIMEOUT_MS = "50";
    const { executor } = resolveOrchestratorExecutor({
      provider: "cerebras",
      cerebrasApiKey: "test-key",
      fetchImpl: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("fetch aborted")),
          );
        }),
    });
    await expect(executor!.execute(decisionRequest())).rejects.toThrow("fetch aborted");
  });

  it("model override picks provider AND model from the registry, outranking the provider config", async () => {
    let seenUrl = "";
    let seenModel = "";
    const { executor } = resolveOrchestratorExecutor({
      // Provider config says Cerebras — the registry says this model is Groq's.
      provider: "cerebras",
      cerebrasApiKey: "cerebras-key",
      groqApiKey: "groq-key",
      model: "openai/gpt-oss-120b",
      fetchImpl: async (url, init) => {
        seenUrl = String(url);
        seenModel = (JSON.parse(String(init?.body)) as { model: string }).model;
        return okResponse({ action: "wait-for-user" });
      },
    });
    expect(executor?.provider).toBe("groq");
    expect(executor?.model).toBe("openai/gpt-oss-120b");
    await executor!.execute(decisionRequest());
    expect(seenUrl).toContain("api.groq.com");
    expect(seenModel).toBe("openai/gpt-oss-120b");
  });

  it("reads the override from ORCHESTRATOR_MODEL", () => {
    process.env.ORCHESTRATOR_MODEL = "openai/gpt-oss-120b";
    const { executor } = resolveOrchestratorExecutor({
      groqApiKey: "groq-key",
      fetchImpl: async () => okResponse({ action: "wait-for-user" }),
    });
    expect(executor?.provider).toBe("groq");
    expect(executor?.model).toBe("openai/gpt-oss-120b");
  });

  it("ignores an override the registry doesn't know — default resolution wins", () => {
    const { executor } = resolveOrchestratorExecutor({
      provider: "cerebras",
      cerebrasApiKey: "cerebras-key",
      model: "not-a-real-model",
      fetchImpl: async () => okResponse({ action: "wait-for-user" }),
    });
    expect(executor?.provider).toBe("cerebras");
  });

  it("ignores an override served by a provider the executor can't speak", () => {
    // Registry-known, but Anthropic has no strict-json_schema wiring here.
    const { executor } = resolveOrchestratorExecutor({
      provider: "cerebras",
      cerebrasApiKey: "cerebras-key",
      model: "claude-haiku-4-5",
      fetchImpl: async () => okResponse({ action: "wait-for-user" }),
    });
    expect(executor?.provider).toBe("cerebras");
  });

  it("falls back to default resolution when the override's provider key is missing", () => {
    const { executor } = resolveOrchestratorExecutor({
      cerebrasApiKey: "cerebras-key",
      // Groq model, but no groqApiKey — the director must not go down.
      model: "openai/gpt-oss-120b",
      fetchImpl: async () => okResponse({ action: "wait-for-user" }),
    });
    expect(executor?.provider).toBe("cerebras");
  });

  it("propagates a caller abort (superseded speculation)", async () => {
    const caller = new AbortController();
    const { executor } = resolveOrchestratorExecutor({
      provider: "groq",
      groqApiKey: "test-key",
      fetchImpl: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("fetch aborted")),
          );
        }),
    });
    const pending = executor!.execute(decisionRequest(), { signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toThrow("fetch aborted");
  });
});
