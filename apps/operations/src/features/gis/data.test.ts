import { describe, expect, it, vi } from "vitest";
import {
  collectPages,
  emptyFilters,
  exportCsv,
  filterSites,
  inBounds,
  logicalPhotos,
  signPhotos,
  type GisSite,
  type Evidence,
} from "./data";
import type { SupabaseClient } from "@supabase/supabase-js";

const site = (i: number): GisSite => ({
  site_id: String(i).padStart(6, "0"),
  site_code: `SITE-${i}`,
  merchant: `Merchant ${i}`,
  address: "King Road",
  region: "Riyadh",
  city: "Riyadh",
  category: "Cafe",
  status: "assigned",
  latitude: 24,
  longitude: 46,
  updated_at: "2026-10-15",
  driver_id: "d1",
  driver_name: "Driver",
  driver_code: "D1",
  photo_count: 2,
  visit_count: 1,
  exception_count: 0,
  latest_submission: null,
  gps_deviation: null,
});
describe("GIS summaries", () => {
  it.each([0, 1001, 10000])(
    "loads every row with stable pagination (%i sites)",
    async (count) => {
      const all = Array.from({ length: count }, (_, i) => site(i));
      const page = vi.fn(async (after: string | null) =>
        all.filter((s) => after === null || s.site_id > after).slice(0, 500),
      );
      expect(await collectPages(page)).toEqual(all);
      expect(page).toHaveBeenCalledTimes(Math.floor(count / 500) + 1);
    },
  );
  it("rejects a cursor that stops advancing", async () => {
    await expect(collectPages(async () => [site(1)], 1)).rejects.toThrow(
      "did not advance",
    );
  });
  it("combines address search with filters and bounds", () => {
    const rows = [
      site(1),
      { ...site(2), photo_count: 0 },
      { ...site(3), driver_id: null },
      { ...site(4), latitude: 12 },
    ];
    const filters = {
      ...emptyFilters,
      q: "KING road",
      region: "Riyadh",
      city: "Riyadh",
      category: "Cafe",
      status: "assigned",
      driver: "d1",
      photos: "yes",
    };
    expect(
      filterSites(rows, filters, [40, 20, 50, 30]).map((s) => s.site_id),
    ).toEqual([site(1).site_id]);
    expect(
      filterSites(rows, { ...emptyFilters, driver: "unassigned" }),
    ).toHaveLength(1);
    expect(filterSites(rows, { ...emptyFilters, photos: "no" })).toHaveLength(
      1,
    );
  });
  it("handles missing coordinates and a viewport crossing the dateline", () => {
    expect(inBounds({ ...site(1), latitude: null }, [-180, -90, 180, 90])).toBe(
      false,
    );
    expect(inBounds({ ...site(1), longitude: 179 }, [170, -90, -170, 90])).toBe(
      true,
    );
    expect(inBounds(site(1), [170, -90, -170, 90])).toBe(false);
    expect(inBounds({...site(1),longitude:-179},[170,-90,190,90])).toBe(true);
    expect(inBounds(site(1),[-180,-90,180,90])).toBe(true);
  });
  it("exports exactly the filtered summaries without URLs or fabricated scans", () => {
    const csv = exportCsv([
      { ...site(1), merchant: '=HYPERLINK("https://bad")' },
    ]);
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain('"Not connected"');
    expect(csv).toContain("\"'=HYPERLINK");
    expect(csv).not.toContain("signedUrl");
    expect(csv).not.toContain("object_path");
  });
});
describe("private logical photo captures", () => {
  const row = (id: string, path: string, attempt = "a1"): Evidence => ({
    id,
    object_path: path,
    attempt_id: attempt,
    kind: path.includes("stamped") ? "installation_photo" : "other",
    created_at: "2026-10-15",
  });
  const evidence = [
    row("o1", "org/site/a1/p1/original.jpg"),
    row("s1", "org/site/a1/p1/stamped.jpg"),
    row("s2", "org/site/a2/p1/stamped.jpg", "a2"),
    row("o2", "org/site/a2/p1/original.png", "a2"),
    row("legacy", "org/site/old.jpg"),
  ];
  it.each([[evidence], [[...evidence].reverse()]])(
    "counts original and stamped once across every attempt",
    (rows) => {
      const photos = logicalPhotos(rows);
      expect(photos).toHaveLength(3);
      expect(
        photos.filter((p) => p.object_path.endsWith("stamped.jpg")),
      ).toHaveLength(2);
      expect(photos.find((p) => p.id === "s1")?.originalPath).toBe(
        "org/site/a1/p1/original.jpg",
      );
    },
  );
  it("signs only selected captures and can renew expired access", async () => {
    const createSignedUrls = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ signedUrl: "first" }], error: null })
      .mockResolvedValueOnce({ data: [{ signedUrl: "renewed" }], error: null });
    const from = vi.fn(() => ({ createSignedUrls }));
    const client = { storage: { from } } as unknown as SupabaseClient;
    const photos = logicalPhotos(evidence).slice(0, 1);
    expect((await signPhotos(client, photos))[0].signedUrl).toBe("first");
    expect((await signPhotos(client, photos))[0].signedUrl).toBe("renewed");
    expect(createSignedUrls).toHaveBeenCalledWith([photos[0].object_path], 900);
    expect(from).toHaveBeenCalledWith("site-evidence");
  });
  it("reports inaccessible images instead of leaving a permanent loading placeholder",async()=>{
    const client={storage:{from:()=>({createSignedUrls:async()=>({data:[{error:"Object not found"}],error:null})})}} as unknown as SupabaseClient;
    await expect(signPhotos(client,logicalPhotos(evidence).slice(0,1))).rejects.toThrow("could not be loaded");
  });
});
