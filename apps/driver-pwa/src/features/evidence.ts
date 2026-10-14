export type EvidenceRequirements = {
  gpsCaptured: boolean;
  installationPhoto: boolean;
  closeUpPhoto: boolean;
};

export function getEvidenceSubmissionIssue(
  requirements: EvidenceRequirements,
) {
  if (!requirements.gpsCaptured) {
    return "Capture GPS at the merchant site before submitting.";
  }
  if (!requirements.installationPhoto || !requirements.closeUpPhoto) {
    return "Capture both evidence photos before submitting.";
  }
  return null;
}

export function canSubmitEvidence(requirements: EvidenceRequirements) {
  return getEvidenceSubmissionIssue(requirements) === null;
}
