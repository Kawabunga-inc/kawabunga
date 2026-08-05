export type SceneTranscriptMessage = {
  role: "user" | "agent";
  id: string;
  text: string;
  final: boolean;
  speaker?: { slug: string; name: string };
};

export type SceneCaptionState = {
  order: string[];
  messages: Record<string, SceneTranscriptMessage>;
  visible: boolean;
};

export type SceneCaptionAction =
  | { type: "received"; message: SceneTranscriptMessage }
  | { type: "visibility"; visible: boolean }
  | { type: "reset" };

export const initialSceneCaptionState: SceneCaptionState = {
  order: [],
  messages: {},
  visible: true,
};

export function sceneCaptionReducer(
  state: SceneCaptionState,
  action: SceneCaptionAction,
): SceneCaptionState {
  if (action.type === "reset") return initialSceneCaptionState;
  if (action.type === "visibility") return { ...state, visible: action.visible };

  const message = action.message;
  const exists = Boolean(state.messages[message.id]);
  return {
    ...state,
    order: exists ? state.order : [...state.order, message.id],
    messages: { ...state.messages, [message.id]: message },
  };
}

export function parseSceneTranscript(payload: Uint8Array): SceneTranscriptMessage | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    if (
      (value.role !== "user" && value.role !== "agent") ||
      typeof value.id !== "string" ||
      typeof value.text !== "string" ||
      typeof value.final !== "boolean"
    ) {
      return null;
    }
    const rawSpeaker = value.speaker as Record<string, unknown> | undefined;
    const speaker =
      rawSpeaker && typeof rawSpeaker.slug === "string" && typeof rawSpeaker.name === "string"
        ? { slug: rawSpeaker.slug, name: rawSpeaker.name }
        : undefined;
    return { role: value.role, id: value.id, text: value.text, final: value.final, speaker };
  } catch {
    return null;
  }
}

export function selectAgentCaptionLines(state: SceneCaptionState): {
  current: SceneTranscriptMessage | null;
  previous: SceneTranscriptMessage | null;
} {
  const agentMessages = state.order
    .map((id) => state.messages[id])
    .filter((message): message is SceneTranscriptMessage => message?.role === "agent");
  return {
    current: agentMessages.at(-1) ?? null,
    previous: agentMessages.at(-2) ?? null,
  };
}
