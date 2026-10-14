import { describe, expect, it } from "vitest";
import { safeNext } from "./config";

describe("Driver sign-in return paths", () => {
  it("preserves a requested assignment and query", () => {
    expect(safeNext("/?site=KSA-001")).toBe("/?site=KSA-001");
  });
  it.each([
    null,
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/\n/example.com",
  ])("keeps unsafe targets inside the driver app: %s", (value) => {
    expect(safeNext(value)).toBe("/");
  });
});
