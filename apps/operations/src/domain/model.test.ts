import { describe, expect, it } from "vitest";
import { assignSites, canAssign, canTransition, createSite, decideReview, validateSiteDraft, workloadForDriver, transitionSite, type Driver, type Site } from "./model";
import { generateSites } from "../data/fixtures";

describe("status transitions", () => {
  it("allows submitted evidence to be verified", () => expect(canTransition("Under Review", "Verified")).toBe(true));
  it("prevents verified sites from returning directly to assigned", () => expect(canTransition("Verified", "Assigned")).toBe(false));
  it("throws when an invalid transition is attempted", () => {
    const site = { ...generateSites(1)[0], status: "Verified" } as Site;
    expect(() => transitionSite(site, "Assigned")).toThrow(/Invalid site transition/);
  });
});

describe("assignment eligibility", () => {
  const driver: Driver = { id:"D", name:"Demo", mobile:"", email:"", region:"Riyadh", active:true, available:true };
  const site = { ...generateSites(1)[0], region:"Riyadh", status:"Unassigned" } as Site;
  it("requires matching region and capacity", () => expect(canAssign(site,driver)).toBe(true));
  it("locks sites under review", () => expect(canAssign({...site,status:"Under Review"},driver)).toBe(false));
  it("rejects an unavailable driver", () => expect(canAssign(site,{...driver,available:false})).toBe(false));
});

describe("site creation",()=>{
  const draft={id:"KSA-NEW",merchant:"New merchant",region:"Riyadh" as const,city:"Riyadh",category:"Grocery" as const,lat:24.7,lng:46.6,address:"Optional address"};
  it("creates a clean unassigned site without inherited history",()=>{const site=createSite(draft,[] ,"2026-10-13T10:00:00Z");expect(site.status).toBe("Unassigned");expect(site.driverId).toBeUndefined();expect(site.visitAttempts).toEqual([]);expect(site.audit).toHaveLength(1)});
  it("reports duplicate IDs and malformed coordinates",()=>{expect(validateSiteDraft({...draft,lat:120},["KSA-NEW"])).toMatchObject({id:expect.any(String),lat:expect.any(String)})});
});

describe("assignment and derived workload",()=>{
  const base=generateSites(4).map(site=>({...site,region:"Riyadh" as const,status:"Unassigned" as const,driverId:undefined}));
  const first:Driver={id:"D1",name:"First",mobile:"",email:"",region:"Riyadh",active:true,available:true};
  const second:Driver={...first,id:"D2",name:"Second"};
  it("assigns and reassigns while deriving both workloads from sites",()=>{const assigned=assignSites(base,[base[0].id,base[1].id],first,"2026-10-13T10:00:00Z").sites;expect(workloadForDriver(assigned,"D1")).toBe(2);const reassigned=assignSites(assigned,[base[0].id],second,"2026-10-13T11:00:00Z").sites;expect(workloadForDriver(reassigned,"D1")).toBe(1);expect(workloadForDriver(reassigned,"D2")).toBe(1);expect(reassigned[0].audit[0].detail).toContain("D1")});
  it("skips locked statuses",()=>{const locked={...base[0],status:"Under Review" as const};const result=assignSites([locked],[locked.id],first);expect(result.assigned).toBe(0);expect(result.skipped).toBe(1)});
  it("does not duplicate assignment to the same driver",()=>{const once=assignSites(base,[base[0].id],first,"2026-10-13T10:00:00Z").sites;const twice=assignSites(once,[base[0].id],first,"2026-10-13T11:00:00Z");expect(twice.assigned).toBe(0);expect(twice.sites[0].audit).toHaveLength(once[0].audit.length)});
});

describe("review history",()=>{
  it("preserves attempts and prevents a duplicate decision",()=>{const site={...generateSites(20).find(item=>item.status==="Under Review")!};const decided=decideReview(site,"Verified","Approved","2026-10-13T12:00:00Z");expect(decided.visitAttempts).toHaveLength(site.visitAttempts.length);expect(decided.visitAttempts[0].status).toBe("Accepted");expect(()=>decideReview(decided,"Verified","Again")).toThrow(/Only sites under review/)});
});
