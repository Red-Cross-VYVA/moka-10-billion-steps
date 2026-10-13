import type { SupabaseClient } from "@supabase/supabase-js";
import type { Driver, Site, SiteDraft, SiteStatus } from "@/domain/model";

const siteStatuses: Record<string, SiteStatus> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  in_progress: "In Progress",
  under_review: "Under Review",
  verified: "Verified",
  revisit_required: "Revisit Required",
  flagged_exception: "Flagged / Exception",
  closed_cancelled: "Closed / Cancelled",
};

const attemptStatuses = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  accepted: "Accepted",
  rejected: "Rejected",
} as const;

type Relation = { name_en: string } | { name_en: string }[] | null;
type EvidenceRow = {
  id: string;
  kind: "installation_photo" | "close_up_photo" | "other";
  object_path: string;
};
type AttemptRow = {
  id: string;
  status: keyof typeof attemptStatuses;
  submitted_at: string | null;
  decided_at: string | null;
  gps_proximity_metres: number | null;
  evidence_files: EvidenceRow[] | null;
};

function relationName(value: Relation) {
  return Array.isArray(value) ? value[0]?.name_en : value?.name_en;
}

export async function loadLiveOperations(client: SupabaseClient) {
  const [
    { data: driverRows, error: driverError },
    { data: siteRows, error: siteError },
  ] = await Promise.all([
    client
      .from("drivers")
      .select("*, region:regions!drivers_region_id_fkey(name_en)")
      .order("driver_code"),
    client
      .from("sites")
      .select(
        `
      *,
      region:regions!sites_region_id_fkey(name_en),
      city:cities!sites_city_id_fkey(name_en),
      category:merchant_categories!sites_category_id_fkey(name_en),
      visit_attempts(id,status,submitted_at,decided_at,gps_proximity_metres,evidence_files(id,kind,object_path)),
      audit_events(id,created_at,action,detail,actor_id)
    `,
      )
      .order("site_code"),
  ]);
  if (driverError) throw driverError;
  if (siteError) throw siteError;

  const drivers: Driver[] = (driverRows ?? []).map((row) => ({
    id: row.id,
    code: row.driver_code,
    name: row.full_name,
    mobile: row.mobile ?? "—",
    email: row.email ?? "—",
    region: relationName(row.region as Relation) as Driver["region"],
    active: row.active,
    available: row.available,
  }));

  const sites = await Promise.all(
    (siteRows ?? []).map(async (row): Promise<Site> => {
      const attempts = ((row.visit_attempts ?? []) as AttemptRow[]).sort(
        (a, b) =>
          Date.parse(b.submitted_at ?? "1970-01-01") -
          Date.parse(a.submitted_at ?? "1970-01-01"),
      );
      const evidenceRows = attempts[0]?.evidence_files ?? [];
      const evidence = await Promise.all(
        evidenceRows.map(async (item) => {
          const { data } = await client.storage
            .from("site-evidence")
            .createSignedUrl(item.object_path, 3600);
          return {
            id: item.id,
            kind: item.kind,
            signedUrl: data?.signedUrl ?? "",
          };
        }),
      );
      return {
        id: row.site_code,
        merchant: row.merchant_name,
        region: relationName(row.region as Relation) as Site["region"],
        city: relationName(row.city as Relation) ?? "—",
        category: relationName(row.category as Relation) as Site["category"],
        status: siteStatuses[row.status],
        driverId: row.assigned_driver_id ?? undefined,
        lat: Number(row.latitude),
        lng: Number(row.longitude),
        updatedAt: row.updated_at,
        address: row.address ?? undefined,
        attemptStatus: attempts[0]
          ? attemptStatuses[attempts[0].status]
          : "Not started",
        gpsProximityMetres: attempts[0]?.gps_proximity_metres ?? undefined,
        evidence,
        visitAttempts: attempts.map((attempt) => ({
          id: attempt.id,
          status: attemptStatuses[attempt.status],
          submittedAt: attempt.submitted_at ?? undefined,
          decidedAt: attempt.decided_at ?? undefined,
        })),
        audit: (row.audit_events ?? []).map(
          (event: {
            id: string;
            created_at: string;
            action: string;
            detail: string | null;
            actor_id: string | null;
          }) => ({
            id: event.id,
            at: event.created_at,
            actor: event.actor_id ?? "System",
            action: event.action.replaceAll("_", " "),
            detail: event.detail ?? "Hosted Supabase workflow",
          }),
        ),
      };
    }),
  );
  return { sites, drivers };
}

export async function assignLiveSites(
  client: SupabaseClient,
  siteCodes: string[],
  driverId: string,
) {
  const { data, error } = await client.rpc("assign_sites", {
    p_site_codes: siteCodes,
    p_driver_id: driverId,
    p_reason: "Assigned from Operations Dashboard",
  });
  if (error) throw error;
  return data?.[0] ?? { assigned: 0, skipped: siteCodes.length };
}

export async function decideLiveReview(
  client: SupabaseClient,
  siteCode: string,
  decision: "Verified" | "Revisit Required" | "Flagged / Exception",
  reason: string,
) {
  const values = {
    Verified: "verified",
    "Revisit Required": "revisit_required",
    "Flagged / Exception": "flagged_exception",
  } as const;
  const { error } = await client.rpc("decide_site_review", {
    p_site_code: siteCode,
    p_decision: values[decision],
    p_reason_code: reason,
    p_notes: reason,
  });
  if (error) throw error;
}

export async function createLiveSite(client: SupabaseClient, draft: SiteDraft) {
  const [{ data: region }, { data: category }] = await Promise.all([
    client
      .from("regions")
      .select("id,organization_id")
      .eq("name_en", draft.region)
      .single(),
    client
      .from("merchant_categories")
      .select("id")
      .eq("name_en", draft.category)
      .single(),
  ]);
  if (!region || !category) throw new Error("Reference data was not found.");
  const { data: city } = await client
    .from("cities")
    .select("id")
    .eq("region_id", region.id)
    .eq("name_en", draft.city)
    .single();
  if (!city) throw new Error("City reference was not found.");
  const { error } = await client.from("sites").insert({
    organization_id: region.organization_id,
    site_code: draft.id,
    merchant_name: draft.merchant,
    address: draft.address,
    region_id: region.id,
    city_id: city.id,
    category_id: category.id,
    latitude: draft.lat,
    longitude: draft.lng,
  });
  if (error) throw error;
}

export async function updateLiveDriver(
  client: SupabaseClient,
  id: string,
  values: { active?: boolean; available?: boolean },
) {
  const { error } = await client.from("drivers").update(values).eq("id", id);
  if (error) throw error;
}

export async function updateLiveSiteStatus(
  client: SupabaseClient,
  siteCode: string,
  status: SiteStatus,
) {
  const values: Record<SiteStatus, string> = {
    Unassigned: "unassigned",
    Assigned: "assigned",
    "In Progress": "in_progress",
    "Under Review": "under_review",
    Verified: "verified",
    "Revisit Required": "revisit_required",
    "Flagged / Exception": "flagged_exception",
    "Closed / Cancelled": "closed_cancelled",
  };
  const { error } = await client
    .from("sites")
    .update({ status: values[status] })
    .eq("site_code", siteCode);
  if (error) throw error;
}
