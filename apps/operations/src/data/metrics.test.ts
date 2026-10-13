import { describe, expect, it } from "vitest";
import { generateSites } from "./fixtures";
import { applySiteFilters, filterSites, kpis } from "./metrics";

describe("fixtures and metrics", () => {
  const sites = generateSites(10000);
  it("generates 10,000 unique deterministic records", () => {
    expect(sites).toHaveLength(10000);
    expect(new Set(sites.map(s=>s.id)).size).toBe(10000);
    expect(generateSites(3).map(s=>s.merchant)).toEqual(sites.slice(0,3).map(s=>s.merchant));
  });
  it("reconciles headline KPI counts", () => {
    const m=kpis(sites);
    expect(m.unassigned+m.assigned+m.underReview+m.verified+m.flagged+m.revisit+sites.filter(s=>s.status==="Closed / Cancelled").length).toBe(10000);
  });
  it("filters by site ID and merchant", () => {
    expect(filterSites(sites,"KSA-00001")).toHaveLength(1);
    expect(filterSites(sites,sites[0].merchant)).toContain(sites[0]);
  });
  it("applies combined filters without changing source counts", () => {const filtered=applySiteFilters(sites,{region:"Riyadh",status:"Verified",category:"Grocery"});expect(filtered.every(site=>site.region==="Riyadh"&&site.status==="Verified"&&site.category==="Grocery")).toBe(true);expect(kpis(sites).total).toBe(10000)});
});
