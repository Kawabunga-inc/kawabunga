import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import LegacySceneSandboxPage from "./page";

describe("legacy scene sandbox route", () => {
  it("returns old rehearsal bookmarks to the single Run live entry point", async () => {
    await LegacySceneSandboxPage({
      params: Promise.resolve({ sceneId: "draft scene/1" }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith("/scenes/draft%20scene%2F1");
  });
});
