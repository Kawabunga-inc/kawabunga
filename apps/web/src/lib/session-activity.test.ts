import { describe, expect, it } from "vitest";
import { classifySessionActivity } from "./session-activity";

const NOW = Date.parse("2026-08-05T12:00:00.000Z");

describe("consumer session activity", () => {
  it("uses the newest journal timestamp to offer a fresh active rejoin", () => {
    expect(
      classifySessionActivity(
        { status: "active", lastActiveAt: "2026-08-05T11:58:00.000Z" },
        [{ createdAt: "2026-08-05T11:59:52.000Z" }],
        [{ updatedAt: "2026-08-05T11:59:40.000Z" }],
        NOW,
      ),
    ).toMatchObject({ isActive: true, ageMs: 8_000, displayStatus: "active" });
  });

  it("treats the exact 60-second boundary as stale", () => {
    expect(
      classifySessionActivity(
        { status: "active", lastActiveAt: "2026-08-05T11:59:00.000Z" },
        [],
        [],
        NOW,
      ),
    ).toMatchObject({ isActive: false, ageMs: 60_000, displayStatus: "stale" });
  });

  it("never reopens an ended session even with recent activity", () => {
    expect(
      classifySessionActivity(
        { status: "ended", lastActiveAt: "2026-08-05T11:59:59.000Z" },
        [],
        [],
        NOW,
      ).isActive,
    ).toBe(false);
  });
});
