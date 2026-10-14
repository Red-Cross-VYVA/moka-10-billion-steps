"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowUpRight,
  Camera,
  Download,
  Layers,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Driver, Site } from "@/domain/model";
import type { Language } from "@/i18n/translations";
import {
  demoProfile,
  demoSummaries,
  emptyFilters,
  exportCsv,
  filterSites,
  inBounds,
  loadProfile,
  loadSummaries,
  logicalPhotos,
  scans,
  signPhotos,
  validLocation,
  type Bounds,
  type Contact,
  type Filters,
  type GisSite,
  type Photo,
  type Profile,
} from "./data";
import { tones, type Layer } from "./GisMap";
import "./gis.css";

const GisMap = dynamic(() => import("./GisMap"), {
  ssr: false,
  loading: () => <div className="gis-mapstage gis-empty">Loading map…</div>,
});
const statusNames: Record<string, [string, string]> = {
  unassigned: ["Unassigned", "غير معيّن"],
  assigned: ["Assigned", "معيّن"],
  in_progress: ["In progress", "قيد التنفيذ"],
  under_review: ["Under review", "قيد المراجعة"],
  verified: ["Verified", "تم التحقق"],
  revisit_required: ["Revisit required", "تجب إعادة الزيارة"],
  flagged_exception: ["Exception", "استثناء"],
  closed_cancelled: ["Closed / cancelled", "مغلق / ملغى"],
};
const activityNames: Record<string, [string, string]> = {
  accepted: ["Accepted", "مقبول"],
  rejected: ["Rejected", "مرفوض"],
  submitted: ["Submitted", "تم الإرسال"],
  approved: ["Approved", "تمت الموافقة"],
  revisit: ["Revisit requested", "طُلبت إعادة الزيارة"],
  draft: ["Draft", "مسودة"],
  open: ["Open", "مفتوح"],
  resolved: ["Resolved", "تم الحل"],
};
const labelStatus = (status: string, ar: boolean) =>
  (statusNames[status] ?? activityNames[status])?.[ar ? 1 : 0] ?? status;
function readBounds(
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
): Bounds | undefined {
  const value = params.get("bounds");
  if (!value) return;
  const b = value.split(",").map(Number);
  if (
    b.length === 4 &&
    b.every(Number.isFinite) &&
    b[1] >= -90 &&
    b[3] <= 90 &&
    b[1] <= b[3]
  )
    return b as Bounds;
}
type ReadonlyURLSearchParamsLike = { get: (key: string) => string | null };
const readFilters = (params: ReadonlyURLSearchParamsLike) =>
  Object.fromEntries(
    Object.keys(emptyFilters).map((key) => [key, params.get(key) ?? ""]),
  ) as Filters;

