import type {
  EvidenceAssessment,
  EvidenceAssessmentSettings,
} from "./evidence-assessment";

export const SITE_STATUSES = [
  "Unassigned",
  "Assigned",
  "In Progress",
  "Under Review",
  "Verified",
  "Revisit Required",
  "Flagged / Exception",
  "Closed / Cancelled",
] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];
export type AttemptStatus =
  "Not started" | "In progress" | "Submitted" | "Accepted" | "Rejected";
export type ExceptionStatus =
  "Open" | "Investigating" | "Awaiting revisit" | "Resolved" | "Closed";
export type Region =
  "Riyadh" | "Makkah" | "Eastern Province" | "Madinah" | "Asir";
export type Category =
  | "Grocery"
  | "Pharmacy"
  | "Café"
  | "Restaurant"
  | "Convenience"
  | "Electronics";

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}
export interface VisitAttempt {
  id: string;
  status: AttemptStatus;
  submittedAt?: string;
  decidedAt?: string;
  decision?: string;
}
export interface SiteEvidence {
  id: string;
  kind: "installation_photo" | "close_up_photo" | "other";
  signedUrl: string;
  uploadedAt?: string;
}
export interface Site {
  id: string;
  merchant: string;
  region: Region;
  city: string;
  category: Category;
  status: SiteStatus;
  driverId?: string;
  lat: number;
  lng: number;
  updatedAt: string;
  address?: string;
  attemptStatus: AttemptStatus;
  exceptionStatus?: ExceptionStatus;
  exceptionReason?: string;
  exceptionOpenedAt?: string;
  visitAttempts: VisitAttempt[];
  audit: AuditEvent[];
  evidence?: SiteEvidence[];
  gpsProximityMetres?: number;
  fieldNotes?: string;
  assessments?: EvidenceAssessment[];
}
export interface Driver {
  id: string;
  name: string;
  mobile: string;
  email: string;
  region: Region;
  active: boolean;
  available: boolean;
  code?: string;
}
export interface Notification {
  id: string;
  type: "assignment" | "review" | "exception" | "revisit" | "approval";
  title: string;
  detail: string;
  at: string;
  read: boolean;
}

export interface OperationsAccess {
  role?: "admin" | "operator" | "reviewer";
  assessmentSettings?: EvidenceAssessmentSettings;
}

export const allowedTransitions: Record<SiteStatus, readonly SiteStatus[]> = {
  Unassigned: ["Assigned", "Closed / Cancelled"],
  Assigned: ["Unassigned", "In Progress", "Closed / Cancelled"],
  "In Progress": ["Under Review", "Revisit Required", "Flagged / Exception"],
  "Under Review": ["Verified", "Revisit Required", "Flagged / Exception"],
  Verified: ["Flagged / Exception", "Closed / Cancelled"],
  "Revisit Required": ["Assigned", "In Progress", "Closed / Cancelled"],
  "Flagged / Exception": [
    "Assigned",
    "Revisit Required",
    "Verified",
    "Closed / Cancelled",
  ],
  "Closed / Cancelled": [],
};

export function canTransition(from: SiteStatus, to: SiteStatus) {
  return allowedTransitions[from].includes(to);
}
export function transitionSite(
  site: Site,
  to: SiteStatus,
  actor = "Operations admin",
  detail = "Status updated",
): Site {
  if (!canTransition(site.status, to))
    throw new Error(`Invalid site transition: ${site.status} → ${to}`);
  const at = new Date().toISOString();
  return {
    ...site,
    status: to,
    updatedAt: at,
    exceptionStatus:
      to === "Flagged / Exception" ? "Open" : site.exceptionStatus,
    audit: [
      {
        id: `evt-${Date.now()}-${site.id}`,
        at,
        actor,
        action: `Changed status to ${to}`,
        detail,
      },
      ...site.audit,
    ],
  };
}
export function canAssign(site: Site, driver: Driver) {
  return (
    site.status !== "Under Review" &&
    site.status !== "Verified" &&
    site.status !== "Closed / Cancelled" &&
    driver.active &&
    driver.available &&
    driver.region === site.region
  );
}

export type SiteDraft = Pick<
  Site,
  "id" | "merchant" | "region" | "city" | "category" | "lat" | "lng"
> & { address?: string };
export type SiteDraftErrors = Partial<Record<keyof SiteDraft, string>>;

