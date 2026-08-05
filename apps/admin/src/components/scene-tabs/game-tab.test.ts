// @vitest-environment jsdom

import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameTab } from "./game-tab";

describe("GameTab experience controls", () => {
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
});
