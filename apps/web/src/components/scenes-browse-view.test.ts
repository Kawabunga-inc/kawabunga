import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScenesBrowseView, type BrowseSceneCard } from "./scenes-browse-view";

const card: BrowseSceneCard = {
  id: "mamre",
  title: "Abraham's Tent at Mamre",
  hook: "Three strangers left behind an impossible promise.",
  characterCount: 2,
  narratorEnabled: true,
  isNew: false,
  visited: false,
  haloVariant: 1,
};

describe("ScenesBrowseView", () => {
  it("renders signed-out browse without a VISITED chip or direct-enter action", () => {
    const html = renderToStaticMarkup(
      createElement(ScenesBrowseView, { scenes: [card], viewerInitial: "" }),
    );
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Visited");
    expect(html).not.toContain("/enter");
    expect(html).toContain("/scenes/mamre");
  });

  it("renders an honest empty state", () => {
    const html = renderToStaticMarkup(
      createElement(ScenesBrowseView, { scenes: [], viewerInitial: "B" }),
    );
    expect(html).toContain("No scenes are open right now.");
    expect(html).not.toContain("Enter the scene");
  });
});