export function validateSiteDraft(
  draft: Partial<SiteDraft>,
  existingIds: Iterable<string>,
): SiteDraftErrors {
  const errors: SiteDraftErrors = {};
  const ids = new Set([...existingIds].map((id) => id.toLowerCase()));
  if (!draft.merchant?.trim())
    errors.merchant = "Merchant / site name is required.";
  if (!draft.id?.trim()) errors.id = "Unique site ID is required.";
  else if (ids.has(draft.id.trim().toLowerCase()))
    errors.id = "This site ID already exists.";
  if (!draft.region) errors.region = "Region is required.";
  if (!draft.city?.trim()) errors.city = "City is required.";
  if (!draft.category) errors.category = "Category is required.";
  if (
    !Number.isFinite(draft.lat) ||
    Number(draft.lat) < -90 ||
    Number(draft.lat) > 90
  )
    errors.lat = "Enter a latitude from -90 to 90.";
  if (
    !Number.isFinite(draft.lng) ||
    Number(draft.lng) < -180 ||
    Number(draft.lng) > 180
  )
    errors.lng = "Enter a longitude from -180 to 180.";
  return errors;
}

export function createSite(
  draft: SiteDraft,
  existingIds: Iterable<string>,
  at = new Date().toISOString(),
): Site {
  const errors = validateSiteDraft(draft, existingIds);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return {
    ...draft,
    id: draft.id.trim(),
    merchant: draft.merchant.trim(),
    city: draft.city.trim(),
    address: draft.address?.trim() || undefined,
    status: "Unassigned",
    driverId: undefined,
    updatedAt: at,
    attemptStatus: "Not started",
    exceptionStatus: undefined,
    visitAttempts: [],
    audit: [
      {
        id: `evt-created-${draft.id}`,
        at,
        actor: "Operations admin",
        action: "Site created",
        detail: "Created in the Operations Dashboard",
      },
    ],
  };
}

export function workloadForDriver(sites: Site[], driverId: string) {
  return sites.filter(
    (site) =>
      site.driverId === driverId && site.status !== "Closed / Cancelled",
  ).length;
}

export function decideReview(
  site: Site,
  to: "Verified" | "Revisit Required" | "Flagged / Exception",
  reason: string,
  at = new Date().toISOString(),
): Site {
  if (site.status !== "Under Review")
    throw new Error("Only sites under review can receive a review decision.");
  const transitioned = transitionSite(site, to, "Operations reviewer", reason);
  const attemptStatus: AttemptStatus =
    to === "Verified" ? "Accepted" : "Rejected";
  const submitted = site.visitAttempts.find(
    (attempt) => attempt.status === "Submitted" && !attempt.decidedAt,
  );
  const visitAttempts = submitted
    ? site.visitAttempts.map((attempt) =>
        attempt.id === submitted.id
          ? {
              ...attempt,
              status: attemptStatus,
              decidedAt: at,
              decision: reason,
            }
          : attempt,
      )
    : [
        ...site.visitAttempts,
        {
          id: `attempt-${site.id}-${at}`,
          status: attemptStatus,
          submittedAt: site.updatedAt,
          decidedAt: at,
          decision: reason,
        },
      ];
  return {
    ...transitioned,
    updatedAt: at,
    attemptStatus,
    exceptionStatus:
      to === "Flagged / Exception"
        ? "Open"
        : to === "Revisit Required"
          ? "Awaiting revisit"
          : undefined,
    visitAttempts,
  };
}

export function assignSites(
  sites: Site[],
  siteIds: Iterable<string>,
  driver: Driver,
  at = new Date().toISOString(),
) {
  const ids = new Set(siteIds);
  let assigned = 0;
  let skipped = 0;
  const next = sites.map((site) => {
    if (!ids.has(site.id)) return site;
    if (!canAssign(site, driver)) {
      skipped++;
      return site;
    }
    if (site.driverId === driver.id) {
      skipped++;
      return site;
    }
    const nextStatus: SiteStatus = [
      "Unassigned",
      "Revisit Required",
      "Flagged / Exception",
    ].includes(site.status)
      ? "Assigned"
      : site.status;
    if (nextStatus !== site.status && !canTransition(site.status, nextStatus)) {
      skipped++;
      return site;
    }
    assigned++;
    return {
      ...site,
      driverId: driver.id,
      status: nextStatus,
      updatedAt: at,
      audit: [
        {
          id: `evt-assigned-${at}-${site.id}`,
          at,
          actor: "Operations admin",
          action: `Assigned to ${driver.name}`,
          detail:
            site.driverId && site.driverId !== driver.id
              ? `Reassigned from ${site.driverId}`
              : "Assignment confirmed",
        },
        ...site.audit,
      ],
    };
  });
  return { sites: next, assigned, skipped };
}