export default function GisWorkspace({
  language,
  liveMode,
  demoSites,
  demoDrivers,
}: {
  language: Language;
  liveMode: boolean;
  demoSites: Site[];
  demoDrivers: Driver[];
}) {
  const ar = language === "ar";
  const tx = (en: string, arabic: string) => (ar ? arabic : en);
  const params = useSearchParams();
  const query = params.toString();
  const [filters, setFilters] = useState<Filters>(() => readFilters(params));
  const [selected, setSelected] = useState(params.get("site") ?? "");
  const [layer, setLayer] = useState<Layer>(
    (["status", "density", "photos"].includes(params.get("layer") ?? "")
      ? params.get("layer")
      : "status") as Layer,
  );
  const [area, setArea] = useState(params.get("area") === "1");
  const [bounds, setBounds] = useState<Bounds | undefined>(() =>
    readBounds(params),
  );
  const [sites, setSites] = useState<GisSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [fit, setFit] = useState(0);
  const [mobileView, setMobileView] = useState("map");
  const [updated, setUpdated] = useState<Date>();
  const client = useMemo(() => (liveMode ? createClient() : null), [liveMode]);
  useEffect(() => {
    const p = new URLSearchParams(query);
    setFilters(readFilters(p));
    setSelected(p.get("site") ?? "");
    setLayer(
      (["status", "density", "photos"].includes(p.get("layer") ?? "")
        ? p.get("layer")
        : "status") as Layer,
    );
    setArea(p.get("area") === "1");
    if (p.has("bounds")) setBounds(readBounds(p));
  }, [query]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const task = client
      ? loadSummaries(client)
      : Promise.resolve(demoSummaries(demoSites, demoDrivers));
    task
      .then((rows) => {
        if (active) {
          setSites(rows);
          setUpdated(new Date());
        }
      })
      .catch((cause) => {
        if (active) {
          setSites([]);
          setError(
            cause instanceof Error ? cause.message : "GIS data unavailable",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, demoSites, demoDrivers, refresh]);
  const sync = (
    patch: {
      filters?: Filters;
      selected?: string;
      layer?: Layer;
      area?: boolean;
      bounds?: Bounds;
    } = {},
  ) => {
    const p = new URLSearchParams();
    const f = patch.filters ?? filters;
    for (const [key, value] of Object.entries(f)) if (value) p.set(key, value);
    const id = patch.selected ?? selected;
    if (id) p.set("site", id);
    const l = patch.layer ?? layer;
    if (l !== "status") p.set("layer", l);
    if (patch.area ?? area) {
      p.set("area", "1");
      const b = patch.bounds ?? bounds;
      if (b) p.set("bounds", b.map((n) => n.toFixed(5)).join(","));
    }
    window.history.replaceState(
      null,
      "",
      `/map${p.size ? "?" + p.toString() : ""}`,
    );
  };
  const select = useCallback((id: string) => {
    setSelected(id);
    const p = new URLSearchParams(window.location.search);
    if (id) p.set("site", id);
    else p.delete("site");
    window.history.replaceState(null, "", `/map${p.size ? "?" + p : ""}`);
  }, []);
  const change = (key: keyof Filters, value: string) => {
    const next = {
      ...filters,
      [key]: value,
      ...(key === "region" ? { city: "" } : {}),
    };
    setFilters(next);
    sync({ filters: next });
  };
  const onBounds = useCallback(
    (b: Bounds) => {
      setBounds(b);
      if (area) {
        const p = new URLSearchParams(window.location.search);
        p.set("bounds", b.map((n) => n.toFixed(5)).join(","));
        window.history.replaceState(null, "", `/map?${p}`);
      }
    },
    [area],
  );
  const matching = useMemo(() => filterSites(sites, filters), [sites, filters]);
  const shown = useMemo(
    () =>
      area && bounds ? matching.filter((s) => inBounds(s, bounds)) : matching,
    [matching, area, bounds],
  );
  const visible = bounds
    ? matching.filter((s) => inBounds(s, bounds)).length
    : 0;
  const activeSite = sites.find((s) => s.site_id === selected);
  const options = (key: "region" | "city" | "category") =>
    [
      ...new Set(
        sites
          .filter(
            (s) =>
              key !== "city" || !filters.region || s.region === filters.region,
          )
          .map((s) => s[key]),
      ),
    ].sort();
  const drivers = [
    ...new Map(
      sites
        .filter((s) => s.driver_id)
        .map((s) => [
          s.driver_id!,
          {
            id: s.driver_id!,
            name: s.driver_name ?? s.driver_code ?? s.driver_id!,
          },
        ]),
    ).values(),
  ];
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([exportCsv(shown)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "gis-sites.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section
      className="gis"
      dir={ar ? "rtl" : "ltr"}
      aria-label={tx("Site GIS workspace", "نظام المعلومات الجغرافية للمواقع")}
    >
      <header className="gis-heading">
        <div>
          <span className="gis-kicker">
            {tx("SITE INTELLIGENCE", "معلومات المواقع")}
          </span>
          <h2>{tx("Explore your network", "استكشف شبكة المواقع")}</h2>
          <p>
            {tx(
              "Every site. One geographic view.",
              "كل المواقع في عرض جغرافي واحد.",
            )}
          </p>
        </div>
        <div className="gis-heading-actions">
          <span className="gis-source">
            {liveMode
              ? tx("● Hosted site data", "● بيانات المواقع المستضافة")
              : tx("DEMO · Fictional sites", "عرض تجريبي · مواقع افتراضية")}
          </span>
          <button onClick={() => setRefresh((v) => v + 1)} disabled={loading}>
            <RefreshCw size={14} />
            {tx("Refresh", "تحديث")}
          </button>
          <button onClick={download} disabled={!shown.length || loading}>
            <Download size={14} />
            {tx("Export CSV", "تصدير CSV")}
          </button>
        </div>
      </header>
      <div
        className="gis-metrics"
        aria-label={tx("Filtered site indicators", "مؤشرات المواقع المصفاة")}
      >
        <Metric
          label={tx("Matching sites", "المواقع المطابقة")}
          value={shown.length}
        />
        <Metric
          label={tx("Verified", "تم التحقق")}
          value={shown.filter((s) => s.status === "verified").length}
        />
        <Metric
          label={tx("Open exceptions", "الاستثناءات المفتوحة")}
          value={shown.reduce((n, s) => n + s.exception_count, 0)}
        />
        <Metric
          label={tx("Photo captures", "الصور الملتقطة")}
          value={shown.reduce((n, s) => n + s.photo_count, 0)}
        />
        <Metric
          label={tx("Customer QR scans", "مسح QR للعملاء")}
          value={scans.total ?? tx("Not connected", "غير متصل")}
        />
      </div>
      <div className="gis-toolbar">
        <label className="gis-search">
          <Search size={16} />
          <input
            aria-label={tx("Search sites", "بحث المواقع")}
            placeholder={tx(
              "Search site, merchant or address…",
              "ابحث بالموقع أو التاجر أو العنوان…",
            )}
            value={filters.q}
            onChange={(e) => change("q", e.target.value)}
          />
        </label>
        {(["region", "city", "category"] as const).map((key) => (
          <select
            key={key}
            aria-label={tx(
              key,
              "تصفية " +
                { region: "المنطقة", city: "المدينة", category: "الفئة" }[key],
            )}
            value={filters[key]}
            onChange={(e) => change(key, e.target.value)}
          >
            <option value="">
              {
                {
                  region: tx("All regions", "كل المناطق"),
                  city: tx("All cities", "كل المدن"),
                  category: tx("All categories", "كل الفئات"),
                }[key]
              }
            </option>
            {options(key).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ))}
        <select
          aria-label={tx("Status", "الحالة")}
          value={filters.status}
          onChange={(e) => change("status", e.target.value)}
        >
          <option value="">{tx("All statuses", "كل الحالات")}</option>
          {Object.keys(statusNames).map((s) => (
            <option key={s} value={s}>
              {labelStatus(s, ar)}
            </option>
          ))}
        </select>
        <select
          aria-label={tx("Assigned driver", "السائق المعيّن")}
          value={filters.driver}
          onChange={(e) => change("driver", e.target.value)}
        >
          <option value="">{tx("All drivers", "كل السائقين")}</option>
          <option value="unassigned">
            {tx("No driver assigned", "غير معيّن")}
          </option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          aria-label={tx("Photo availability", "توفر الصور")}
          value={filters.photos}
          onChange={(e) => change("photos", e.target.value)}
        >
          <option value="">
            {tx("Any photo coverage", "كل مستويات تغطية الصور")}
          </option>
          <option value="yes">{tx("With photos", "مع صور")}</option>
          <option value="no">{tx("Without photos", "بلا صور")}</option>
        </select>
        <button
          onClick={() => {
            setFilters(emptyFilters);
            setArea(false);
            sync({ filters: emptyFilters, area: false });
          }}
        >
          {tx("Reset filters", "مسح المرشحات")}
        </button>
      </div>
      {error && (
        <div className="gis-alert" role="alert">
          {tx("GIS data could not load: ", "تعذر تحميل بيانات المواقع: ")}
          {error}
          <button onClick={() => setRefresh((v) => v + 1)}>
            {tx("Retry", "إعادة المحاولة")}
          </button>
        </div>
      )}
      {loading ? (
        <div className="gis-loading" role="status">
          <RefreshCw className="spin" />
          {tx(
            "Loading all authorized sites…",
            "جارٍ تحميل جميع المواقع المسموح بها…",
          )}
        </div>
      ) : (
        !error && (
          <>
            <div className="gis-viewbar">
              <div className="gis-mobile-switch">
                <button
                  aria-pressed={mobileView === "map"}
                  onClick={() => setMobileView("map")}
                >
                  {tx("Map", "الخريطة")}
                </button>
                <button
                  aria-pressed={mobileView === "list"}
                  onClick={() => setMobileView("list")}
                >
                  {tx("List", "القائمة")}
                </button>
              </div>
              <span>
                <b>{shown.length.toLocaleString(ar ? "ar-SA" : "en")}</b>{" "}
                {tx("matching", "مطابق")} ·{" "}
                <b>{visible.toLocaleString(ar ? "ar-SA" : "en")}</b>{" "}
                {tx("in map area", "في نطاق الخريطة")}
                {shown.some((s) => !validLocation(s)) &&
                  ` · ${shown.filter((s) => !validLocation(s)).length} ${tx("unmapped", "بلا إحداثيات")}`}
              </span>
              <small>
                {updated &&
                  tx("Updated ", "تم التحديث ") +
                    updated.toLocaleTimeString(ar ? "ar-SA" : "en-GB")}
              </small>
            </div>
            <div
              className={`gis-workspace gis-mobile-${mobileView}${activeSite ? " gis-has-profile" : ""}`}
            >
              <SiteList
                sites={shown}
                selected={selected}
                onSelect={select}
                ar={ar}
              />
              <div className="gis-mapwrap">
                <div className="gis-maptools">
                  <label>
                    <Layers size={14} />
                    <select
                      aria-label={tx("Map layer", "طبقة الخريطة")}
                      value={layer}
                      onChange={(e) => {
                        setLayer(e.target.value as Layer);
                        sync({ layer: e.target.value as Layer });
                      }}
                    >
                      <option value="status">
                        {tx("Activation status", "حالة التفعيل")}
                      </option>
                      <option value="density">
                        {tx("Site density", "كثافة المواقع")}
                      </option>
                      <option value="photos">
                        {tx("Photo coverage", "تغطية الصور")}
                      </option>
                    </select>
                  </label>
                  <button onClick={() => setFit((v) => v + 1)}>
                    <LocateFixed size={14} />
                    {tx("Fit results", "عرض النتائج")}
                  </button>
                  <label>
                    <input
                      type="checkbox"
                      checked={area}
                      disabled={!bounds}
                      onChange={(e) => {
                        setArea(e.target.checked);
                        sync({ area: e.target.checked });
                      }}
                    />
                    {tx("Search this area", "البحث في هذا النطاق")}
                  </label>
                </div>
                <GisMap
                  sites={shown}
                  selectedId={selected}
                  layer={layer}
                  fitVersion={fit}
                  onSelect={select}
                  onBounds={onBounds}
                  arabic={ar}
                  initialBounds={area ? readBounds(params) : undefined}
                />
                <div className="gis-legend">
                  {layer === "photos" ? (
                    <>
                      <span>
                        <i style={{ background: "#16876b" }} />
                        {tx("Has photos", "مع صور")}
                      </span>
                      <span>
                        <i style={{ background: "#b7c3d1" }} />
                        {tx("No photos", "بلا صور")}
                      </span>
                    </>
                  ) : layer === "density" ? (
                    <span>
                      {tx(
                        "Site density · low → high",
                        "كثافة المواقع · منخفضة ← مرتفعة",
                      )}
                    </span>
                  ) : (
                    Object.keys(tones).map((s) => (
                      <button
                        key={s}
                        aria-pressed={filters.status === s}
                        onClick={() =>
                          change("status", filters.status === s ? "" : s)
                        }
                      >
                        <i style={{ background: tones[s] }} />
                        {labelStatus(s, ar)}
                      </button>
                    ))
                  )}
                </div>
              </div>
              {activeSite && (
                <SiteProfile
                  key={activeSite.site_id}
                  site={activeSite}
                  client={client}
                  demo={demoSites.find((s) => s.id === activeSite.site_id)}
                  ar={ar}
                  onClose={() => select("")}
                />
              )}
            </div>
            {selected && !activeSite && (
              <div className="gis-alert" role="status">
                {tx(
                  "The selected site is unavailable or outside your access.",
                  "الموقع المحدد غير متاح أو خارج صلاحياتك.",
                )}
                <button onClick={() => select("")}>
                  {tx("Clear selection", "مسح التحديد")}
                </button>
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="gis-metric">
      <span>{label}</span>
      <strong>
        {typeof value === "number" ? value.toLocaleString() : value}
      </strong>
    </div>
  );
}
function SiteList({
  sites,
  selected,
  onSelect,
  ar,
}: {
  sites: GisSite[];
  selected: string;
  onSelect: (id: string) => void;
  ar: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);
  const rowHeight = 88;
  useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    const observer = new ResizeObserver(() => setHeight(node.clientHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = 0;
      setTop(0);
    }
  }, [sites]);
  useEffect(() => {
    const i = sites.findIndex((s) => s.site_id === selected);
    if (
      i >= 0 &&
      ref.current &&
      (i * rowHeight < ref.current.scrollTop ||
        i * rowHeight >
          ref.current.scrollTop + ref.current.clientHeight - rowHeight)
    )
      ref.current.scrollTop = i * rowHeight;
  }, [selected, sites]);
  const start = Math.max(0, Math.floor(top / rowHeight) - 3);
  const end = Math.min(sites.length, start + Math.ceil(height / rowHeight) + 7);
  return (
    <div
      className="gis-list"
      ref={ref}
      tabIndex={0}
      aria-label={
        ar
          ? "قائمة المواقع. استخدم مفاتيح الأسهم للتنقل."
          : "Site list. Use arrow keys to select sites."
      }
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      onKeyDown={(e) => {
        if (!["ArrowDown", "ArrowUp"].includes(e.key) || !sites.length) return;
        e.preventDefault();
        const i = sites.findIndex((s) => s.site_id === selected);
        onSelect(
          sites[
            Math.max(
              0,
              Math.min(sites.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)),
            )
          ].site_id,
        );
      }}
    >
      {!sites.length ? (
        <div className="gis-empty">
          <MapPin />
          <h3>{ar ? "لا توجد مواقع مطابقة" : "No matching sites"}</h3>
          <p>
            {ar
              ? "غيّر عوامل التصفية أو نطاق الخريطة."
              : "Try changing the filters or map area."}
          </p>
        </div>
      ) : (
        <div
          role="list"
          style={{ height: sites.length * rowHeight, position: "relative" }}
        >
          {sites.slice(start, end).map((s, i) => (
            <div
              role="listitem"
              key={s.site_id}
              style={{
                position: "absolute",
                insetInline: 0,
                top: (start + i) * rowHeight,
                height: rowHeight,
              }}
            >
              <button
                className="gis-site-row"
                aria-pressed={selected === s.site_id}
                onClick={() => onSelect(s.site_id)}
              >
                <i style={{ background: tones[s.status] }} />
                <span>
                  <small>
                    {s.site_code} · {s.city}
                  </small>
                  <b>{s.merchant}</b>
                  <small>
                    {labelStatus(s.status, ar)} · {s.photo_count}{" "}
                    {ar ? "صور" : "photos"}
                  </small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Client = ReturnType<typeof createClient> | null;
function SiteProfile({
  site,
  client,
  demo,
  ar,
  onClose,
}: {
  site: GisSite;
  client: Client;
  demo: Site | undefined;
  ar: boolean;
  onClose: () => void;
}) {
  const tx = (en: string, arabic: string) => (ar ? arabic : en);
  const [profile, setProfile] = useState<Profile>();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [retry, setRetry] = useState(0);
  const [lightbox, setLightbox] = useState<Photo>();
  const panel = useRef<HTMLElement>(null);
  const renewed = useRef(new Set<string>());
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobile]);
  useEffect(() => {
    let active = true;
    setError("");
    setProfile(undefined);
    renewed.current.clear();
    const request = client
      ? loadProfile(client, site.site_id)
      : Promise.resolve(demo ? demoProfile(demo) : undefined);
    request
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Profile unavailable",
          );
      });
    return () => {
      active = false;
    };
  }, [client, demo, site.site_id, retry]);
  useEffect(() => {
    let active = true;
    if (!profile) return;
    const captures = logicalPhotos(profile.evidence);
    setPhotos(captures);
    setPhotoError("");
    const renew = async () => {
      if (!client) return;
      try {
        const signed = await signPhotos(client, captures);
        if (active) {
          setPhotos(signed);
          setLightbox((current) =>
            current ? signed.find((p) => p.id === current.id) : undefined,
          );
          setPhotoError("");
        }
      } catch (cause) {
        if (active)
          setPhotoError(
            cause instanceof Error ? cause.message : "Photos unavailable",
          );
      }
    };
    void renew();
    const interval = setInterval(() => void renew(), 12 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [client, profile]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      previous?.isConnected && previous.focus();
    };
  }, []);
  const renewImage = async (photo: Photo) => {
    if (!client || renewed.current.has(photo.id)) return;
    renewed.current.add(photo.id);
    try {
      const [fresh] = await signPhotos(client, [photo]);
      setPhotos((rows) => rows.map((p) => (p.id === photo.id ? fresh : p)));
      setLightbox((current) => (current?.id === photo.id ? fresh : current));
    } catch {
      setPhotoError(
        tx(
          "Unable to refresh photo access.",
          "تعذر تحديث صلاحية الوصول للصورة.",
        ),
      );
    }
  };
  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleString(ar ? "ar-SA" : "en-GB", {
          timeZone: "Asia/Riyadh",
        })
      : tx("Not recorded", "غير مسجل");
  const keydown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
    if (e.key === "Tab" && window.matchMedia("(max-width: 760px)").matches) {
      const focusable = panel.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),a[href],input,select,[tabindex="0"]',
      );
      if (!focusable?.length) return;
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  return (
    <aside
      className="gis-profile"
      ref={panel}
      role="dialog"
      aria-modal={mobile || undefined}
      aria-label={site.merchant}
      onKeyDown={keydown}
    >
      <header>
        <div>
          <small>{site.site_code}</small>
          <h3>{site.merchant}</h3>
          <span
            className="gis-status"
            style={{ borderColor: tones[site.status] }}
          >
            {labelStatus(site.status, ar)}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label={tx("Close site profile", "إغلاق ملف الموقع")}
        >
          <X size={18} />
        </button>
      </header>
      <nav aria-label={tx("Site profile sections", "أقسام ملف الموقع")}>
        {(
          [
            ["overview", "Overview", "نظرة عامة"],
            ["photos", "Photos", "الصور"],
            ["activity", "Activity", "النشاط"],
            ["contact", "Contact", "التواصل"],
          ] as const
        ).map(([id, en, a]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {tx(en, a)}
          </button>
        ))}
      </nav>
      <div className="gis-profile-body">
        {error ? (
          <div className="gis-alert" role="alert">
            {error}
            <button onClick={() => setRetry((v) => v + 1)}>
              {tx("Retry", "إعادة المحاولة")}
            </button>
          </div>
        ) : !profile ? (
          <p role="status">
            {tx("Loading site profile…", "جارٍ تحميل ملف الموقع…")}
          </p>
        ) : (
          <>
            {tab === "overview" && (
              <>
                <div className="gis-site-metrics">
                  <Metric
                    label={tx("Customer scans", "مسح العملاء")}
                    value={tx("Not connected", "غير متصل")}
                  />
                  <Metric
                    label={tx("Photo captures", "الصور")}
                    value={site.photo_count}
                  />
                  <Metric
                    label={tx("Visit attempts", "محاولات الزيارة")}
                    value={site.visit_count}
                  />
                  <Metric
                    label={tx("Open exceptions", "الاستثناءات المفتوحة")}
                    value={site.exception_count}
                  />
                </div>
                <dl className="gis-details">
                  {[
                    [tx("Region", "المنطقة"), site.region],
                    [tx("City", "المدينة"), site.city],
                    [tx("Category", "الفئة"), site.category],
                    [
                      tx("Assigned driver", "السائق المعيّن"),
                      site.driver_name ?? tx("Not assigned", "غير معيّن"),
                    ],
                    [
                      tx("Address", "العنوان"),
                      profile.address ?? tx("Not provided", "غير متوفر"),
                    ],
                    [
                      tx("Coordinates", "الإحداثيات"),
                      validLocation(site)
                        ? `${site.latitude!.toFixed(6)}, ${site.longitude!.toFixed(6)}`
                        : tx("Not provided", "غير متوفر"),
                    ],
                    [
                      tx("Latest GPS deviation", "آخر انحراف GPS"),
                      site.gps_deviation === null
                        ? tx("Not recorded", "غير مسجل")
                        : `${site.gps_deviation} ${tx("metres", "متر")}`,
                    ],
                    [
                      tx(
                        "Latest submission · Saudi time",
                        "آخر إرسال · بتوقيت السعودية",
                      ),
                      date(site.latest_submission),
                    ],
                    [
                      tx(
                        "Site updated · Saudi time",
                        "تحديث الموقع · بتوقيت السعودية",
                      ),
                      date(site.updated_at),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                {validLocation(site) && (
                  <a
                    className="gis-linkbutton"
                    href={`https://www.google.com/maps?q=${site.latitude},${site.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MapPin size={15} />
                    {tx("Open directions", "فتح الاتجاهات")}
                    <ArrowUpRight size={14} />
                  </a>
                )}
                <div className="gis-related">
                  <Link href="/assignments">
                    {tx("Assignments", "التعيينات")} ↗
                  </Link>
                  <Link href="/reviews">
                    {tx("Review queue", "قائمة المراجعة")} ↗
                  </Link>
                </div>
              </>
            )}
            {tab === "photos" && (
              <>
                <p className="gis-muted">
                  {tx(
                    "Photo captures from every visit. Originals and stamped copies count as one.",
                    "صور جميع الزيارات. الأصل والنسخة المختومة يُحسبان صورة واحدة.",
                  )}
                </p>
                {photoError && (
                  <div className="gis-alert" role="alert">
                    {photoError}
                    <button onClick={() => setRetry((v) => v + 1)}>
                      {tx("Refresh photos", "تحديث الصور")}
                    </button>
                  </div>
                )}
                {!photos.length ? (
                  <div className="gis-empty">
                    <Camera />
                    <p>
                      {tx("No evidence photos yet", "لا توجد صور إثبات بعد")}
                    </p>
                  </div>
                ) : (
                  <div className="gis-gallery">
                    {photos.map((photo) => {
                      const attempt = profile.attempts.find(
                        (a) => a.id === photo.attempt_id,
                      );
                      const decision = profile.decisions.find(
                        (d) => d.attempt_id === photo.attempt_id,
                      );
                      return (
                        <article key={photo.id}>
                          <button
                            disabled={!photo.signedUrl}
                            onClick={() => setLightbox(photo)}
                            aria-label={
                              tx("Enlarge photo", "تكبير الصورة") +
                              " " +
                              photo.id
                            }
                          >
                            {photo.signedUrl ? (
                              <img
                                loading="lazy"
                                src={photo.signedUrl}
                                alt={tx("Site evidence", "صورة إثبات للموقع")}
                                onError={() => void renewImage(photo)}
                              />
                            ) : (
                              <span>
                                {tx(
                                  "Loading private photo…",
                                  "جارٍ تحميل الصورة الخاصة…",
                                )}
                              </span>
                            )}
                          </button>
                          <b>
                            {photo.kind === "installation_photo"
                              ? tx("Installation", "التركيب")
                              : photo.kind === "close_up_photo"
                                ? tx("Close-up", "صورة مقربة")
                                : tx("Evidence", "الإثبات")}
                          </b>
                          <small>
                            {tx("Visit", "الزيارة")}{" "}
                            {attempt?.attempt_number ?? "—"} ·{" "}
                            {decision
                              ? labelStatus(decision.decision, ar)
                              : tx("No decision", "بلا قرار")}
                          </small>
                          <small>
                            {date(photo.created_at)} ·{" "}
                            {tx("uploaded", "وقت الرفع")}
                          </small>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {tab === "activity" && (
              <>
                <h4>{tx("Assignment history", "سجل التعيينات")}</h4>
                {profile.assignments.map((a) => (
                  <article className="gis-event" key={a.id}>
                    <b>{a.driver_name}</b>
                    <small>
                      {date(a.assigned_at)}
                      {a.ended_at
                        ? ` → ${date(a.ended_at)}`
                        : ` · ${tx("Current", "الحالي")}`}
                    </small>
                    {a.reason && <p>{a.reason}</p>}
                  </article>
                ))}
                {!profile.assignments.length && (
                  <p>
                    {tx("No assignments recorded", "لا توجد تعيينات مسجلة")}
                  </p>
                )}
                <h4>{tx("Visit history", "سجل الزيارات")}</h4>
                {!profile.attempts.length && (
                  <p>{tx("No visits recorded", "لا توجد زيارات مسجلة")}</p>
                )}
                {profile.attempts.map((a) => (
                  <article className="gis-event" key={a.id}>
                    <b>
                      {tx("Visit", "الزيارة")} {a.attempt_number} ·{" "}
                      {labelStatus(a.status, ar)}
                    </b>
                    <small>{date(a.submitted_at ?? a.created_at)}</small>
                    {a.notes && <p>{a.notes}</p>}
                    {profile.decisions
                      .filter((d) => d.attempt_id === a.id)
                      .map((d) => (
                        <p key={d.created_at}>
                          {labelStatus(d.decision, ar)} · {d.reason_code}{" "}
                          {d.notes}
                        </p>
                      ))}
                  </article>
                ))}
                <h4>{tx("Exceptions", "الاستثناءات")}</h4>
                {profile.exceptions.length ? (
                  profile.exceptions.map((x) => (
                    <article className="gis-event" key={x.id}>
                      <b>{x.reason.replaceAll("_", " ")}</b>
                      <small>
                        {x.status} · {date(x.created_at)}
                      </small>
                    </article>
                  ))
                ) : (
                  <p>{tx("No exceptions", "لا توجد استثناءات")}</p>
                )}
                <h4>{tx("Audit trail", "سجل التدقيق")}</h4>
                {profile.activity.map((e) => (
                  <article className="gis-event" key={e.id}>
                    <b>{e.action.replaceAll("_", " ")}</b>
                    <small>
                      {date(e.created_at)} ·{" "}
                      {e.actor_id ?? tx("System", "النظام")}
                    </small>
                    <p>{e.detail}</p>
                  </article>
                ))}
              </>
            )}
            {tab === "contact" && (
              <ContactPanel
                profile={profile}
                client={client}
                siteId={site.site_id}
                ar={ar}
                onSaved={() => setRetry((v) => v + 1)}
              />
            )}
          </>
        )}
      </div>
      {lightbox && (
        <div
          className="gis-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={tx("Evidence photo viewer", "عارض صور الإثبات")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setLightbox(undefined);
              panel.current
                ?.querySelector<HTMLButtonElement>("button")
                ?.focus();
            }
            if (e.key === "Tab") {
              e.preventDefault();
              e.currentTarget
                .querySelector<HTMLButtonElement>("button")
                ?.focus();
            }
          }}
        >
          <button
            autoFocus
            onClick={() => setLightbox(undefined)}
            aria-label={tx("Close photo", "إغلاق الصورة")}
          >
            <X />
          </button>
          <img
            src={lightbox.signedUrl}
            alt={tx("Enlarged site evidence", "صورة إثبات مكبرة")}
            onError={() => void renewImage(lightbox)}
          />
          <span>
            {date(lightbox.created_at)} · {tx("Saudi time", "بتوقيت السعودية")}
          </span>
        </div>
      )}
    </aside>
  );
}
function ContactPanel({
  profile,
  client,
  siteId,
  ar,
  onSaved,
}: {
  profile: Profile;
  client: Client;
  siteId: string;
  ar: boolean;
  onSaved: () => void;
}) {
  const tx = (en: string, a: string) => (ar ? a : en);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Contact>(
    profile.contact ?? { name: null, phone: null, email: null },
  );
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: saveError } = await client.rpc("gis_update_contact", {
        p_site_id: siteId,
        p_name: draft.name,
        p_phone: draft.phone,
        p_email: draft.email,
      });
      if (saveError) throw new Error(saveError.message);
      setEditing(false);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Contact could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h4>{tx("Primary site contact", "جهة الاتصال الرئيسية للموقع")}</h4>
      {editing ? (
        <form className="gis-contact-form" onSubmit={save}>
          {(
            [
              ["name", "Name", "الاسم"],
              ["phone", "Phone", "الهاتف"],
              ["email", "Email", "البريد الإلكتروني"],
            ] as const
          ).map(([key, en, a]) => (
            <label key={key}>
              {tx(en, a)}
              <input
                disabled={busy}
                type={
                  key === "email" ? "email" : key === "phone" ? "tel" : "text"
                }
                maxLength={key === "name" ? 200 : key === "phone" ? 60 : 254}
                value={draft[key] ?? ""}
                onChange={(e) =>
                  setDraft((v) => ({ ...v, [key]: e.target.value }))
                }
              />
            </label>
          ))}
          {error && (
            <p className="gis-alert" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy} type="submit">
            {busy
              ? tx("Saving…", "جارٍ الحفظ…")
              : tx("Save contact", "حفظ جهة الاتصال")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setError("");
              setDraft(
                profile.contact ?? { name: null, phone: null, email: null },
              );
            }}
          >
            {tx("Cancel", "إلغاء")}
          </button>
        </form>
      ) : (
        <>
          <dl className="gis-details">
            {(
              [
                ["name", "Name", "الاسم"],
                ["phone", "Phone", "الهاتف"],
                ["email", "Email", "البريد الإلكتروني"],
              ] as const
            ).map(([key, en, a]) => (
              <div key={key}>
                <dt>{tx(en, a)}</dt>
                <dd>
                  {profile.contact?.[key] ?? tx("Not provided", "غير متوفر")}
                </dd>
              </div>
            ))}
          </dl>
          {profile.can_edit_contact && client ? (
            <button onClick={() => setEditing(true)}>
              {tx("Edit contact", "تعديل جهة الاتصال")}
            </button>
          ) : (
            <p className="gis-muted">
              {tx(
                "Only an active administrator can edit contacts.",
                "يمكن للمسؤول النشط فقط تعديل بيانات الاتصال.",
              )}
            </p>
          )}
        </>
      )}
    </>
  );
}
