import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  registerLiveDriver,
  validateDriver,
  type DriverDraft,
  type DriverRegion,
} from "./driver-registration";

const regions: DriverRegion[] = [
  {
    id: "region-1",
    name: "Riyadh",
    organizationId: "org-1",
    organizationName: "Operations",
  },
];
const draft: DriverDraft = {
  code: " DRV-003 ",
  name: " Real Driver ",
  regionId: "region-1",
  mobile: " +966 50 111 2222 ",
  email: " driver@example.invalid ",
};
const persisted = {
  id: "driver-uuid",
  driver_code: "DRV-003",
  full_name: "Real Driver",
  mobile: "+966 50 111 2222",
  email: "driver@example.invalid",
  user_id: null,
  active: true,
  available: true,
};
function clientFor(result: {
  data: typeof persisted | null;
  error: { code: string } | null;
}) {
  const insert = vi.fn(() => ({
    select: () => ({ single: async () => result }),
  }));
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as unknown as SupabaseClient, insert, from };
}
describe("driver registration", () => {
  it("requires a real code/name and an authorized region", () => {
    expect(
      validateDriver(
        { ...draft, code: " ", name: " ", regionId: "foreign-region" },
        regions,
      ),
    ).toEqual({
      code: "Driver code is required.",
      name: "Full name is required.",
      regionId: "Choose an available region.",
    });
  });
  it("accepts empty optional contacts but rejects malformed email", () => {
    expect(
      validateDriver({ ...draft, mobile: "", email: "" }, regions),
    ).toEqual({});
    expect(
      validateDriver({ ...draft, email: "wrong@" }, regions).email,
    ).toBeDefined();
  });
  it("persists entered contacts and region ownership instead of demo placeholders", async () => {
    const { client, insert, from } = clientFor({
      data: persisted,
      error: null,
    });
    const driver = await registerLiveDriver(client, draft, regions);
    expect(from).toHaveBeenCalledWith("drivers");
    expect(insert).toHaveBeenCalledWith({
      organization_id: "org-1",
      region_id: "region-1",
      driver_code: "DRV-003",
      full_name: "Real Driver",
      mobile: "+966 50 111 2222",
      email: "driver@example.invalid",
      active: true,
      available: true,
    });
    expect(driver).toMatchObject({
      id: "driver-uuid",
      name: "Real Driver",
      mobile: "+966 50 111 2222",
      email: "driver@example.invalid",
      region: "Riyadh",
      signInLinked: false,
    });
  });
  it("does not write invalid input", async () => {
    const { client, insert } = clientFor({ data: persisted, error: null });
    await expect(
      registerLiveDriver(
        client,
        { ...draft, regionId: "foreign-region" },
        regions,
      ),
    ).rejects.toThrow("Choose an available region.");
    expect(insert).not.toHaveBeenCalled();
  });
  it.each([
    { code: "23505", expected: "already exists" },
    { code: "42501", expected: "permission" },
    { code: "NETWORK", expected: "could not be saved" },
  ])("reports $code without returning success", async ({ code, expected }) => {
    const { client } = clientFor({ data: null, error: { code } });
    await expect(registerLiveDriver(client, draft, regions)).rejects.toThrow(
      expected,
    );
  });
  it("stores omitted contact fields as null", async () => {
    const { client, insert } = clientFor({ data: persisted, error: null });
    await registerLiveDriver(
      client,
      { ...draft, mobile: " ", email: " " },
      regions,
    );
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ mobile: null, email: null }));
  });
});
