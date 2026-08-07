import { describe, expect, it } from "vitest";
import {
  buildSystemPromptParts,
  buildVoiceSystemPromptParts,
} from "../character-system-prompt";

const convention =
  "You speak in first person as Sarah. When you ACT — a movement, an expression, something the audience must see — put that action in *asterisks*, one short present-tense sentence, third person. Everything outside asterisks is your spoken voice and must be pure first-person speech: no narration, no describing yourself from outside. Never quote your own dialogue inside quotation marks.";

describe("character performance prompt", () => {
  it("carries the acting channel in legacy chat and voice prompts", () => {
    expect(buildSystemPromptParts("Sarah", "context").cached).toContain(convention);
    expect(buildVoiceSystemPromptParts("Sarah", "context").cached).toContain(convention);
  });

  it("carries the acting channel with authored identity and directives", () => {
    const directive = { guidance: "Guard the promise." };
    const identity = { essence: "keeper of a difficult hope" };

    expect(buildSystemPromptParts("Sarah", "context", directive, identity).cached)
      .toContain(convention);
    expect(buildVoiceSystemPromptParts("Sarah", "context", directive, identity).cached)
      .toContain(convention);
  });
});
