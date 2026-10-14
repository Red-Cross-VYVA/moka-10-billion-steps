import type { SupabaseClient } from "@supabase/supabase-js";
import type { Driver, Site } from "@/domain/model";

export type GisSite = {
  site_id: string;
  site_code: string;
  merchant: string;
  address: string | null;
  region: string;
  city: string;
  category: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  updated_at: string;
  driver_id: string | null;
  driver_name: string | null;
  driver_code: string | null;
  photo_count: number;
  visit_count: number;
  exception_count: number;
  latest_submission: string | null;
  gps_deviation: number | null;
};
export type Contact = {
  name: string | null;
  phone: string | null;
  email: string | null;
};
export type Evidence = {
  id: string;
  attempt_id: string;
  kind: string;
  object_path: string;
  created_at: string;
};
export type Photo = Evidence & { originalPath?: string; signedUrl?: string };
export type Profile = {
  assignments: {
    id: string;
    driver_name: string;
    assigned_at: string;
    ended_at: string | null;
    reason: string | null;
  }[];
  address: string | null;
  can_edit_contact: boolean;
  contact: Contact | null;
  attempts: {
    id: string;
    attempt_number: number;
    status: string;
    submitted_at: string | null;
    notes: string | null;
    created_at: string;
  }[];
  evidence: Evidence[];
  decisions: {
    attempt_id: string;
    decision: string;
    reason_code: string | null;
    notes: string | null;
    created_at: string;
  }[];
  activity: {
    id: string;
    action: string;
    detail: string | null;
    actor_id: string | null;
    created_at: string;
  }[];
  exceptions: {
    id: string;
    status: string;
    reason: string;
    created_at: string;
  }[];
};
export type Bounds = [number, number, number, number];
export type Filters = {
  q: string;
  region: string;
  city: string;
  category: string;
  status: string;
  driver: string;
  photos: string;
};
export const emptyFilters: Filters = {
  q: "",
  region: "",
  city: "",
  category: "",
  status: "",
  driver: "",
  photos: "",
};
export type ScanMetrics = {
  state: "not_connected" | "connected";
  total: number | null;
  lastScanAt: string | null;
};
export const scans: ScanMetrics = {
  state: "not_connected",
  total: null,
  lastScanAt: null,
} as const;

