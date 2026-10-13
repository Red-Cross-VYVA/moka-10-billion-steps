import { describe, expect, it } from "vitest";
import { getSafeNextPath } from "./config";

describe("Supabase navigation safety", () => {
  it("accepts an internal application path", () => {
    expect(getSafeNextPath("/sites?status=verified")).toBe("/sites?status=verified");
  });

  it.each([null, "https://example.com", "//example.com", "overview"])(
    "rejects an unsafe return target: %s",
    (value) => {
      expect(getSafeNextPath(value)).toBe("/overview");
    },
  );
});
