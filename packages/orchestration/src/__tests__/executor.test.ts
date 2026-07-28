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

function okResponse(decision: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }),
    { status: 200 },
  );
}

afterEach(() => {
  delete process.env.ORCHESTRATOR_TIMEOUT_MS;
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
