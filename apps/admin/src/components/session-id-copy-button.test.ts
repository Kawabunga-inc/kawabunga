/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionIdCopyButton } from "./session-id-copy-button";

afterEach(() => cleanup());

describe("SessionIdCopyButton", () => {
  it("copies the complete session id when the shortened id is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const sessionId = "7403e186-b61e-4a9a-8a9f-8da989054993";

    render(
      React.createElement(SessionIdCopyButton, {
        sessionId,
        displayId: "7403e186...4993",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: `Copy session ID ${sessionId}` }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(sessionId));
    expect(screen.getByRole("status").textContent).toBe("Copied");
  });
});
