// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameTab } from "./game-tab";

describe("GameTab experience controls", () => {
  // No global test cleanup in this suite — unmount between renders so
  // role queries never see a previous test's DOM.
  afterEach(cleanup);
  it("applies Story and Living space presets to the underlying dials", () => {
    const setInitiative = vi.fn();
    const setNarrator = vi.fn();
    const setDrive = vi.fn();
    const setUserDirector = vi.fn();
    render(
      createElement(GameTab, {
        sceneId: "scene-1",
        pending: false,
        graphNodes: [],
        scene: {
          objective: "",
          drive: "balanced",
          initiative: "user",
          narrator: "minimal",
          userDirector: true,
          userRole: "visitor",
          userCharacter: { name: "", blurb: "" },
        },
        selectedNodeId: null,
        onSelect: vi.fn(),
        onSceneChange: {
          setObjective: vi.fn(),
          setDrive,
          setInitiative,
          setNarrator,
          setUserDirector,
          setUserRole: vi.fn(),
          setUserCharacter: vi.fn(),
        },
        onAddEvent: vi.fn(),
        onRemoveNode: vi.fn(),
        onNodeSaved: vi.fn(),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Story" }));
    expect(setInitiative).toHaveBeenLastCalledWith("narrator");
    expect(setNarrator).toHaveBeenLastCalledWith("scenic");
    expect(setDrive).toHaveBeenLastCalledWith("insistent");

    fireEvent.click(screen.getByRole("button", { name: "Living space" }));
    expect(setInitiative).toHaveBeenLastCalledWith("user");
    expect(setNarrator).toHaveBeenLastCalledWith("minimal");
    expect(setDrive).toHaveBeenLastCalledWith("gentle");

    fireEvent.click(screen.getByRole("checkbox"));
    expect(setUserDirector).toHaveBeenCalledWith(false);
  });

  it("shows the active scene mode, and Custom when the dials diverge", () => {
    const base = {
      sceneId: "scene-1",
      pending: false,
      graphNodes: [],
      selectedNodeId: null,
      onSelect: vi.fn(),
      onSceneChange: {
        setObjective: vi.fn(),
        setDrive: vi.fn(),
        setInitiative: vi.fn(),
        setNarrator: vi.fn(),
        setUserDirector: vi.fn(),
        setUserRole: vi.fn(),
        setUserCharacter: vi.fn(),
      },
      onAddEvent: vi.fn(),
      onRemoveNode: vi.fn(),
      onNodeSaved: vi.fn(),
    };

    // Dials matching the Story preset → Story segment reads pressed.
    // Queries are render-scoped: this suite has no auto-cleanup, so
    // screen-level queries would see earlier tests' DOM too.
    const story = render(
      createElement(GameTab, {
        ...base,
        scene: {
          objective: "",
          drive: "insistent",
          initiative: "narrator",
          narrator: "scenic",
          userDirector: true,
          userRole: "visitor",
          userCharacter: { name: "", blurb: "" },
        },
      }),
    );
    expect(
      story.getByRole("button", { name: "Story" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      story.getByRole("button", { name: "Living space" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(story.getByText(/Story — the world drives/)).toBeTruthy();
    story.unmount();

    // A hand-set dial (shared initiative) → neither mode pressed, Custom hint.
    const custom = render(
      createElement(GameTab, {
        ...base,
        scene: {
          objective: "",
          drive: "insistent",
          initiative: "shared",
          narrator: "scenic",
          userDirector: true,
          userRole: "visitor",
          userCharacter: { name: "", blurb: "" },
        },
      }),
    );
    expect(
      custom.getByRole("button", { name: "Story" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      custom.getByRole("button", { name: "Living space" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(custom.getByText(/Custom — the dials below are set individually/)).toBeTruthy();
  });
});
