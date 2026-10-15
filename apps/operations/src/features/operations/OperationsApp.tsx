"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Filter,
  Gauge,
  Globe2,
  LayoutDashboard,
  ListFilter,
  Map as MapIcon,
  MapPin,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Upload,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import {
  categories,
  drivers as fixtureDrivers,
  generateSites,
  initialNotifications,
  regions,
} from "@/data/fixtures";
import { filterSites, kpis } from "@/data/metrics";
import {
  assignSites,
  canTransition,
  createSite,
  decideReview,
  SITE_STATUSES,
  transitionSite,
  validateSiteDraft,
  workloadForDriver,
  type Driver,
  type Notification,
  type OperationsAccess,
  type Site,
  type SiteDraft,
  type SiteDraftErrors,
  type SiteStatus,
} from "@/domain/model";
import {
  assessmentResultLabel,
  assessmentStatusLabel,
  latestAssessment,
  type AssessmentResult,
  type AssessmentStatus,
  type EvidenceAssessmentSettings,
} from "@/domain/evidence-assessment";
import {
  importFields,
  parseCsv,
  suggestMapping,
  validateImport as validateCsvImport,
  type ColumnMapping,
  type ImportValidation,
} from "@/data/site-import";
import { statusLabel, t, type Language } from "@/i18n/translations";
import dynamic from "next/dynamic";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseAuthRequired } from "@/lib/supabase/config";
import {
  assignLiveSites,
  createLiveSite,
  decideLiveReview,
  loadLiveOperations,
  retryLiveAssessment,
  resolveLiveException,
  updateLiveAssessmentSettings,
  updateLiveDriver,
} from "@/data/live-operations";

const GisWorkspace = dynamic(() => import("../gis/GisWorkspace"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading GIS…</div>,
});
const BASE_SITES = generateSites();
const BASE_BY_ID = new Map(BASE_SITES.map((site) => [site.id, site]));
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["sites", "Sites", Building2],
  ["map", "Geographic map", MapIcon],
  ["assignments", "Assignments", UserCheck],
  ["drivers", "Drivers", Users],
  ["reviews", "Review queue", ClipboardCheck],
  ["exceptions", "Exceptions", ShieldAlert],
  ["reports", "Reports", FileSpreadsheet],
  ["notifications", "Notifications", Bell],
] as const;
const statusTone: Record<SiteStatus, string> = {
  Unassigned: "neutral",
  Assigned: "blue",
  "In Progress": "purple",
  "Under Review": "amber",
  Verified: "green",
  "Revisit Required": "orange",
  "Flagged / Exception": "red",
  "Closed / Cancelled": "dark",
};
const fmt = new Intl.NumberFormat("en-US");
const LanguageContext = createContext<Language>("en");
function Badge({ status }: { status: SiteStatus }) {
  const language = useContext(LanguageContext);
  return (
    <span className={`badge ${statusTone[status]}`}>
      <span />
      {statusLabel(language, status)}
    </span>
  );
}
function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar">
      {name
        .split(" ")
        .slice(0, 2)
        .map((x) => x[0])
        .join("")}
    </span>
  );
}

