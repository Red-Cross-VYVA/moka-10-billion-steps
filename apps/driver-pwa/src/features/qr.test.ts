import { describe, expect, it } from "vitest";
import { extractSiteCode } from "./qr";

describe("extractSiteCode", () => {
  it("normalizes a manually entered site code", () => {
    expect(extractSiteCode("  site-demo-001 ")).toBe("SITE-DEMO-001");
  });

  it("reads a site code from an approved query parameter", () => {
    expect(extractSiteCode("https://example.test/scan?site_code=SITE-DEMO-002")).toBe(
      "SITE-DEMO-002",
    );
  });

  it("reads the last path segment from a QR URL", () => {
    expect(extractSiteCode("https://example.test/sites/site-demo-003")).toBe(
      "SITE-DEMO-003",
    );
  });
});
