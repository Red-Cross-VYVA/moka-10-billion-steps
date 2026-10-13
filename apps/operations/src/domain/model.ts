export const SITE_STATUSES = ["Unassigned", "Assigned", "In Progress", "Under Review", "Verified", "Revisit Required", "Flagged / Exception", "Closed / Cancelled"] as const;
export type SiteStatus = typeof SITE_STATUSES[number];
export type AttemptStatus = "Not started" | "In progress" | "Submitted" | "Accepted" | "Rejected";
export type ExceptionStatus = "Open" | "Investigating" | "Awaiting revisit" | "Resolved" | "Closed";
export type Region = "Riyadh" | "Makkah" | "Eastern Province" | "Madinah" | "Asir";
export type Category = "Grocery" | "Pharmacy" | "Café" | "Restaurant" | "Convenience" | "Electronics";

export interface AuditEvent { id: string; at: string; actor: string; action: string; detail: string }
export interface Site {
  id: string; merchant: string; region: Region; city: string; category: Category;
  status: SiteStatus; driverId?: string; lat: number; lng: number; updatedAt: string;
  address: string; attemptStatus: AttemptStatus; audit: AuditEvent[];
}
export interface Driver {
  id: string; name: string; mobile: string; email: string; region: Region;
  active: boolean; available: boolean; assignedCount: number; workloadLimit: number;
}
export interface Notification { id: string; type: "assignment" | "review" | "exception" | "revisit" | "approval"; title: string; detail: string; at: string; read: boolean }

export const allowedTransitions: Record<SiteStatus, readonly SiteStatus[]> = {
  "Unassigned": ["Assigned", "Closed / Cancelled"],
  "Assigned": ["Unassigned", "In Progress", "Closed / Cancelled"],
  "In Progress": ["Under Review", "Revisit Required", "Flagged / Exception"],
  "Under Review": ["Verified", "Revisit Required", "Flagged / Exception"],
  "Verified": ["Flagged / Exception", "Closed / Cancelled"],
  "Revisit Required": ["Assigned", "In Progress", "Closed / Cancelled"],
  "Flagged / Exception": ["Assigned", "Revisit Required", "Verified", "Closed / Cancelled"],
  "Closed / Cancelled": [],
};

export function canTransition(from: SiteStatus, to: SiteStatus) { return allowedTransitions[from].includes(to); }
export function transitionSite(site: Site, to: SiteStatus, actor = "Operations admin", detail = "Status updated"): Site {
  if (!canTransition(site.status, to)) throw new Error(`Invalid site transition: ${site.status} → ${to}`);
  return { ...site, status: to, updatedAt: new Date().toISOString(), audit: [{ id: `evt-${Date.now()}`, at: new Date().toISOString(), actor, action: `Changed status to ${to}`, detail }, ...site.audit] };
}
export function canAssign(site: Site, driver: Driver) {
  return site.status !== "Under Review" && site.status !== "Verified" && site.status !== "Closed / Cancelled" && driver.active && driver.available && driver.region === site.region && driver.assignedCount < driver.workloadLimit;
}
