import { describe, expect, it } from "vitest";
import { canSubmitEvidence, getEvidenceSubmissionIssue } from "./evidence";

describe("driver evidence requirements", () => {
  it("requires GPS capture", () => {
    expect(
      getEvidenceSubmissionIssue({
        gpsCaptured: false,
        installationPhoto: true,
        closeUpPhoto: true,
      }),
    ).toBe("Capture location before submitting.");
  });

  it("requires both installation photos", () => {
    expect(
      canSubmitEvidence({
        gpsCaptured: true,
        installationPhoto: true,
        closeUpPhoto: false,
      }),
    ).toBe(false);
  });

  it("allows submission with GPS and both photos", () => {
    expect(
      canSubmitEvidence({
        gpsCaptured: true,
        installationPhoto: true,
        closeUpPhoto: true,
      }),
    ).toBe(true);
  });
});
