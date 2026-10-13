import { describe, expect, it } from "vitest";
import { canAssign, canTransition, transitionSite, type Driver, type Site } from "./model";
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
  const driver: Driver = { id:"D", name:"Demo", mobile:"", email:"", region:"Riyadh", active:true, available:true, assignedCount:4, workloadLimit:5 };
  const site = { ...generateSites(1)[0], region:"Riyadh", status:"Unassigned" } as Site;
  it("requires matching region and capacity", () => expect(canAssign(site,driver)).toBe(true));
  it("locks sites under review", () => expect(canAssign({...site,status:"Under Review"},driver)).toBe(false));
  it("rejects an unavailable driver", () => expect(canAssign(site,{...driver,available:false})).toBe(false));
});
