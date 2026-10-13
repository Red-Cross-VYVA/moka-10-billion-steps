import type { Site } from "@/domain/model";
export function kpis(sites: Site[]) {
  const count = (status: Site["status"]) => sites.filter(s => s.status === status).length;
  return { total: sites.length, unassigned: count("Unassigned"), assigned: count("Assigned") + count("In Progress"), underReview: count("Under Review"), verified: count("Verified"), flagged: count("Flagged / Exception"), revisit: count("Revisit Required") };
}
export function filterSites(sites: Site[], q: string) { const n = q.trim().toLowerCase(); return n ? sites.filter(s => s.id.toLowerCase().includes(n) || s.merchant.toLowerCase().includes(n)) : sites; }
export interface SiteFilters { q?:string; region?:string; city?:string; category?:string; status?:string; driverId?:string }
export function applySiteFilters(sites:Site[],filters:SiteFilters){return filterSites(sites,filters.q||"").filter(site=>(!filters.region||site.region===filters.region)&&(!filters.city||site.city===filters.city)&&(!filters.category||site.category===filters.category)&&(!filters.status||site.status===filters.status)&&(!filters.driverId||site.driverId===filters.driverId))}
