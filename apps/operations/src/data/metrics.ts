import type { Site } from "@/domain/model";
export function kpis(sites: Site[]) {
  const count = (status: Site["status"]) => sites.filter(s => s.status === status).length;
  return { total: sites.length, unassigned: count("Unassigned"), assigned: count("Assigned") + count("In Progress"), underReview: count("Under Review"), verified: count("Verified"), flagged: count("Flagged / Exception"), revisit: count("Revisit Required") };
}
export function filterSites(sites: Site[], q: string) { const n = q.trim().toLowerCase(); return n ? sites.filter(s => s.id.toLowerCase().includes(n) || s.merchant.toLowerCase().includes(n)) : sites; }
export function validateImport(headers: string[]) { const required = ["site_id", "merchant_name", "region", "city", "category", "latitude", "longitude"]; return required.filter(h => !headers.map(x=>x.trim().toLowerCase()).includes(h)); }
