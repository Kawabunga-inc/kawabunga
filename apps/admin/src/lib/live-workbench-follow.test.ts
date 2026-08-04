import { describe, expect, it } from "vitest";
import {
  initialLiveWorkbenchFollowState,
  liveWorkbenchFollowReducer,
} from "./live-workbench-follow";

describe("liveWorkbenchFollowReducer", () => {
  it("disengages following on any manual selection", () => {
    expect(
      liveWorkbenchFollowReducer(initialLiveWorkbenchFollowState, {
        type: "select",
      }),
    ).toEqual({ following: false });
  });

  it("resumes from either the follow pill or NOW action", () => {
    expect(
      liveWorkbenchFollowReducer({ following: false }, { type: "resume" }),
    ).toEqual({ following: true });
  });
});
