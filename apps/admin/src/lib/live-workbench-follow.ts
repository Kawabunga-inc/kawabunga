export type LiveWorkbenchFollowState = {
  following: boolean;
};

export type LiveWorkbenchFollowAction =
  | { type: "select" }
  | { type: "resume" };

export const initialLiveWorkbenchFollowState: LiveWorkbenchFollowState = {
  following: true,
};

export function liveWorkbenchFollowReducer(
  state: LiveWorkbenchFollowState,
  action: LiveWorkbenchFollowAction,
): LiveWorkbenchFollowState {
  if (action.type === "select") {
    return state.following ? { following: false } : state;
  }
  return state.following ? state : { following: true };
}
