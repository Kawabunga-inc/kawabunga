import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SceneViewToggle } from "./scene-view-toggle";

describe("SceneViewToggle staff gate", () => {
  it("does not render Session or its ADMIN marker for consumers", () => {
    const html = renderToStaticMarkup(createElement(SceneViewToggle, {
      value: "waveform", onChange: vi.fn(),
    }));
    expect(html).not.toContain("Session");
    expect(html).not.toContain("ADMIN");
  });

  it("renders the third Session tab only for server-resolved staff", () => {
    const html = renderToStaticMarkup(createElement(SceneViewToggle, {
      value: "session", staff: true, onChange: vi.fn(),
    }));
    expect(html).toContain("Session");
    expect(html).toContain("ADMIN");
    expect(html).toContain('data-scene-view="session"');
  });
});