export function OperationsApp() {
  const pathname = usePathname();
  const router = useRouter();
  const page = (pathname.split("/")[1] ||
    "overview") as (typeof nav)[number][0];
  const liveMode = isSupabaseAuthRequired;
  const supabase = useMemo(
    () => (liveMode ? createSupabaseClient() : null),
    [liveMode],
  );
  const [sites, setSites] = useState<Site[]>(liveMode ? [] : BASE_SITES);
  const [drivers, setDrivers] = useState<Driver[]>(() =>
    liveMode ? [] : fixtureDrivers.map((d) => ({ ...d })),
  );
  const [notifications, setNotifications] = useState<Notification[]>(
    liveMode ? [] : initialNotifications,
  );
  const [selected, setSelected] = useState<Site>();
  const [toast, setToast] = useState<string>();
  const [mobileNav, setMobileNav] = useState(false);
  const [liveLoading, setLiveLoading] = useState(liveMode);
  const [liveError, setLiveError] = useState<string>();
  const [access, setAccess] = useState<OperationsAccess>({});
  const [language, setLanguage] = useState<Language>("en");
  const rtl = language === "ar";
  const [hydrated, setHydrated] = useState(false);
  const refreshLive = useCallback(async () => {
    if (!supabase) return;
    setLiveError(undefined);
    try {
      const snapshot = await loadLiveOperations(supabase);
      setSites(snapshot.sites);
      setDrivers(snapshot.drivers);
      setAccess(snapshot.access);
    } catch (error) {
      setLiveError(
        error instanceof Error ? error.message : "Unable to load hosted data",
      );
    } finally {
      setLiveLoading(false);
    }
  }, [supabase]);
  useEffect(() => {
    if (liveMode) {
      if (page === "map") {
        setLiveLoading(false);
        return;
      }
      setLiveLoading(true);
      void refreshLive();
      return;
    }
    try {
      const saved = localStorage.getItem("moka-operations-demo-v2");
      if (saved) {
        const parsed = JSON.parse(saved) as {
          sites?: Site[];
          drivers?: Driver[];
          notifications?: Notification[];
        };
        if (parsed.sites?.length) {
          const overrides = new Map(
            parsed.sites.map((site) => [site.id, site]),
          );
          setSites([
            ...parsed.sites.filter((site) => !BASE_BY_ID.has(site.id)),
            ...BASE_SITES.map((site) => overrides.get(site.id) ?? site),
          ]);
        }
        if (parsed.drivers?.length) setDrivers(parsed.drivers);
        if (parsed.notifications?.length)
          setNotifications(parsed.notifications);
      }
    } catch {}
    setHydrated(true);
  }, [liveMode, refreshLive, page]);
  useEffect(() => {
    if (liveMode || !hydrated) return;
    try {
      const changedSites = sites.filter((site) => {
        const base = BASE_BY_ID.get(site.id);
        return (
          !base ||
          site.status !== base.status ||
          site.driverId !== base.driverId ||
          site.merchant !== base.merchant ||
          site.city !== base.city ||
          site.region !== base.region ||
          site.audit.length !== base.audit.length
        );
      });
      localStorage.setItem(
        "moka-operations-demo-v2",
        JSON.stringify({ sites: changedSites, drivers, notifications }),
      );
    } catch {}
  }, [liveMode, hydrated, sites, drivers, notifications]);
  const go = (to: string) => {
    router.push(`/${to}`);
    setMobileNav(false);
  };
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(undefined), 2800);
  };
  const mutateSite = async (siteId: string, to: SiteStatus, detail: string) => {
    if (liveMode && supabase) {
      if (
        to !== "Assigned" &&
        to !== "Verified" &&
        to !== "Closed / Cancelled"
      ) {
        throw new Error("This hosted exception action is not supported.");
      }
      await resolveLiveException(supabase, siteId, to, detail);
      await refreshLive();
      return;
    }
    setSites((all) =>
      all.map((s) =>
        s.id === siteId ? transitionSite(s, to, "Operations admin", detail) : s,
      ),
    );
  };
  const reviewSite = async (
    siteId: string,
    to: "Verified" | "Revisit Required" | "Flagged / Exception",
    detail: string,
  ) => {
    if (liveMode && supabase) {
      await decideLiveReview(supabase, siteId, to, detail);
      await refreshLive();
      return;
    }
    setSites((all) =>
      all.map((site) =>
        site.id === siteId ? decideReview(site, to, detail) : site,
      ),
    );
  };
  const assignAction = async (siteCodes: string[], driverId: string) => {
    if (liveMode && supabase) {
      const outcome = await assignLiveSites(supabase, siteCodes, driverId);
      await refreshLive();
      return outcome;
    }
    const driver = drivers.find((item) => item.id === driverId);
    if (!driver) return { assigned: 0, skipped: siteCodes.length };
    const outcome = assignSites(sites, siteCodes, driver);
    setSites(outcome.sites);
    return outcome;
  };
  const createSiteAction = async (draft: SiteDraft) => {
    if (liveMode && supabase) {
      await createLiveSite(supabase, draft);
      await refreshLive();
      return;
    }
    setSites((all) => [
      createSite(
        draft,
        all.map((item) => item.id),
      ),
      ...all,
    ]);
  };
  const toggleDriverAction = async (
    id: string,
    key: "active" | "available",
  ) => {
    const driver = drivers.find((item) => item.id === id);
    if (!driver) return;
    if (liveMode && supabase) {
      await updateLiveDriver(supabase, id, { [key]: !driver[key] });
      await refreshLive();
      return;
    }
    setDrivers((all) =>
      all.map((item) =>
        item.id === id ? { ...item, [key]: !item[key] } : item,
      ),
    );
  };
  const title = t(language, page);
  return (
    <LanguageContext.Provider value={language}>
      <div className="app-shell" dir={rtl ? "rtl" : "ltr"} lang={language}>
        <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
          <div className="brand">
            <div className="brand-mark">DMC</div>
            <div>
              <b>10 Billion Steps</b>
              <span>Operations control</span>
            </div>
            <button
              className="icon-btn mobile-close"
              onClick={() => setMobileNav(false)}
              aria-label="Close navigation"
            >
              <X />
            </button>
          </div>
          <div className="workspace-chip">
            <div className="workspace-icon">
              <Building2 />
            </div>
            <div>
              <small>Workspace</small>
              <b>10,000 Sites Activation</b>
            </div>
            <ChevronDown />
          </div>
          <nav aria-label="Main navigation">
            {nav.map(([key, , Icon]) => (
              <button
                key={key}
                className={page === key ? "active" : ""}
                onClick={() => go(key)}
              >
                <Icon />
                <span>{t(language, key)}</span>
                {key === "reviews" && <em>{kpis(sites).underReview}</em>}
                {key === "exceptions" && (
                  <em className="danger">
                    {
                      sites.filter((site) =>
                        ["Flagged / Exception", "Revisit Required"].includes(
                          site.status,
                        ),
                      ).length
                    }
                  </em>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="system-status">
              <span className="pulse" />
              <div>
                <b>{liveMode ? "10 Billion Steps" : rtl ? "مساحة تجريبية" : "Demo workspace"}</b>
                <small>
                  {liveMode
                    ? rtl ? "مساحة العمليات" : "Operations workspace"
                    : rtl ? "بيانات نموذجية" : "Sample data"}
                </small>
              </div>
            </div>
            <div className="user-card">
              <Avatar name="Operations Admin" />
              <div>
                <b>Operations Admin</b>
                <small>System administrator</small>
              </div>
            </div>
          </div>
        </aside>
        <main className="main">
          <header>
            <button
              className="icon-btn menu-btn"
              onClick={() => setMobileNav(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </button>
            <div>
              <span className="eyebrow">
                {rtl ? "التفعيل الميداني" : "Field activation"} / {title}
              </span>
              <h1>{title}</h1>
            </div>
            <div className="header-actions">
              <div className="sync">
                <span /> {rtl ? "تمت المزامنة الآن" : "Last synced just now"}
              </div>
              <button
                className="language-button"
                onClick={() =>
                  setLanguage((value) => (value === "en" ? "ar" : "en"))
                }
                aria-label="Toggle Arabic right-to-left layout"
              >
                <Globe2 />
                {rtl ? "EN" : "العربية"}
              </button>
              <button
                className="icon-btn bell"
                aria-label="Notifications"
                onClick={() => go("notifications")}
              >
                <Bell />
                <i>{notifications.filter((n) => !n.read).length}</i>
              </button>
              <div className="avatar-button">
                <Avatar name="Operations Admin" />
              </div>
            </div>
          </header>
          <div className="content">
            {liveLoading && page !== "map" && (
              <div className="panel empty">
                <RefreshCw className="spin" />
                <h2>Loading hosted demo data</h2>
              </div>
            )}
            {liveError && page !== "map" && (
              <div className="report-callout">
                <AlertTriangle />
                <div>
                  <b>Hosted data unavailable</b>
                  <span>{liveError}</span>
                </div>
                <button onClick={() => void refreshLive()}>Retry</button>
              </div>
            )}
            {!liveLoading && page === "overview" && (
              <Overview sites={sites} go={go} />
            )}{" "}
            {!liveLoading && page === "sites" && (
              <SitesPage
                sites={sites}
                setSites={setSites}
                drivers={drivers}
                onSelect={setSelected}
                notify={notify}
                createAction={createSiteAction}
                liveMode={liveMode}
              />
            )}{" "}
            {page === "map" && (
              <GisWorkspace
                language={language}
                liveMode={liveMode}
                demoSites={sites}
                demoDrivers={drivers}
              />
            )}{" "}
            {!liveLoading && page === "assignments" && (
              <Assignments
                sites={sites}
                setSites={setSites}
                drivers={drivers}
                notify={notify}
                setNotifications={setNotifications}
                onAssign={assignAction}
              />
            )}{" "}
            {!liveLoading && page === "drivers" && (
              <DriversPage
                drivers={drivers}
                setDrivers={setDrivers}
                sites={sites}
                notify={notify}
                onToggle={toggleDriverAction}
                liveMode={liveMode}
              />
            )}{" "}
            {!liveLoading && page === "reviews" && (
              <Reviews
                sites={sites}
                drivers={drivers}
                access={access}
                action={async (id, to, detail) => {
                  try {
                    await reviewSite(id, to, detail);
                    notify(`Decision saved · ${to}`);
                  } catch (error) {
                    notify(
                      error instanceof Error ? error.message : "Review failed",
                    );
                  }
                }}
                retryAssessment={async (attemptId) => {
                  try {
                    if (!supabase) throw new Error("AI assessment requires hosted mode.");
                    await retryLiveAssessment(supabase, attemptId);
                    await refreshLive();
                    notify("Assessment queued");
                  } catch (error) {
                    notify(error instanceof Error ? error.message : "Unable to queue assessment");
                  }
                }}
                saveAssessmentSettings={async (settings) => {
                  try {
                    if (!supabase) throw new Error("Settings require hosted mode.");
                    await updateLiveAssessmentSettings(supabase, settings);
                    await refreshLive();
                    notify("Assessment criteria updated");
                  } catch (error) {
                    notify(error instanceof Error ? error.message : "Unable to update criteria");
                  }
                }}
                onSelect={setSelected}
              />
            )}{" "}
            {!liveLoading && page === "exceptions" && (
              <Exceptions
                sites={sites}
                action={async (id, to, detail) => {
                  try {
                    await mutateSite(id, to, detail);
                    notify(`Exception action saved · ${to}`);
                  } catch (error) {
                    notify(
                      error instanceof Error ? error.message : "Action failed",
                    );
                  }
                }}
                onSelect={setSelected}
              />
            )}{" "}
            {!liveLoading && page === "reports" && (
              <Reports sites={sites} notify={notify} />
            )}{" "}
            {!liveLoading && page === "notifications" && (
              <Notifications
                items={notifications}
                setItems={setNotifications}
              />
            )}
          </div>
        </main>
        {selected && (
          <SiteDrawer
            site={sites.find((s) => s.id === selected.id) ?? selected}
            driver={drivers.find(
              (d) =>
                d.id ===
                (sites.find((s) => s.id === selected.id)?.driverId ??
                  selected.driverId),
            )}
            onClose={() => setSelected(undefined)}
          />
        )}{" "}
        {toast && (
          <div className="toast">
            <CheckCircle2 />
            {toast}
          </div>
        )}
      </div>
    </LanguageContext.Provider>
  );
}

function Overview({ sites, go }: { sites: Site[]; go: (s: string) => void }) {
  const m = kpis(sites),
    cards = [
      ["Total sites", m.total, "All activation sites", "navy", Building2],
      [
        "Unassigned",
        m.unassigned,
        "Ready for allocation",
        "neutral",
        CircleAlert,
      ],
      [
        "Active assignments",
        m.assigned,
        "Assigned + in progress",
        "blue",
        Activity,
      ],
      [
        "Under review",
        m.underReview,
        "Evidence awaiting decision",
        "amber",
        ClipboardCheck,
      ],
      [
        "Verified",
        m.verified,
        `${Math.round((m.verified / m.total) * 100)}% of all sites`,
        "green",
        CheckCircle2,
      ],
      ["Flagged", m.flagged, "Needs investigation", "red", AlertTriangle],
      [
        "Revisit required",
        m.revisit,
        "Driver action needed",
        "orange",
        RefreshCw,
      ],
    ] as const;
  const byRegion = regions
    .map((r) => {
      const all = sites.filter((s) => s.region === r);
      return {
        name: r,
        total: all.length,
        done: all.filter((s) => s.status === "Verified").length,
      };
    })
    .sort((a, b) => b.done / b.total - a.done / a.total);
  const backlog = m.underReview + m.flagged + m.revisit;
  const reviewEnd = backlog ? (m.underReview / backlog) * 100 : 0;
  const flagEnd = backlog ? ((m.underReview + m.flagged) / backlog) * 100 : 0;
  const recent = sites
    .flatMap((site) => site.audit.map((event) => ({ site, event })))
    .sort((a, b) => Date.parse(b.event.at) - Date.parse(a.event.at))
    .slice(0, 4);
  return (
    <>
      <section className="hero-row branded">
        <div className="hero-copy">
          <span className="brand-kicker">DMC · DELTA MARKETING CO.</span>
          <h2>Good morning, Operations</h2>
          <p>
            Here’s the activation network at a glance.{" "}
            <b>{fmt.format(m.underReview + m.flagged + m.revisit)}</b> sites
            need attention.
          </p>
        </div>
        <div className="date-pill">
          <CalendarDays /> 13 October 2026
        </div>
      </section>
      <section className="kpi-grid">
        {cards.map(([label, value, sub, tone, Icon]) => (
          <article className={`kpi-card ${tone}`} key={label}>
            <div className="kpi-top">
              <span>{label}</span>
              <div>
                <Icon />
              </div>
            </div>
            <strong>{fmt.format(value)}</strong>
            <small>{sub}</small>
            <div className="micro-line" />
          </article>
        ))}
      </section>
      <section className="dash-grid">
        <div className="panel wide">
          <PanelHead
            title="Completion by region"
            subtitle="Verified sites as a share of regional total"
            action="View reports"
            onAction={() => go("reports")}
          />
          <div className="region-chart">
            {byRegion.map((r, i) => {
              const p = Math.round((r.done / r.total) * 100);
              return (
                <div className="region-row" key={r.name}>
                  <span className="rank">0{i + 1}</span>
                  <div>
                    <b>{r.name}</b>
                    <small>
                      {fmt.format(r.done)} of {fmt.format(r.total)} sites
                      verified
                    </small>
                  </div>
                  <div className="track">
                    <i style={{ width: `${p}%` }} />
                  </div>
                  <strong>{p}%</strong>
                </div>
              );
            })}
          </div>
        </div>
        <div className="panel">
          <PanelHead
            title="Review backlog"
            subtitle="Work requiring operations attention"
          />
          <div className="donut-wrap">
            <div
              className="donut"
              style={{
                background: `conic-gradient(#d97706 0 ${reviewEnd}%,#dc2626 ${reviewEnd}% ${flagEnd}%,#e85d2a ${flagEnd}% 100%)`,
              }}
            >
              <div>
                <strong>{fmt.format(backlog)}</strong>
                <span>open items</span>
              </div>
            </div>
            <div className="legend-list">
              <span>
                <i className="amber" />
                Under review <b>{m.underReview}</b>
              </span>
              <span>
                <i className="red" />
                Flagged <b>{m.flagged}</b>
              </span>
              <span>
                <i className="orange" />
                Revisit <b>{m.revisit}</b>
              </span>
            </div>
          </div>
          <button
            className="button secondary full"
            onClick={() => go("reviews")}
          >
            Open review queue <ArrowUpRight />
          </button>
        </div>
        <div className="panel">
          <PanelHead
            title="Recent activity"
            subtitle="Latest audit events"
            action="All activity"
            onAction={() => go("notifications")}
          />
          <div className="timeline">
            {recent.map(({ site, event }) => (
              <div key={event.id}>
                <span className={`event-dot ${statusTone[site.status]}`}>
                  <Activity />
                </span>
                <p>
                  <b>{site.id}</b> {event.action}
                  <small>
                    {site.city} ·{" "}
                    {new Date(event.at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="panel quick">
          <PanelHead
            title="Quick actions"
            subtitle="Common operational workflows"
          />
          <button onClick={() => go("assignments")}>
            <span className="qa-icon blue">
              <UserCheck />
            </span>
            <span>
              <b>Assign sites</b>
              <small>Allocate unassigned locations</small>
            </span>
            <ChevronRight />
          </button>
          <button onClick={() => go("sites")}>
            <span className="qa-icon green">
              <Upload />
            </span>
            <span>
              <b>Import site file</b>
              <small>Preview and validate a CSV</small>
            </span>
            <ChevronRight />
          </button>
          <button onClick={() => go("drivers")}>
            <span className="qa-icon purple">
              <Users />
            </span>
            <span>
              <b>Add a driver</b>
              <small>Register a field team member</small>
            </span>
            <ChevronRight />
          </button>
        </div>
      </section>
    </>
  );
}

function PanelHead({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="panel-head">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && (
        <button onClick={onAction}>
          {action}
          <ArrowUpRight />
        </button>
      )}
    </div>
  );
}

function SitesPage({
  sites,
  setSites,
  drivers,
  onSelect,
  notify,
  createAction,
  liveMode,
}: {
  sites: Site[];
  setSites: React.Dispatch<React.SetStateAction<Site[]>>;
  drivers: Driver[];
  onSelect: (s: Site) => void;
  notify: (s: string) => void;
  createAction: (draft: SiteDraft) => Promise<void>;
  liveMode: boolean;
}) {
  const language = useContext(LanguageContext);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [driverId, setDriverId] = useState("");
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<string[]>([]);
  const [modal, setModal] = useState<"add" | "import">();
  const filtered = useMemo(
    () =>
      filterSites(sites, q).filter(
        (s) =>
          (!status || s.status === status) &&
          (!region || s.region === region) &&
          (!city || s.city === city) &&
          (!category || s.category === category) &&
          (!driverId || s.driverId === driverId),
      ),
    [sites, q, status, region, city, category, driverId],
  );
  const shown = filtered.slice((page - 1) * 20, page * 20);
  const pages = Math.ceil(filtered.length / 20);
  const cities = [
    ...new Set(
      sites.filter((s) => !region || s.region === region).map((s) => s.city),
    ),
  ].sort();
  const addSite = async (draft: SiteDraft) => {
    try {
      await createAction(draft);
      setModal(undefined);
      notify(`${draft.id} created`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Site creation failed");
    }
  };
  const importSites = async (drafts: SiteDraft[]) => {
    if (liveMode) {
      for (const draft of drafts) await createAction(draft);
    } else {
      const ids = new Set(sites.map((site) => site.id));
      const created = drafts.map((draft) => {
        const site = createSite(draft, ids);
        ids.add(site.id);
        return site;
      });
      setSites((all) => [...created, ...all]);
    }
    setModal(undefined);
    notify(
      `${drafts.length} CSV records imported${liveMode ? "" : " locally"}`,
    );
  };
  return (
    <>
      <PageIntro
        title={
          language === "ar" ? "قائمة المواقع الرئيسية" : "Sites master list"
        }
        text={
          language === "ar"
            ? "ابحث وصفِّ واستورد وأدر شبكة التفعيل."
            : "Search, filter, import and manage the activation network."
        }
        actions={
          <>
            <button
              className="button secondary"
              onClick={() => setModal("import")}
            >
              <Upload /> {t(language, "importCsv")}
            </button>
            <button className="button primary" onClick={() => setModal("add")}>
              <Plus /> {t(language, "addSite")}
            </button>
          </>
        }
      />
      <div className="panel table-panel">
        <div className="table-tools">
          <label className="search">
            <Search />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={t(language, "search")}
            />
          </label>
          <select
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setCity("");
            }}
          >
            <option value="">{t(language, "allRegions")}</option>
            {regions.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">{t(language, "allCities")}</option>
            {cities.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t(language, "allCategories")}</option>
            {categories.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t(language, "allStatuses")}</option>
            {SITE_STATUSES.map((x) => (
              <option key={x} value={x}>
                {statusLabel(language, x)}
              </option>
            ))}
          </select>
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
          >
            <option value="">{t(language, "allDrivers")}</option>
            {drivers.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <span className="result-count">
            {fmt.format(filtered.length)} {t(language, "results")}
          </span>
        </div>
        {checked.length > 0 && (
          <div className="bulkbar">
            <b>{checked.length} selected</b>
            <button onClick={() => notify("Bulk action opened in Assignments")}>
              Assign
            </button>
            <button onClick={() => setChecked([])}>Clear</button>
          </div>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    aria-label="Select page"
                    type="checkbox"
                    checked={
                      shown.length > 0 &&
                      shown.every((s) => checked.includes(s.id))
                    }
                    onChange={(e) =>
                      setChecked(
                        e.target.checked
                          ? [
                              ...new Set([
                                ...checked,
                                ...shown.map((s) => s.id),
                              ]),
                            ]
                          : checked.filter(
                              (id) => !shown.some((s) => s.id === id),
                            ),
                      )
                    }
                  />
                </th>
                <th>{language === "ar" ? "الموقع" : "Site"}</th>
                <th>{language === "ar" ? "الموقع الجغرافي" : "Location"}</th>
                <th>{language === "ar" ? "الفئة" : "Category"}</th>
                <th>{language === "ar" ? "الحالة" : "Status"}</th>
                <th>
                  {language === "ar" ? "السائق المعيّن" : "Assigned driver"}
                </th>
                <th>{language === "ar" ? "آخر تحديث" : "Last update"}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const driver = drivers.find((d) => d.id === s.driverId);
                return (
                  <tr key={s.id} onClick={() => onSelect(s)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        aria-label={`Select ${s.id}`}
                        type="checkbox"
                        checked={checked.includes(s.id)}
                        onChange={(e) =>
                          setChecked(
                            e.target.checked
                              ? [...checked, s.id]
                              : checked.filter((x) => x !== s.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <b>{s.merchant}</b>
                      <small>{s.id}</small>
                    </td>
                    <td>
                      {s.city}
                      <small>{s.region}</small>
                    </td>
                    <td>{s.category}</td>
                    <td>
                      <Badge status={s.status} />
                    </td>
                    <td>
                      {driver ? (
                        <span className="driver-cell">
                          <Avatar name={driver.name} />
                          {driver.name}
                        </span>
                      ) : (
                        <span className="muted">
                          {language === "ar" ? "غير معيّن" : "Not assigned"}
                        </span>
                      )}
                    </td>
                    <td>
                      {new Date(s.updatedAt).toLocaleDateString(
                        language === "ar" ? "ar-SA" : "en-GB",
                        { day: "numeric", month: "short" },
                      )}
                    </td>
                    <td>
                      <button className="icon-btn" aria-label="Open site">
                        <ChevronRight />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pages} setPage={setPage} />
      </div>
      {modal === "add" && (
        <AddSiteModal
          existingIds={sites.map((site) => site.id)}
          close={() => setModal(undefined)}
          save={addSite}
        />
      )}{" "}
      {modal === "import" && (
        <ImportModal
          existingIds={sites.map((site) => site.id)}
          close={() => setModal(undefined)}
          done={importSites}
        />
      )}
    </>
  );
}

function AddSiteModal({
  existingIds,
  close,
  save,
}: {
  existingIds: string[];
  close: () => void;
  save: (draft: SiteDraft) => void;
}) {
  const [draft, setDraft] = useState<Partial<SiteDraft>>({
    region: "Riyadh",
    category: "Grocery",
  });
  const [errors, setErrors] = useState<SiteDraftErrors>({});
  const update = <K extends keyof SiteDraft>(key: K, value: SiteDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const submit = () => {
    const next = validateSiteDraft(draft, existingIds);
    setErrors(next);
    if (Object.keys(next).length === 0) save(draft as SiteDraft);
  };
  const field = (
    key: keyof SiteDraft,
    label: string,
    input: React.ReactNode,
  ) => (
    <label className={key === "merchant" || key === "address" ? "span2" : ""}>
      {label}
      {input}
      {errors[key] && <span className="field-error">{errors[key]}</span>}
    </label>
  );
  return (
    <Modal
      title="Add activation site"
      subtitle="All required fields are validated before local creation."
      close={close}
    >
      <div className="form-grid">
        {field(
          "merchant",
          "Merchant / site name",
          <input
            value={draft.merchant || ""}
            onChange={(e) => update("merchant", e.target.value)}
            placeholder="e.g. Palm Grocery 241"
            autoFocus
          />,
        )}
        {field(
          "id",
          "Unique site ID",
          <input
            value={draft.id || ""}
            onChange={(e) => update("id", e.target.value)}
            placeholder="e.g. KSA-10001"
          />,
        )}
        {field(
          "region",
          "Region",
          <select
            value={draft.region}
            onChange={(e) =>
              update("region", e.target.value as SiteDraft["region"])
            }
          >
            {regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>,
        )}
        {field(
          "city",
          "City",
          <input
            value={draft.city || ""}
            onChange={(e) => update("city", e.target.value)}
            placeholder="Riyadh"
          />,
        )}
        {field(
          "category",
          "Category",
          <select
            value={draft.category}
            onChange={(e) =>
              update("category", e.target.value as SiteDraft["category"])
            }
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>,
        )}
        {field(
          "lat",
          "Latitude",
          <input
            inputMode="decimal"
            value={draft.lat ?? ""}
            onChange={(e) =>
              update(
                "lat",
                e.target.value === "" ? Number.NaN : Number(e.target.value),
              )
            }
            placeholder="24.7136"
          />,
        )}
        {field(
          "lng",
          "Longitude",
          <input
            inputMode="decimal"
            value={draft.lng ?? ""}
            onChange={(e) =>
              update(
                "lng",
                e.target.value === "" ? Number.NaN : Number(e.target.value),
              )
            }
            placeholder="46.6753"
          />,
        )}
        {field(
          "address",
          "Address (optional)",
          <input
            value={draft.address || ""}
            onChange={(e) => update("address", e.target.value)}
            placeholder="Street and district"
          />,
        )}
        <div className="modal-actions span2">
          <button className="button secondary" onClick={close}>
            Cancel
          </button>
          <button className="button primary" onClick={submit}>
            Create site
          </button>
        </div>
      </div>
    </Modal>
  );
}
function ImportModal({
  existingIds,
  close,
  done,
}: {
  existingIds: string[];
  close: () => void;
  done: (drafts: SiteDraft[]) => void;
}) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [validation, setValidation] = useState<ImportValidation>();
  const load = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setValidation({ headers: [], rows: [], accepted: 0, rejected: 1 });
      setName("Only CSV files are supported in Phase 1.");
      return;
    }
    const content = await file.text();
    const nextHeaders = (parseCsv(content)[0] || []).map((header) =>
      header.trim(),
    );
    setName(file.name);
    setText(content);
    setHeaders(nextHeaders);
    setMapping(suggestMapping(nextHeaders));
    setValidation(undefined);
  };
  const validate = () =>
    setValidation(validateCsvImport(text, mapping, existingIds));
  const accepted =
    validation?.rows
      .filter((row) => row.errors.length === 0 && row.draft)
      .map((row) => row.draft!) || [];
  return (
    <Modal
      title="Import activation sites"
      subtitle="CSV is parsed and validated entirely in this browser."
      close={close}
    >
      <div className="stepper">
        <span className={!text ? "active" : ""}>1 Upload CSV</span>
        <span className={text && !validation ? "active" : ""}>
          2 Map fields
        </span>
        <span className={validation ? "active" : ""}>3 Validate</span>
      </div>
      {!text ? (
        <label className="dropzone">
          <Upload />
          <b>Choose a CSV file</b>
          <span>Files remain on this device and are never uploaded.</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
          />
          <em>Select CSV</em>
        </label>
      ) : (
        <>
          <div className="file-summary">
            <FileSpreadsheet />
            <div>
              <b>{name}</b>
              <span>
                {validation
                  ? `${validation.accepted} accepted · ${validation.rejected} rejected`
                  : "Map source columns to required fields"}
              </span>
            </div>
          </div>
          <div className="mapping import-mapping">
            <div>
              <b>Target field</b>
              <b>Source column</b>
            </div>
            {importFields.map((field) => (
              <div key={field}>
                <code>
                  {field}
                  {field !== "address" && " *"}
                </code>
                <ArrowUpRight />
                <select
                  value={mapping[field] || ""}
                  onChange={(e) => {
                    setMapping((current) => ({
                      ...current,
                      [field]: e.target.value,
                    }));
                    setValidation(undefined);
                  }}
                >
                  <option value="">Not mapped</option>
                  {headers.map((header) => (
                    <option key={header}>{header}</option>
                  ))}
                </select>
                {mapping[field] ? <Check /> : <CircleAlert />}
              </div>
            ))}
          </div>
          {!validation ? (
            <div className="modal-actions">
              <button className="button secondary" onClick={close}>
                Cancel
              </button>
              <button className="button primary" onClick={validate}>
                Validate rows
              </button>
            </div>
          ) : (
            <>
              <div
                className={`validation-callout ${validation.rejected ? "has-errors" : ""}`}
              >
                <CheckCircle2 />
                <div>
                  <b>
                    {validation.accepted} rows accepted · {validation.rejected}{" "}
                    rejected
                  </b>
                  <span>Only accepted rows will be imported.</span>
                </div>
              </div>
              <div className="import-preview">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Site ID</th>
                      <th>Merchant</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.rows.slice(0, 8).map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.draft?.id || "—"}</td>
                        <td>{row.draft?.merchant || "—"}</td>
                        <td
                          className={
                            row.errors.length ? "error-text" : "success-text"
                          }
                        >
                          {row.errors.join(" ") || "Ready"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setValidation(undefined)}
                >
                  Back to mapping
                </button>
                <button
                  className="button primary"
                  disabled={!accepted.length}
                  onClick={() => done(accepted)}
                >
                  Import {accepted.length} accepted rows
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function Assignments({
  sites,
  setSites,
  drivers,
  notify,
  setNotifications,
  onAssign,
}: {
  sites: Site[];
  setSites: React.Dispatch<React.SetStateAction<Site[]>>;
  drivers: Driver[];
  notify: (s: string) => void;
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  onAssign: (
    siteCodes: string[],
    driverId: string,
  ) => Promise<{ assigned: number; skipped: number }>;
}) {
  const [region, setRegion] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [driverId, setDriverId] = useState("");
  const [result, setResult] = useState("");
  const eligibleSites = useMemo(
    () =>
      filterSites(sites, q)
        .filter((site) => !region || site.region === region)
        .filter(
          (site) =>
            !["Under Review", "Verified", "Closed / Cancelled"].includes(
              site.status,
            ),
        ),
    [sites, q, region],
  );
  const selectedSites = sites.filter((site) => selected.includes(site.id));
  const selectionRegion = selectedSites[0]?.region || region;
  const available = drivers.filter(
    (driver) =>
      driver.region === selectionRegion && driver.active && driver.available,
  );
  const toggle = (site: Site, checked: boolean) => {
    if (
      checked &&
      selectedSites.length &&
      site.region !== selectedSites[0].region
    )
      return;
    setSelected((current) =>
      checked
        ? [...new Set([...current, site.id])]
        : current.filter((id) => id !== site.id),
    );
    setResult("");
  };
  const confirm = async () => {
    const driver = drivers.find((item) => item.id === driverId);
    if (!driver) return;
    try {
      const outcome = await onAssign(selected, driver.id);
      setNotifications((items) => [
        {
          id: `n-${Date.now()}`,
          type: "assignment",
          title: `${outcome.assigned} sites assigned`,
          detail: `Consolidated assignment event for ${driver.name}; ${outcome.skipped} skipped.`,
          at: "Just now",
          read: false,
        },
        ...items,
      ]);
      setResult(`${outcome.assigned} assigned · ${outcome.skipped} skipped`);
      notify(`${outcome.assigned} sites assigned to ${driver.name}`);
      setSelected([]);
      setDriverId("");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Assignment failed");
    }
  };
  return (
    <>
      <PageIntro
        title="Assignment management"
        text="Assign or reassign every eligible site in the current filtered result set."
      />
      <div className="assignment-grid">
        <div className="panel table-panel">
          <PanelHead
            title="Eligible sites"
            subtitle="Under Review, Verified and Closed / Cancelled sites are excluded"
          />
          <div className="table-tools">
            <label className="search">
              <Search />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search eligible sites…"
              />
            </label>
            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                setSelected([]);
                setDriverId("");
              }}
            >
              <option value="">All regions</option>
              {regions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button
              className="button ghost"
              disabled={!region || !eligibleSites.length}
              onClick={() => setSelected(eligibleSites.map((site) => site.id))}
            >
              Select all {region && fmt.format(eligibleSites.length)}
            </button>
            <span className="result-count">
              {fmt.format(eligibleSites.length)} eligible
            </span>
          </div>
          {selected.length > 0 && (
            <div className="bulkbar">
              <b>
                {fmt.format(selected.length)} selected across all filtered
                results
              </b>
              <button onClick={() => setSelected([])}>Clear</button>
            </div>
          )}
          <div className="table-scroll compact">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Site</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Current driver</th>
                </tr>
              </thead>
              <tbody>
                {eligibleSites.slice(0, 50).map((site) => (
                  <tr key={site.id}>
                    <td>
                      <input
                        aria-label={`Select ${site.id}`}
                        type="checkbox"
                        checked={selected.includes(site.id)}
                        disabled={
                          selectedSites.length > 0 &&
                          !selected.includes(site.id) &&
                          site.region !== selectedSites[0].region
                        }
                        onChange={(e) => toggle(site, e.target.checked)}
                      />
                    </td>
                    <td>
                      <b>{site.merchant}</b>
                      <small>{site.id}</small>
                    </td>
                    <td>{site.region}</td>
                    <td>
                      <Badge status={site.status} />
                    </td>
                    <td>
                      {drivers.find((driver) => driver.id === site.driverId)
                        ?.name || "Not assigned"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel assignment-side">
          <PanelHead
            title="Confirm assignment"
            subtitle="Workload is derived from current site records"
          />
          <div className="selection-summary">
            <span>{selected.length}</span>
            <div>
              <b>sites selected</b>
              <small>
                {selectionRegion || "Choose one region before bulk selection"}
              </small>
            </div>
          </div>
          <label>
            Active, available driver
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              disabled={!selectionRegion}
            >
              <option value="">Choose a driver…</option>
              {available.map((driver) => (
                <option value={driver.id} key={driver.id}>
                  {driver.name} · {workloadForDriver(sites, driver.id)} assigned
                </option>
              ))}
            </select>
          </label>
          {selectionRegion && available.length === 0 && (
            <div className="warning">
              <AlertTriangle />
              No eligible driver exists in {selectionRegion}. The sites remain
              unchanged.
            </div>
          )}
          {driverId && (
            <DriverLoad
              driver={drivers.find((driver) => driver.id === driverId)!}
              sites={sites}
            />
          )}
          <button
            className="button primary full"
            disabled={!driverId || selected.length === 0}
            onClick={confirm}
          >
            Confirm assignment
          </button>
          {result && (
            <div className="assignment-result">
              <CheckCircle2 />
              {result}
            </div>
          )}
          <p className="helper">
            <ShieldAlert /> Reassignment records the previous driver in each
            audit timeline.
          </p>
        </div>
      </div>
    </>
  );
}
function DriverLoad({ driver, sites }: { driver: Driver; sites: Site[] }) {
  const workload = workloadForDriver(sites, driver.id);
  return (
    <div className="driver-load">
      <div>
        <Avatar name={driver.name} />
        <span>
          <b>{driver.name}</b>
          <small>{driver.region}</small>
        </span>
      </div>
      <div className="load-label">
        <span>Current workload</span>
        <b>{workload} assigned sites</b>
      </div>
      <small className="config-note">
        No workload cap is enforced; any future limit is configurable.
      </small>
    </div>
  );
}

function DriversPage({
  drivers,
  setDrivers,
  sites,
  notify,
  onToggle,
  liveMode,
}: {
  drivers: Driver[];
  setDrivers: React.Dispatch<React.SetStateAction<Driver[]>>;
  sites: Site[];
  notify: (s: string) => void;
  onToggle: (id: string, key: "active" | "available") => Promise<void>;
  liveMode: boolean;
}) {
  const [modal, setModal] = useState(false);
  const toggle = async (id: string, key: "active" | "available") => {
    try {
      await onToggle(id, key);
      notify(`Driver ${key} updated`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Driver update failed");
    }
  };
  return (
    <>
      <PageIntro
        title="Driver management"
        text={`${drivers.length} registered field drivers across ${regions.length} regions.`}
        actions={
          <>
            <button
              className="button secondary"
              onClick={() =>
                notify(
                  "Driver CSV import remains a separate mock-only workflow",
                )
              }
            >
              <Upload /> Import CSV
            </button>
            <button
              className="button primary"
              disabled={liveMode}
              onClick={() => setModal(true)}
            >
              <Plus /> Add driver
            </button>
          </>
        }
      />
      <div className="driver-grid">
        {drivers.map((d) => {
          const assigned = workloadForDriver(sites, d.id);
          const verified = sites.filter(
            (s) => s.driverId === d.id && s.status === "Verified",
          ).length;
          return (
            <article className="driver-card" key={d.id}>
              <div className="driver-card-top">
                <Avatar name={d.name} />
                <div>
                  <b>{d.name}</b>
                  <span>
                    {d.code || d.id} · {d.region}
                  </span>
                </div>
              </div>
              <div className="driver-tags">
                <span className={d.active ? "success" : "muted-tag"}>
                  {d.active ? "Active" : "Deactivated"}
                </span>
                <span className={d.available ? "blue-tag" : "muted-tag"}>
                  {d.available ? "Available" : "Unavailable"}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Assigned sites</dt>
                  <dd>{assigned}</dd>
                </div>
                <div>
                  <dt>Completion</dt>
                  <dd>
                    {Math.round((verified / Math.max(1, assigned)) * 100)}%
                  </dd>
                </div>
              </dl>
              <div className="driver-contact">
                <span>{d.mobile}</span>
                <span>{d.email}</span>
              </div>
              <div className="driver-actions">
                <button onClick={() => void toggle(d.id, "available")}>
                  Override availability
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(
                      `${location.origin.replace("3000", "3001")}/login`,
                    );
                    notify("Demo activation link copied");
                  }}
                >
                  Copy invite link
                </button>
                <button onClick={() => void toggle(d.id, "active")}>
                  {d.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {modal && (
        <Modal
          title="Register driver"
          subtitle="Creates a fictional driver in this browser only."
          close={() => setModal(false)}
        >
          <div className="form-grid">
            <label>
              Full name
              <input id="new-driver-name" placeholder="Driver name" />
            </label>
            <label>
              Region
              <select id="new-driver-region">
                {regions.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              Mobile
              <input placeholder="+966 5X XXX XXXX" />
            </label>
            <label>
              Email
              <input placeholder="name@example.com" />
            </label>
            <div className="modal-actions span2">
              <button
                className="button secondary"
                onClick={() => setModal(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                onClick={() => {
                  const input = document.getElementById(
                    "new-driver-name",
                  ) as HTMLInputElement;
                  const region = document.getElementById(
                    "new-driver-region",
                  ) as HTMLSelectElement;
                  if (!input.value) return;
                  setDrivers((a) => [
                    ...a,
                    {
                      id: `DRV-${String(a.length + 1).padStart(3, "0")}`,
                      name: input.value,
                      mobile: "+966 50 000 0000",
                      email: "new.driver@demo.moka.invalid",
                      region: region.value as Driver["region"],
                      active: true,
                      available: true,
                    },
                  ]);
                  setModal(false);
                  notify("Driver registered and demo invite created");
                }}
              >
                Register driver
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

const declineReasons = [
  "Poster not visible",
  "Poor photo quality",
  "Incorrect installation",
  "Wrong site",
  "GPS mismatch",
  "Incomplete evidence",
  "Other",
];
function Reviews({
  sites,
  drivers,
  access,
  action,
  retryAssessment,
  saveAssessmentSettings,
  onSelect,
}: {
  sites: Site[];
  drivers: Driver[];
  access: OperationsAccess;
  action: (
    id: string,
    to: "Verified" | "Revisit Required" | "Flagged / Exception",
    detail: string,
  ) => void | Promise<void>;
  retryAssessment: (attemptId: string) => Promise<void>;
  saveAssessmentSettings: (
    settings: EvidenceAssessmentSettings,
  ) => Promise<void>;
  onSelect: (s: Site) => void;
}) {
  const language = useContext(LanguageContext);
  const copy = language === "ar"
    ? {
        assessment: "التقييم بمساعدة الذكاء الاصطناعي",
        reviewerRequired: "قرار المراجع مطلوب",
        allResults: "كل نتائج التقييم",
        allStates: "كل حالات المعالجة",
        allCriteria: "كل المعايير",
        settings: "معايير التقييم",
        retry: "إعادة التحليل",
        notAssessed: "لم يتم التقييم بعد",
        queued: "تمت إضافة التقييم إلى قائمة الانتظار.",
        confidence: "الثقة",
        model: "النموذج",
        evaluated: "وقت التقييم",
        shadow: "الوضع التجريبي: لا يغيّر التقييم ترتيب القائمة أو قرار المراجع.",
        riskSort: "ترتيب حسب المخاطر",
      }
    : {
        assessment: "AI-assisted assessment",
        reviewerRequired: "Reviewer decision required",
        allResults: "All assessment results",
        allStates: "All processing states",
        allCriteria: "All criteria",
        settings: "Assessment criteria",
        retry: "Retry analysis",
        notAssessed: "Not assessed yet",
        queued: "Assessment has been queued.",
        confidence: "Confidence",
        model: "Model",
        evaluated: "Evaluated",
        shadow: "Shadow mode: assessment does not change queue order or reviewer decisions.",
        riskSort: "Sort by risk",
      };
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [driverId, setDriverId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [assessmentResult, setAssessmentResult] = useState("");
  const [assessmentStatus, setAssessmentStatus] = useState("");
  const [criterion, setCriterion] = useState("");
  const [riskSort, setRiskSort] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(
    access.assessmentSettings,
  );
  const [assessmentBusy, setAssessmentBusy] = useState(false);
  const allReviews = sites.filter((s) => s.status === "Under Review");
  const reviewRegions = [...new Set(allReviews.map((s) => s.region))].sort();
  const reviewDrivers = drivers.filter((driver) =>
    allReviews.some((site) => site.driverId === driver.id),
  );
  const criterionOptions = Array.from(
    new Map(
      allReviews.flatMap((site) =>
        (latestAssessment(site.assessments ?? [])?.criteria ?? []).map((item) => [
          item.key,
          item.label,
        ]),
      ),
    ),
  );
  const riskRank: Record<string, number> = {
    likely_issue: 0,
    needs_review: 1,
    meets_criteria: 2,
  };
  const queue = allReviews.filter((site) => {
    const submittedAt = site.visitAttempts[0]?.submittedAt ?? site.updatedAt;
    const assessment = latestAssessment(site.assessments ?? []);
    const submittedDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(submittedAt));
    const needle = query.trim().toLowerCase();
    return (
      (!needle ||
        site.id.toLowerCase().includes(needle) ||
        site.merchant.toLowerCase().includes(needle)) &&
      (!region || site.region === region) &&
      (!driverId || site.driverId === driverId) &&
      (!dateFrom || submittedDate >= dateFrom) &&
      (!dateTo || submittedDate <= dateTo) &&
      (!assessmentResult || assessment?.result === assessmentResult) &&
      (!assessmentStatus || assessment?.status === assessmentStatus) &&
      (!criterion ||
        assessment?.criteria.some(
          (item) => item.key === criterion && item.outcome !== "pass",
        ))
    );
  }).sort((a, b) => {
    if (!riskSort || access.assessmentSettings?.rolloutMode !== "active") return 0;
    const left = latestAssessment(a.assessments ?? [])?.result ?? "needs_review";
    const right = latestAssessment(b.assessments ?? [])?.result ?? "needs_review";
    return riskRank[left] - riskRank[right];
  });
  const [activeId, setActiveId] = useState(queue[0]?.id);
  const active = queue.find((site) => site.id === activeId) ?? queue[0];
  const activeAssessment = active
    ? latestAssessment(active.assessments ?? [])
    : undefined;
  const queueIds = queue.map((site) => site.id).join("|");
  const firstQueueId = queue[0]?.id;
  const [reason, setReason] = useState(declineReasons[0]);
  const clearFilters = () => {
    setQuery("");
    setRegion("");
    setDriverId("");
    setDateFrom("");
    setDateTo("");
    setAssessmentResult("");
    setAssessmentStatus("");
    setCriterion("");
    setRiskSort(false);
  };
  const filters = (
    <div className="panel review-filters" aria-label="Review queue filters">
      <label className="search">
        <Search />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search site or merchant"
        />
      </label>
      <select value={region} onChange={(event) => setRegion(event.target.value)}>
        <option value="">All regions</option>
        {reviewRegions.map((item) => <option key={item}>{item}</option>)}
      </select>
      <select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
        <option value="">All drivers</option>
        {reviewDrivers.map((driver) => (
          <option key={driver.id} value={driver.id}>{driver.name}</option>
        ))}
      </select>
      <label className="date-filter">
        <span>From</span>
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
      </label>
      <label className="date-filter">
        <span>To</span>
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </label>
      <select
        value={assessmentResult}
        onChange={(event) => setAssessmentResult(event.target.value)}
        aria-label={copy.allResults}
      >
        <option value="">{copy.allResults}</option>
        <option value="meets_criteria">Meets criteria</option>
        <option value="needs_review">Needs review</option>
        <option value="likely_issue">Likely issue</option>
      </select>
      <select
        value={assessmentStatus}
        onChange={(event) => setAssessmentStatus(event.target.value)}
        aria-label={copy.allStates}
      >
        <option value="">{copy.allStates}</option>
        {(["queued", "processing", "completed", "failed"] as AssessmentStatus[]).map((item) => (
          <option key={item} value={item}>{assessmentStatusLabel(item)}</option>
        ))}
      </select>
      <select
        value={criterion}
        onChange={(event) => setCriterion(event.target.value)}
        aria-label={copy.allCriteria}
      >
        <option value="">{copy.allCriteria}</option>
        {criterionOptions.map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
      <label className="risk-sort" title={access.assessmentSettings?.rolloutMode === "shadow" ? copy.shadow : undefined}>
        <input
          type="checkbox"
          checked={riskSort}
          disabled={access.assessmentSettings?.rolloutMode !== "active"}
          onChange={(event) => setRiskSort(event.target.checked)}
        />
        {copy.riskSort}
      </label>
      <span className="result-count">{fmt.format(queue.length)} results</span>
      <button className="button secondary" onClick={clearFilters} disabled={!query && !region && !driverId && !dateFrom && !dateTo && !assessmentResult && !assessmentStatus && !criterion && !riskSort}>
        <X /> Clear
      </button>
    </div>
  );
  useEffect(() => {
    if (!activeId || !queueIds.split("|").includes(activeId)) setActiveId(firstQueueId);
  }, [activeId, firstQueueId, queueIds]);
  useEffect(() => {
    setSettingsDraft(access.assessmentSettings);
  }, [access.assessmentSettings]);
  if (!active)
    return (
      <>
        <PageIntro
          title="Review queue"
          text={`${fmt.format(queue.length)} of ${fmt.format(allReviews.length)} submissions shown.`}
        />
        {filters}
        <Empty
          title={allReviews.length ? "No matching submissions" : "Review queue cleared"}
          text={allReviews.length ? "Adjust or clear the filters to see more submissions." : "There is no submitted evidence awaiting a decision."}
        />
      </>
    );
  return (
    <>
      <PageIntro
        title="Review queue"
        text={`${fmt.format(queue.length)} of ${fmt.format(allReviews.length)} submissions shown.`}
        actions={access.assessmentSettings ? (
          <button className="button secondary" onClick={() => setSettingsOpen(true)}>
            <Gauge /> {copy.settings}
          </button>
        ) : undefined}
      />
      {filters}
      <div className="review-layout">
        <div className="panel review-list">
          {queue.slice(0, 25).map((s) => (
            <button
              className={active.id === s.id ? "active" : ""}
              key={s.id}
              onClick={() => setActiveId(s.id)}
            >
              <span className="review-thumb">
                <MapPin />
              </span>
              <span>
                <b>{s.merchant}</b>
                <small>
                  {s.id} · {s.city}
                </small>
                <em>
                  Submitted{" "}
                  {new Date(s.updatedAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </em>
                <span className={`assessment-pill ${latestAssessment(s.assessments ?? [])?.result ?? "pending"}`}>
                  {latestAssessment(s.assessments ?? [])?.status === "completed"
                    ? assessmentResultLabel(latestAssessment(s.assessments ?? [])?.result)
                    : assessmentStatusLabel(latestAssessment(s.assessments ?? [])?.status)}
                </span>
              </span>
              <ChevronRight />
            </button>
          ))}
        </div>
        <div className="panel evidence">
          <div className="evidence-head">
            <div>
              <span className="eyebrow">Evidence review</span>
              <h2>{active.merchant}</h2>
              <p>
                {active.id} · {active.address || "Address not provided"}
              </p>
            </div>
            <Badge status={active.status} />
          </div>
          <div className="photo-grid">
            <div>
              <span>Installation photo</span>
              {active.evidence?.find(
                (item) => item.kind === "installation_photo",
              )?.signedUrl ? (
                <img
                  src={
                    active.evidence.find(
                      (item) => item.kind === "installation_photo",
                    )?.signedUrl
                  }
                  alt="Installation evidence"
                />
              ) : (
                <div className="photo-placeholder">
                  <Building2 />
                  <b>Evidence unavailable</b>
                  <small>Awaiting driver upload</small>
                </div>
              )}
              {active.evidence?.find(
                (item) => item.kind === "installation_photo",
              )?.uploadedAt ? (
                <small className="server-upload-time">
                  Server uploaded {new Date(active.evidence.find(
                    (item) => item.kind === "installation_photo",
                  )!.uploadedAt!).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })} AST
                </small>
              ) : null}
            </div>
            <div>
              <span>Close-up evidence</span>
              {active.evidence?.find((item) => item.kind === "close_up_photo")
                ?.signedUrl ? (
                <img
                  src={
                    active.evidence.find(
                      (item) => item.kind === "close_up_photo",
                    )?.signedUrl
                  }
                  alt="Close-up evidence"
                />
              ) : (
                <div className="photo-placeholder alt">
                  <MapPin />
                  <b>Evidence unavailable</b>
                  <small>Awaiting driver upload</small>
                </div>
              )}
              {active.evidence?.find((item) => item.kind === "close_up_photo")
                ?.uploadedAt ? (
                <small className="server-upload-time">
                  Server uploaded {new Date(active.evidence.find(
                    (item) => item.kind === "close_up_photo",
                  )!.uploadedAt!).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })} AST
                </small>
              ) : null}
            </div>
          </div>
          <div className="evidence-metrics">
            <div>
              <MapPin />
              <span>
                <small>GPS proximity</small>
                <b>
                  {active.gpsProximityMetres == null
                    ? "Not captured"
                    : `${Math.round(active.gpsProximityMetres)} metres`}
                </b>
              </span>
              <em className="pass">
                <Check /> Recorded
              </em>
            </div>
            <div>
              <Sparkles />
              <span>
                <small>{copy.assessment}</small>
                <b>{activeAssessment?.status === "completed" ? assessmentResultLabel(activeAssessment.result) : assessmentStatusLabel(activeAssessment?.status)}</b>
              </span>
              <em>{copy.reviewerRequired}</em>
            </div>
            <div>
              <RefreshCw />
              <span>
                <small>Visit attempts</small>
                <b>{active.visitAttempts.length} recorded</b>
              </span>
              <button onClick={() => onSelect(active)}>View history</button>
            </div>
          </div>
          <section className={`assessment-card ${activeAssessment?.result ?? "pending"}`} aria-label={copy.assessment}>
            <div className="assessment-card-head">
              <div>
                <span className="eyebrow">{copy.assessment}</span>
                <h3>{activeAssessment?.status === "completed" ? assessmentResultLabel(activeAssessment.result) : assessmentStatusLabel(activeAssessment?.status)}</h3>
                <p>{access.assessmentSettings?.rolloutMode === "shadow" ? copy.shadow : copy.reviewerRequired}</p>
              </div>
              {activeAssessment && !["queued", "processing"].includes(activeAssessment.status) && active.visitAttempts[0]?.id ? (
                <button
                  className="button secondary"
                  disabled={assessmentBusy}
                  onClick={async () => {
                    setAssessmentBusy(true);
                    try { await retryAssessment(active.visitAttempts[0].id); }
                    finally { setAssessmentBusy(false); }
                  }}
                >
                  <RefreshCw className={assessmentBusy ? "spin" : ""} /> {copy.retry}
                </button>
              ) : null}
            </div>
            {activeAssessment?.criteria.length ? (
              <div className="assessment-checklist">
                {activeAssessment.criteria.map((item) => (
                  <div key={item.key} className={item.outcome}>
                    {item.outcome === "pass" ? <Check /> : item.outcome === "fail" ? <AlertTriangle /> : <CircleAlert />}
                    <span>
                      <b>{item.label}</b>
                      <small>{item.detail}</small>
                    </span>
                    <em>{item.outcome}{item.confidence == null ? "" : ` · ${Math.round(item.confidence * 100)}%`}</em>
                  </div>
                ))}
              </div>
            ) : (
              <div className="assessment-empty">
                <Sparkles />
                <span>{activeAssessment?.status === "queued" ? copy.queued : copy.notAssessed}</span>
              </div>
            )}
            {activeAssessment ? (
              <div className="assessment-meta">
                <span>{copy.confidence}: {activeAssessment.confidence == null ? "—" : `${Math.round(activeAssessment.confidence * 100)}%`}</span>
                <span>{copy.model}: {activeAssessment.model ?? "—"}</span>
                <span>{copy.evaluated}: {activeAssessment.completedAt ? new Date(activeAssessment.completedAt).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }) : "—"}</span>
                <span>Run {activeAssessment.runNumber} · rules {activeAssessment.ruleVersion}</span>
              </div>
            ) : null}
          </section>
          <div className="driver-note">
            <span className="eyebrow">Driver note</span>
            <p>{active.fieldNotes || "No field note was submitted."}</p>
          </div>
          <div className="decision-box">
            <label>
              Decline / revisit reason
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {declineReasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <div>
              <button
                className="button secondary danger-text"
                onClick={() =>
                  void action(active.id, "Flagged / Exception", reason)
                }
              >
                <AlertTriangle /> Flag
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  void action(active.id, "Revisit Required", reason)
                }
              >
                <RefreshCw /> Request revisit
              </button>
              <button
                className="button primary"
                onClick={() =>
                  void action(
                    active.id,
                    "Verified",
                    "Evidence approved by operations",
                  )
                }
              >
                <Check /> Verify site
              </button>
            </div>
          </div>
        </div>
      </div>
      {settingsOpen && settingsDraft ? (
        <Modal
          title={copy.settings}
          subtitle={access.role === "admin" ? "Organization-wide advisory thresholds." : "Read-only for your Operations role."}
          close={() => setSettingsOpen(false)}
        >
          <div className="assessment-settings form-grid">
            <label>
              GPS threshold (metres)
              <input type="number" min="10" max="5000" value={settingsDraft.gpsThresholdMetres} disabled={access.role !== "admin"} onChange={(event) => setSettingsDraft({ ...settingsDraft, gpsThresholdMetres: Number(event.target.value) })} />
            </label>
            <label>
              Capture/upload warning (minutes)
              <input type="number" min="1" max="10080" value={settingsDraft.captureUploadWarningMinutes} disabled={access.role !== "admin"} onChange={(event) => setSettingsDraft({ ...settingsDraft, captureUploadWarningMinutes: Number(event.target.value) })} />
            </label>
            <label>
              Minimum image width
              <input type="number" min="320" max="12000" value={settingsDraft.minImageWidth} disabled={access.role !== "admin"} onChange={(event) => setSettingsDraft({ ...settingsDraft, minImageWidth: Number(event.target.value) })} />
            </label>
            <label>
              Minimum image height
              <input type="number" min="320" max="12000" value={settingsDraft.minImageHeight} disabled={access.role !== "admin"} onChange={(event) => setSettingsDraft({ ...settingsDraft, minImageHeight: Number(event.target.value) })} />
            </label>
            <label>
              Pass confidence
              <input type="number" min="0" max="1" step="0.01" value={settingsDraft.passConfidence} disabled={access.role !== "admin"} onChange={(event) => setSettingsDraft({ ...settingsDraft, passConfidence: Number(event.target.value) })} />
            </label>
            <label>
              Issue confidence
              <input type="number" min="0" max="1" step="0.01" value={settingsDraft.issueConfidence} disabled={access.role !== "admin"} onChange={(event) => setSettingsDraft({ ...settingsDraft, issueConfidence: Number(event.target.value) })} />
            </label>
            <label>
              Rollout mode
              <select value={settingsDraft.rolloutMode} disabled={access.role !== "admin"} onChange={(event) => setSettingsDraft({ ...settingsDraft, rolloutMode: event.target.value as "shadow" | "active" })}>
                <option value="shadow">Shadow</option>
                <option value="active">Active filters</option>
              </select>
            </label>
            <label className="settings-toggle">
              <input type="checkbox" checked={settingsDraft.enabled} disabled={access.role !== "admin"} onChange={(event) => setSettingsDraft({ ...settingsDraft, enabled: event.target.checked })} />
              Assessment enabled
            </label>
            <p className="config-note span2">AI results are advisory. Settings never authorize automatic approval or rejection.</p>
            <div className="modal-actions span2">
              <button className="button secondary" onClick={() => setSettingsOpen(false)}>Close</button>
              {access.role === "admin" ? (
                <button className="button primary" onClick={async () => { await saveAssessmentSettings(settingsDraft); setSettingsOpen(false); }}>
                  Save criteria
                </button>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Exceptions({
  sites,
  action,
  onSelect,
}: {
  sites: Site[];
  action: (id: string, to: SiteStatus, detail: string) => void | Promise<void>;
  onSelect: (s: Site) => void;
}) {
  const reasons = [
    "GPS mismatch",
    "Unable to install",
    "Rejected evidence",
    "Simulated AI flag",
  ];
  const [reason, setReason] = useState("");
  const [region, setRegion] = useState("");
  const source = sites.filter(
    (s) =>
      s.status === "Flagged / Exception" || s.status === "Revisit Required",
  );
  const items = source
    .map((s, i) => ({
      site: s,
      reason:
        s.exceptionReason ??
        (s.status === "Revisit Required"
          ? "Rejected evidence"
          : reasons[i % reasons.length]),
    }))
    .filter(
      (x) =>
        (!reason || x.reason === reason) &&
        (!region || x.site.region === region),
    );
  return (
    <>
      <PageIntro
        title="Exceptions center"
        text="Unified handling for field, evidence and simulated automated flags."
        actions={
          <span className="demo-chip">
            <Sparkles /> AI checks are simulated
          </span>
        }
      />
      <div className="panel table-panel">
        <div className="table-tools">
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">All reasons</option>
            {reasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <span className="result-count">
            {fmt.format(items.length)} open records
          </span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Exception</th>
                <th>Site</th>
                <th>Region</th>
                <th>Driver</th>
                <th>Site status</th>
                <th>Opened</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 35).map(({ site: s, reason }, i) => (
                <tr key={s.id}>
                  <td>
                    <span className="reason">
                      <AlertTriangle />
                      {reason}
                      {reason === "Simulated AI flag" && <em>SIMULATED</em>}
                    </span>
                  </td>
                  <td>
                    <button className="link-button" onClick={() => onSelect(s)}>
                      <b>{s.merchant}</b>
                      <small>{s.id}</small>
                    </button>
                  </td>
                  <td>{s.region}</td>
                  <td>{s.driverId || "—"}</td>
                  <td>
                    <Badge status={s.status} />
                  </td>
                  <td>
                    {s.exceptionOpenedAt
                      ? new Date(s.exceptionOpenedAt).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : `${2 + (i % 9)}h ago`}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => onSelect(s)}>Review</button>
                      {canTransition(s.status, "Assigned") && (
                        <button
                          onClick={() =>
                            action(s.id, "Assigned", "Exception reassigned")
                          }
                        >
                          Reassign
                        </button>
                      )}
                      {canTransition(s.status, "Verified") && (
                        <button
                          onClick={() =>
                            action(
                              s.id,
                              "Verified",
                              "Exception resolved by operations",
                            )
                          }
                        >
                          Resolve
                        </button>
                      )}
                      {canTransition(s.status, "Closed / Cancelled") && (
                        <button
                          onClick={() =>
                            action(
                              s.id,
                              "Closed / Cancelled",
                              "Exception closed",
                            )
                          }
                        >
                          Close
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Reports({
  sites,
  notify,
}: {
  sites: Site[];
  notify: (s: string) => void;
}) {
  const groups = regions.map((r) => {
    const a = sites.filter((s) => s.region === r);
    return {
      name: r,
      total: a.length,
      verified: a.filter((s) => s.status === "Verified").length,
      review: a.filter((s) => s.status === "Under Review").length,
      flagged: a.filter((s) => s.status === "Flagged / Exception").length,
    };
  });
  const exportCsv = () => {
    const text =
      "region,total,verified,under_review,flagged\n" +
      groups.map((g) => Object.values(g).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "moka-completion-summary.csv";
    a.click();
    URL.revokeObjectURL(url);
    notify("Report export downloaded");
  };
  return (
    <>
      <PageIntro
        title="Reports"
        text="Completion summaries consistent with the current 10,000-site dataset."
        actions={
          <button className="button primary" onClick={exportCsv}>
            <Download /> Export Excel-compatible CSV
          </button>
        }
      />
      <div className="report-callout">
        <FileSpreadsheet />
        <div>
          <b>DMC reporting template placeholder</b>
          <span>
            The exact supplied template was not available. Export uses the
            current dashboard data shape.
          </span>
        </div>
        <button
          onClick={() => notify("Template configuration is pending DMC input")}
        >
          View open decision
        </button>
      </div>
      <div className="panel table-panel">
        <PanelHead
          title="Regional completion summary"
          subtitle="Current data · all categories and drivers"
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Region</th>
                <th>Total sites</th>
                <th>Verified</th>
                <th>Under review</th>
                <th>Flagged</th>
                <th>Completion</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const p = Math.round((g.verified / g.total) * 100);
                return (
                  <tr key={g.name}>
                    <td>
                      <b>{g.name}</b>
                    </td>
                    <td>{fmt.format(g.total)}</td>
                    <td>{fmt.format(g.verified)}</td>
                    <td>{fmt.format(g.review)}</td>
                    <td>{fmt.format(g.flagged)}</td>
                    <td>
                      <div className="completion-cell">
                        <div className="track">
                          <i style={{ width: `${p}%` }} />
                        </div>
                        <b>{p}%</b>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="chart-cards">
        <div className="panel">
          <PanelHead title="Completion by category" />
          <div className="bar-chart">
            {categories.map((c) => {
              const a = sites.filter((s) => s.category === c);
              const p = Math.round(
                (a.filter((s) => s.status === "Verified").length / a.length) *
                  100,
              );
              return (
                <div key={c}>
                  <span>{c}</span>
                  <div className="track">
                    <i style={{ width: `${p}%` }} />
                  </div>
                  <b>{p}%</b>
                </div>
              );
            })}
          </div>
        </div>
        <div className="panel">
          <PanelHead title="Data coverage" />
          <div className="coverage">
            <Gauge />
            <strong>100%</strong>
            <span>10,000 of 10,000 mock records included</span>
            <small>Last recalculated just now</small>
          </div>
        </div>
      </div>
    </>
  );
}

function Notifications({
  items,
  setItems,
}: {
  items: Notification[];
  setItems: React.Dispatch<React.SetStateAction<Notification[]>>;
}) {
  const icons = {
    assignment: UserCheck,
    review: ClipboardCheck,
    exception: AlertTriangle,
    revisit: RefreshCw,
    approval: CheckCircle2,
  };
  return (
    <>
      <PageIntro
        title="Notifications"
        text="Consolidated operational events and review updates."
        actions={
          <button
            className="button secondary"
            onClick={() =>
              setItems((a) => a.map((n) => ({ ...n, read: true })))
            }
          >
            <Check /> Mark all as read
          </button>
        }
      />
      <div className="panel notifications">
        {items.map((n) => {
          const NotificationIcon = icons[n.type];
          return (
            <button
              key={n.id}
              className={n.read ? "" : "unread"}
              onClick={() =>
                setItems((a) =>
                  a.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
                )
              }
            >
              <span className={`notification-icon ${n.type}`}>
                <NotificationIcon />
              </span>
              <span>
                <b>{n.title}</b>
                <em>{n.detail}</em>
                <small>{n.at}</small>
              </span>
              {!n.read && <i />}
            </button>
          );
        })}
      </div>
    </>
  );
}

function SiteDrawer({
  site,
  driver,
  onClose,
}: {
  site: Site;
  driver?: Driver;
  onClose: () => void;
}) {
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <span className="eyebrow">Site detail</span>
            <h2>{site.merchant}</h2>
            <p>{site.id}</p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="drawer-status">
          <Badge status={site.status} />
          <span>
            Updated{" "}
            {new Date(site.updatedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
        <section>
          <h3>Distinct workflow states</h3>
          <dl className="detail-grid state-grid">
            <div>
              <dt>Site status</dt>
              <dd>{site.status}</dd>
            </div>
            <div>
              <dt>Latest visit attempt</dt>
              <dd>{site.attemptStatus}</dd>
            </div>
            <div>
              <dt>Exception status</dt>
              <dd>{site.exceptionStatus || "None"}</dd>
            </div>
            <div>
              <dt>Recorded attempts</dt>
              <dd>{site.visitAttempts.length}</dd>
            </div>
          </dl>
        </section>
        <section>
          <h3>Merchant & location</h3>
          <dl className="detail-grid">
            <div>
              <dt>Category</dt>
              <dd>{site.category}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{site.region}</dd>
            </div>
            <div className="span2">
              <dt>Address</dt>
              <dd>{site.address || "Not provided"}</dd>
            </div>
            <div>
              <dt>Latitude</dt>
              <dd>{site.lat.toFixed(5)}</dd>
            </div>
            <div>
              <dt>Longitude</dt>
              <dd>{site.lng.toFixed(5)}</dd>
            </div>
          </dl>
          <a
            className="button secondary full"
            href={`https://www.google.com/maps?q=${site.lat},${site.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin /> Open in external maps <ArrowUpRight />
          </a>
        </section>
        <section>
          <h3>Assigned driver</h3>
          {driver ? (
            <div className="assigned-driver">
              <Avatar name={driver.name} />
              <div>
                <b>{driver.name}</b>
                <span>
                  {driver.id} · {driver.mobile}
                </span>
              </div>
              <span className="blue-tag">
                {driver.available ? "Available" : "Unavailable"}
              </span>
            </div>
          ) : (
            <div className="empty-mini">No driver is currently assigned.</div>
          )}
        </section>
        <section>
          <h3>Visit & audit history</h3>
          <div className="audit">
            {site.audit.map((e) => (
              <div key={e.id}>
                <i />
                <span>
                  <b>{e.action}</b>
                  <small>
                    {e.actor} ·{" "}
                    {new Date(e.at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                  <p>{e.detail}</p>
                </span>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function PageIntro({
  title,
  text,
  actions,
}: {
  title: string;
  text: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
function Pagination({
  page,
  pages,
  setPage,
}: {
  page: number;
  pages: number;
  setPage: (n: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        Page {page} of {pages}
      </span>
      <div>
        <button
          className="icon-btn"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft />
        </button>
        {[page, Math.min(pages, page + 1), Math.min(pages, page + 2)]
          .filter((x, i, a) => a.indexOf(x) === i)
          .map((x) => (
            <button
              key={x}
              className={x === page ? "active" : ""}
              onClick={() => setPage(x)}
            >
              {x}
            </button>
          ))}
        <button
          className="icon-btn"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  close,
  children,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) close();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={close}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <CheckCircle2 />
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
