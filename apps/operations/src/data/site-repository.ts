import type { Site, SiteDraft } from "@/domain/model";

export interface SiteRepository {
  list(): Promise<Site[]>;
  create(draft: SiteDraft): Promise<Site>;
  assign(siteCodes: string[], driverId: string, reason?: string): Promise<{ assigned: number; skipped: number }>;
  decideReview(siteCode: string, decision: "verified"|"revisit_required"|"flagged_exception", reason: string, notes?: string): Promise<string>;
}