export function validLocation(site: GisSite) {
  return (
    site.latitude !== null &&
    site.longitude !== null &&
    Number.isFinite(site.latitude) &&
    Number.isFinite(site.longitude) &&
    Math.abs(site.latitude) <= 90 &&
    Math.abs(site.longitude) <= 180
  );
}
export function inBounds(site: GisSite, [west, south, east, north]: Bounds) {
  if (!validLocation(site)) return false;
  const normalize = (longitude: number) =>
    ((((longitude + 180) % 360) + 360) % 360) - 180;
  const lon = normalize(site.longitude!);
  const span = east - west;
  west = normalize(west);
  east = normalize(east);
  return (
    site.latitude! >= south &&
    site.latitude! <= north &&
    (span >= 360 ||
      (west <= east ? lon >= west && lon <= east : lon >= west || lon <= east))
  );
}
export function filterSites(
  sites: GisSite[],
  filters: Filters,
  bounds?: Bounds,
) {
  const needle = filters.q.trim().toLocaleLowerCase();
  return sites.filter(
    (s) =>
      (!needle ||
        `${s.site_code} ${s.merchant} ${s.address ?? ""}`
          .toLocaleLowerCase()
          .includes(needle)) &&
      (!filters.region || s.region === filters.region) &&
      (!filters.city || s.city === filters.city) &&
      (!filters.category || s.category === filters.category) &&
      (!filters.status || s.status === filters.status) &&
      (!filters.driver ||
        (filters.driver === "unassigned"
          ? !s.driver_id
          : s.driver_id === filters.driver)) &&
      (!filters.photos ||
        (filters.photos === "yes" ? s.photo_count > 0 : s.photo_count === 0)) &&
      (!bounds || inBounds(s, bounds)),
  );
}
export function logicalPhotos(evidence: Evidence[]): Photo[] {
  const groups = new Map<string, Photo>();
  for (const row of evidence) {
    const variant = row.object_path.match(/\/(original|stamped)\.[^/]+$/);
    const key = variant
      ? row.object_path.replace(/\/(original|stamped)\.[^/]+$/, "")
      : row.id;
    const previous = groups.get(key);
    if (!previous)
      groups.set(key, {
        ...row,
        ...(variant?.[1] === "original"
          ? { originalPath: row.object_path }
          : {}),
      });
    else if (variant?.[1] === "stamped")
      groups.set(key, { ...row, originalPath: previous.originalPath });
    else if (variant?.[1] === "original")
      previous.originalPath = row.object_path;
  }
  return [...groups.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}
export async function collectPages(
  fetchPage: (after: string | null) => Promise<GisSite[]>,
  size = 500,
) {
  const result: GisSite[] = [];
  let after: string | null = null;
  while (true) {
    const rows = await fetchPage(after);
    result.push(...rows);
    if (rows.length < size) return result;
    const next = rows.at(-1)!.site_id;
    if (next === after) throw new Error("Site pagination did not advance.");
    after = next;
  }
}
export async function loadSummaries(
  client: SupabaseClient,
): Promise<GisSite[]> {
  return collectPages(async (after) => {
    const { data, error } = await client.rpc("gis_site_summaries", {
      p_after: after,
      p_limit: 500,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map((s: GisSite) => ({
      ...s,
      latitude: s.latitude === null ? null : Number(s.latitude),
      longitude: s.longitude === null ? null : Number(s.longitude),
      photo_count: Number(s.photo_count),
      visit_count: Number(s.visit_count),
      exception_count: Number(s.exception_count),
      gps_deviation: s.gps_deviation === null ? null : Number(s.gps_deviation),
    }));
  });
}
export async function loadProfile(
  client: SupabaseClient,
  id: string,
): Promise<Profile> {
  const { data, error } = await client.rpc("gis_site_profile", {
    p_site_id: id,
  });
  if (error) throw new Error(error.message);
  return data as Profile;
}
export async function signPhotos(client: SupabaseClient, photos: Photo[]) {
  if (!photos.length) return photos;
  const { data, error } = await client.storage
    .from("site-evidence")
    .createSignedUrls(
      photos.map((p) => p.object_path),
      900,
    );
  if (error) throw new Error(error.message);
  if (data?.some((p) => p.error || !p.signedUrl))
    throw new Error(
      "Some private photos could not be loaded. Refresh photos to retry.",
    );
  return photos.map((p, i) => ({
    ...p,
    signedUrl: data?.[i]?.signedUrl || undefined,
  }));
}
const statusCodes: Record<string, string> = {
  Unassigned: "unassigned",
  Assigned: "assigned",
  "In Progress": "in_progress",
  "Under Review": "under_review",
  Verified: "verified",
  "Revisit Required": "revisit_required",
  "Flagged / Exception": "flagged_exception",
  "Closed / Cancelled": "closed_cancelled",
};
export function demoSummaries(sites: Site[], drivers: Driver[]): GisSite[] {
  const lookup = new Map(drivers.map((d) => [d.id, d]));
  return sites.map((s) => ({
    site_id: s.id,
    site_code: s.id,
    merchant: s.merchant,
    address: s.address ?? null,
    region: s.region,
    city: s.city,
    category: s.category,
    status: statusCodes[s.status],
    latitude: s.lat,
    longitude: s.lng,
    updated_at: s.updatedAt,
    driver_id: s.driverId ?? null,
    driver_name: lookup.get(s.driverId ?? "")?.name ?? null,
    driver_code: lookup.get(s.driverId ?? "")?.code ?? null,
    photo_count: s.evidence?.length ?? 0,
    visit_count: s.visitAttempts.length,
    exception_count:
      s.exceptionStatus && !["Resolved", "Closed"].includes(s.exceptionStatus)
        ? 1
        : 0,
    latest_submission:
      s.visitAttempts.find((a) => a.submittedAt)?.submittedAt ?? null,
    gps_deviation: s.gpsProximityMetres ?? null,
  }));
}
export function demoProfile(site: Site): Profile {
  return {
    assignments: [],
    address: site.address ?? null,
    can_edit_contact: false,
    contact: null,
    attempts: site.visitAttempts.map((a, i) => ({
      id: a.id,
      attempt_number: i + 1,
      status: a.status,
      submitted_at: a.submittedAt ?? null,
      notes: null,
      created_at: a.submittedAt ?? site.updatedAt,
    })),
    evidence: [],
    decisions: [],
    exceptions: [],
    activity: site.audit.map((a) => ({
      id: a.id,
      action: a.action,
      detail: a.detail,
      actor_id: a.actor,
      created_at: a.at,
    })),
  };
}
export function exportCsv(sites: GisSite[]) {
  const quote = (value: unknown) => {
    let s = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [
      [
        "site_code",
        "merchant",
        "address",
        "region",
        "city",
        "category",
        "status",
        "latitude",
        "longitude",
        "driver",
        "photo_count",
        "visit_count",
        "open_exceptions",
        "customer_scans",
        "latest_submission",
        "gps_deviation_metres",
        "updated_at",
      ],
      ...sites.map((s) => [
        s.site_code,
        s.merchant,
        s.address,
        s.region,
        s.city,
        s.category,
        s.status,
        s.latitude,
        s.longitude,
        s.driver_name,
        s.photo_count,
        s.visit_count,
        s.exception_count,
        "Not connected",
        s.latest_submission,
        s.gps_deviation,
        s.updated_at,
      ]),
    ]
      .map((row) => row.map(quote).join(","))
      .join("\r\n")
  );
}
