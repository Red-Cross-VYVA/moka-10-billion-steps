import type { SupabaseClient } from "@supabase/supabase-js";
import type { Driver } from "@/domain/model";

export type DriverRegion = {
  id: string;
  organizationId: string;
  name: string;
  organizationName: string;
};
export type DriverDraft = {
  code: string;
  name: string;
  regionId: string;
  mobile: string;
  email: string;
};
export type DriverErrors = Partial<Record<keyof DriverDraft, string>>;

export function validateDriver(
  draft: DriverDraft,
  regions: DriverRegion[],
): DriverErrors {
  const errors: DriverErrors = {};
  if (!draft.code.trim()) errors.code = "Driver code is required.";
  else if (draft.code.trim().length > 50)
    errors.code = "Use at most 50 characters.";
  if (!draft.name.trim()) errors.name = "Full name is required.";
  else if (draft.name.trim().length > 200)
    errors.name = "Use at most 200 characters.";
  if (!regions.some((region) => region.id === draft.regionId))
    errors.regionId = "Choose an available region.";
  if (draft.mobile.trim().length > 60)
    errors.mobile = "Use at most 60 characters.";
  if (
    draft.email.trim() &&
    (draft.email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))
  )
    errors.email = "Enter a valid email address.";
  return errors;
}

export async function loadDriverRegions(
  client: SupabaseClient,
): Promise<DriverRegion[]> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) throw new Error("Sign in to register a driver.");
  const { data: memberships, error: memberError } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .in("role", ["admin", "operator"]);
  if (memberError)
    throw new Error(
      "Unable to check driver registration permissions. Try again.",
    );
  const organizations = [
    ...new Set((memberships ?? []).map((row) => row.organization_id as string)),
  ];
  if (!organizations.length) return [];
  const { data, error } = await client
    .from("regions")
    .select("id,name_en,organization_id,organization:organizations(name)")
    .in("organization_id", organizations)
    .eq("active", true)
    .order("name_en");
  if (error) throw new Error("Unable to load available regions. Try again.");
  return (data ?? []).map((row) => {
    const organization = Array.isArray(row.organization)
      ? row.organization[0]
      : row.organization;
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name_en,
      organizationName: organization?.name ?? "",
    };
  });
}

export async function registerLiveDriver(
  client: SupabaseClient,
  draft: DriverDraft,
  regions: DriverRegion[],
): Promise<Driver> {
  const errors = validateDriver(draft, regions);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const region = regions.find((item) => item.id === draft.regionId)!;
  // Existing drivers_manage RLS restricts inserts to active admins/operators.
  // This creates a profile only; it never creates an account or sends an email.
  const { data, error } = await client
    .from("drivers")
    .insert({
      organization_id: region.organizationId,
      region_id: region.id,
      driver_code: draft.code.trim(),
      full_name: draft.name.trim(),
      mobile: draft.mobile.trim() || null,
      email: draft.email.trim() || null,
      active: true,
      available: true,
    })
    .select("id,driver_code,full_name,mobile,email,active,available,user_id")
    .single();
  if (error) {
    if (error.code === "23505")
      throw new Error(
        "This driver code already exists in the organization. Choose another code.",
      );
    if (error.code === "42501")
      throw new Error(
        "You no longer have permission to register drivers in this organization.",
      );
    throw new Error("The driver could not be saved. Please try again.");
  }
  if (!data)
    throw new Error("The driver could not be saved. Please try again.");
  return {
    id: data.id,
    code: data.driver_code,
    name: data.full_name,
    mobile: data.mobile ?? "—",
    email: data.email ?? "—",
    region: region.name as Driver["region"],
    active: data.active,
    available: data.available,
    signInLinked: Boolean(data.user_id),
  };
}
