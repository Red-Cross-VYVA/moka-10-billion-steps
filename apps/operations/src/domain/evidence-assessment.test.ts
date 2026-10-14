import { describe, expect, it } from "vitest";
import {
  classifyAssessment,
  latestAssessment,
  type AssessmentCriterion,
  type EvidenceAssessment,
} from "./evidence-assessment";

const rule = (
  outcome: AssessmentCriterion["outcome"],
): AssessmentCriterion => ({
  key: "gps_proximity",
  label: "GPS proximity",
  outcome,
  detail: "Test result",
  source: "rule",
});

const vision = (
  outcome: AssessmentCriterion["outcome"],
  confidence: number,
): AssessmentCriterion => ({
  key: "poster_visible",
  label: "Poster visible",
  outcome,
  detail: "Test result",
  source: "vision",
  confidence,
});

describe("evidence assessment classification", () => {
  it("marks a fully passing assessment as meeting criteria", () => {
    expect(classifyAssessment([rule("pass"), vision("pass", 0.91)], 0.85, 0.9)).toBe(
      "meets_criteria",
    );
  });

  it("treats an objective failure as a likely issue", () => {
    expect(classifyAssessment([rule("fail"), vision("pass", 0.95)], 0.85, 0.9)).toBe(
      "likely_issue",
    );
  });

  it("treats a high-confidence visual failure as a likely issue", () => {
    expect(classifyAssessment([rule("pass"), vision("fail", 0.93)], 0.85, 0.9)).toBe(
      "likely_issue",
    );
  });

  it("routes warnings, unknowns and low confidence to human review", () => {
    expect(classifyAssessment([rule("warning"), vision("pass", 0.95)], 0.85, 0.9)).toBe(
      "needs_review",
    );
    expect(classifyAssessment([rule("pass"), vision("pass", 0.7)], 0.85, 0.9)).toBe(
      "needs_review",
    );
    expect(classifyAssessment([], 0.85, 0.9)).toBe("needs_review");
  });
});

describe("latestAssessment", () => {
  it("keeps retry history and selects the highest run", () => {
    const base: EvidenceAssessment = {
      id: "one",
      attemptId: "attempt",
      status: "failed",
      criteria: [],
      reasons: [],
      ruleVersion: "2026-10-01",
      runNumber: 1,
      requestedAt: "2026-10-14T10:00:00Z",
    };
    expect(
      latestAssessment([
        base,
        { ...base, id: "two", status: "queued", runNumber: 2 },
      ])?.id,
    ).toBe("two");
  });
});
