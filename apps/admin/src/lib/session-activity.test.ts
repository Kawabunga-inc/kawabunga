import { describe, expect, it } from "vitest";
import { classifySessionActivity } from "./session-activity";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");

describe("classifySessionActivity", () => {
  it("keeps a fresh persisted active session in Active now", () => {
    expect(
      classifySessionActivity(
        { status: "active", lastActiveAt: "2026-08-05T11:59:10.000Z" },
        [{ createdAt: "2026-08-05T11:59:52.000Z" }],
        [{ updatedAt: "2026-08-05T11:59:40.000Z" }],
        NOW,
      ),
    ).toMatchObject({
      isActive: true,
      latestActivityAt: "2026-08-05T11:59:52.000Z",
      ageMs: 8_000,
      displayStatus: "active",
    });
  });

  it("demotes a stale persisted active session and labels it stale", () => {
    expect(
      classifySessionActivity(
        { status: "active", lastActiveAt: "2026-08-05T11:58:00.000Z" },
        [],
        [],
        NOW,
      ),
    ).toMatchObject({ isActive: false, displayStatus: "stale" });
  });

  it("never promotes an ended session even when its journal is fresh", () => {
    expect(
      classifySessionActivity(
        { status: "ended", lastActiveAt: "2026-08-05T11:59:58.000Z" },
        [{ createdAt: "2026-08-05T11:59:59.000Z" }],
        [],
        NOW,
      ),
    ).toMatchObject({ isActive: false, displayStatus: "ended" });
  });

  it("treats the exact 60-second boundary as stale", () => {
    expect(
      classifySessionActivity(
        { status: "active", lastActiveAt: "2026-08-05T11:59:00.000Z" },
        [],
        [],
        NOW,
      ),
    ).toMatchObject({
      isActive: false,
      ageMs: 60_000,
      displayStatus: "stale",
    });
  });
});
