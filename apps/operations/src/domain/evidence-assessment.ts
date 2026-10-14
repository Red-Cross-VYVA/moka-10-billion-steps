export const ASSESSMENT_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
] as const;

export const ASSESSMENT_RESULTS = [
  "meets_criteria",
  "needs_review",
  "likely_issue",
] as const;

export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];
export type AssessmentResult = (typeof ASSESSMENT_RESULTS)[number];
export type CriterionOutcome = "pass" | "warning" | "fail" | "unknown";

export interface AssessmentCriterion {
  key: string;
  label: string;
  outcome: CriterionOutcome;
  detail: string;
  confidence?: number;
  source: "rule" | "vision";
}

export interface EvidenceAssessment {
  id: string;
  attemptId: string;
  status: AssessmentStatus;
  result?: AssessmentResult;
  confidence?: number;
  criteria: AssessmentCriterion[];
  reasons: string[];
  provider?: string;
  model?: string;
  ruleVersion: string;
  runNumber: number;
  requestedAt: string;
  completedAt?: string;
  errorCode?: string;
}

export interface EvidenceAssessmentSettings {
  organizationId: string;
  enabled: boolean;
  rolloutMode: "shadow" | "active";
  gpsThresholdMetres: number;
  futureToleranceMinutes: number;
  captureUploadWarningMinutes: number;
  minImageWidth: number;
  minImageHeight: number;
  passConfidence: number;
  issueConfidence: number;
  ruleVersion: string;
}

export function assessmentResultLabel(result?: AssessmentResult) {
  if (result === "meets_criteria") return "Meets criteria";
  if (result === "likely_issue") return "Likely issue";
  return "Needs review";
}

export function assessmentStatusLabel(status?: AssessmentStatus) {
  if (status === "queued") return "Queued";
  if (status === "processing") return "Analyzing";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Analysis unavailable";
  return "Not assessed";
}

export function classifyAssessment(
  criteria: AssessmentCriterion[],
  passConfidence: number,
  issueConfidence: number,
): AssessmentResult {
  const objectiveFailure = criteria.some(
    (criterion) => criterion.source === "rule" && criterion.outcome === "fail",
  );
  const confidentVisualFailure = criteria.some(
    (criterion) =>
      criterion.source === "vision" &&
      criterion.outcome === "fail" &&
      (criterion.confidence ?? 0) >= issueConfidence,
  );
  if (objectiveFailure || confidentVisualFailure) return "likely_issue";

  const allPassed =
    criteria.length > 0 &&
    criteria.every(
      (criterion) =>
        criterion.outcome === "pass" &&
        (criterion.source === "rule" ||
          (criterion.confidence ?? 0) >= passConfidence),
    );
  return allPassed ? "meets_criteria" : "needs_review";
}

export function latestAssessment(
  assessments: EvidenceAssessment[],
): EvidenceAssessment | undefined {
  return [...assessments].sort(
    (a, b) =>
      b.runNumber - a.runNumber ||
      Date.parse(b.requestedAt) - Date.parse(a.requestedAt),
  )[0];
}
