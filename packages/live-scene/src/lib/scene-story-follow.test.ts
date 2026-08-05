import { describe, expect, it } from "vitest";
import {
  initialSceneStoryFollowState,
  sceneStoryFollowReducer,
} from "./scene-story-follow";

describe("sceneStoryFollowReducer", () => {
  it("stops following when the reader scrolls away from the newest line", () => {
    expect(
      sceneStoryFollowReducer(initialSceneStoryFollowState, {
        type: "viewport",
        atEnd: false,
      }),
    ).toEqual({ following: false });
  });

  it("resumes explicitly or when the reader reaches the end", () => {
    const paused = { following: false };
    expect(sceneStoryFollowReducer(paused, { type: "resume" })).toEqual({ following: true });
    expect(sceneStoryFollowReducer(paused, { type: "viewport", atEnd: true })).toEqual({
      following: true,
    });
  });
});
