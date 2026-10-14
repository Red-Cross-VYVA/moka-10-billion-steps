import { describe, expect, it } from "vitest";
import {
  buildEvidenceObjectPaths,
  buildStampLines,
  formatSaudiTimestamp,
} from "./photo-evidence";

describe("photo evidence metadata", () => {
  it("formats capture time in Saudi Arabia time", () => {
    expect(formatSaudiTimestamp("2026-01-15T09:10:11.000Z")).toBe(
      "15/01/2026, 12:10:11",
    );
  });

  it("builds a readable stamp with site and six-decimal GPS", () => {
    expect(
      buildStampLines({
        capturedAt: "2026-01-15T09:10:11.000Z",
        latitude: 24.7135519,
        longitude: 46.6752958,
        siteCode: "DEMO-RUH-001",
      }),
    ).toEqual([
      "DMC · 10 Billion Steps",
      "Site: DEMO-RUH-001",
      "Captured: 15/01/2026, 12:10:11 AST (UTC+3)",
      "GPS: 24.713552, 46.675296",
    ]);
  });

  it("keeps original and stamped files under one evidence UID", () => {
    expect(
      buildEvidenceObjectPaths("org", "site", "attempt", "evidence", "jpg", "webp"),
    ).toEqual({
      original: "org/site/attempt/evidence/original.jpg",
      stamped: "org/site/attempt/evidence/stamped.webp",
    });
  });

  it("supports an Arabic evidence stamp", () => {
    const lines = buildStampLines({
      capturedAt: "2026-01-15T09:10:11.000Z",
      latitude: 24.713552,
      longitude: 46.675296,
      siteCode: "DEMO-RUH-001",
      language: "ar",
    });
    expect(lines[1]).toBe("الموقع: DEMO-RUH-001");
    expect(lines[2]).toContain("بتوقيت السعودية (UTC+3)");
    expect(lines[3]).toBe("GPS: 24.713552, 46.675296");
  });
});
