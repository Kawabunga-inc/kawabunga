import { describe, expect, it } from "vitest";
import { buildIdentity } from "./build-identity";

describe("buildIdentity", () => {
  it("reports the platform's own git metadata", () => {
    expect(
      buildIdentity({
        RAILWAY_GIT_COMMIT_SHA: "4fc29fcb1e2d3a4b5c6d7e8f9a0b1c2d3e4f5a6b",
        RAILWAY_GIT_BRANCH: "main",
      }),
    ).toEqual({ commit: "4fc29fcb1e2d", branch: "main" });
  });

  it("lets an explicit override win over the platform's", () => {
    // A non-Railway host, or a local run, sets these directly.
    expect(
      buildIdentity({
        GIT_COMMIT_SHA: "aaaaaaaaaaaaaaaa",
        GIT_BRANCH: "dev",
        RAILWAY_GIT_COMMIT_SHA: "bbbbbbbbbbbbbbbb",
        RAILWAY_GIT_BRANCH: "main",
      }),
    ).toEqual({ commit: "aaaaaaaaaaaa", branch: "dev" });
  });

  it("admits ignorance rather than guessing", () => {
    // A wrong SHA is worse than a null one — it would be believed.
    expect(buildIdentity({})).toEqual({ commit: null, branch: null });
    expect(buildIdentity({ RAILWAY_GIT_COMMIT_SHA: "   ", RAILWAY_GIT_BRANCH: "" })).toEqual({
      commit: null,
      branch: null,
    });
  });

  it("does not pad a short sha", () => {
    expect(buildIdentity({ GIT_COMMIT_SHA: "abc123" }).commit).toBe("abc123");
  });
});
