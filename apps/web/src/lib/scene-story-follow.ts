export type SceneStoryFollowState = { following: boolean };

export type SceneStoryFollowAction =
  | { type: "viewport"; atEnd: boolean }
  | { type: "resume" };

export const initialSceneStoryFollowState: SceneStoryFollowState = { following: true };

export function sceneStoryFollowReducer(
  state: SceneStoryFollowState,
  action: SceneStoryFollowAction,
): SceneStoryFollowState {
  if (action.type === "resume") return state.following ? state : { following: true };
  if (action.atEnd) return state.following ? state : { following: true };
  return state.following ? { following: false } : state;
}
