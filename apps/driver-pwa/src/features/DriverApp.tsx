"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  LocateFixed,
  LogOut,
  MapPin,
  RefreshCw,
  Send,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { canSubmitEvidence, getEvidenceSubmissionIssue } from "@/features/evidence";
import { driverCopy, type DriverLanguage } from "@/features/i18n";
import {
  buildEvidenceObjectPaths,
  fileExtension,
  sha256,
  stampEvidencePhoto,
  type CapturedPhoto,
} from "@/features/photo-evidence";

type Driver = {
  id: string;
  organization_id: string;
  full_name: string;
  driver_code: string;
  region: { name_en: string } | { name_en: string }[] | null;
};
type Attempt = {
  id: string;
  status: string;
  notes: string | null;
  submitted_at: string | null;
  review_decisions:
    | {
        decision: string;
        reason_code: string | null;
        notes: string | null;
        created_at: string;
      }[]
    | null;
};
type SiteException = {
  reason: string;
  status: string;
  details: Record<string, unknown> | null;
  created_at: string;
};
type Site = {
  id: string;
  site_code: string;
  merchant_name: string;
  address: string | null;
  status: string;
  latitude: number;
  longitude: number;
  city: { name_en: string } | { name_en: string }[] | null;
  category: { name_en: string } | { name_en: string }[] | null;
  visit_attempts: Attempt[] | null;
  exceptions: SiteException[] | null;
};
type Position = { latitude: number; longitude: number; accuracy: number };

const errorMessage = (cause: unknown, fallback: string) => {
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
};

const isExistingStorageObject = (cause: unknown) => {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as { statusCode?: string | number; message?: string };
  return (
    String(error.statusCode) === "409" ||
    error.message?.toLowerCase().includes("already exists") === true ||
    error.message?.toLowerCase().includes("duplicate") === true
  );
};

const statusKeys = {
  assigned: "assigned",
  in_progress: "inProgress",
  under_review: "underReview",
  verified: "verified",
  revisit_required: "revisitRequired",
  flagged_exception: "exception",
} as const;
const relationName = (
  value: { name_en: string } | { name_en: string }[] | null,
) => (Array.isArray(value) ? value[0]?.name_en : value?.name_en);
function capturePosition() {
  return new Promise<Position>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS is not supported on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (locationError) => {
        if (locationError.code === locationError.PERMISSION_DENIED) {
          reject(new Error("Location access was denied. Allow location for this site in browser settings, then try again."));
          return;
        }
        if (locationError.code === locationError.TIMEOUT) {
          reject(new Error("GPS timed out. Move to an open area and try again."));
          return;
        }
        reject(new Error("A reliable GPS position could not be obtained. Check location services and try again."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export function DriverApp() {
  const supabase = useMemo(() => createClient(), []);
  const [driver, setDriver] = useState<Driver>();
  const [sites, setSites] = useState<Site[]>([]);
  const [active, setActive] = useState<Site>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState<Position>();
  const [attemptId, setAttemptId] = useState<string>();
  const [photoOne, setPhotoOne] = useState<CapturedPhoto>();
  const [photoTwo, setPhotoTwo] = useState<CapturedPhoto>();
  const [processingPhoto, setProcessingPhoto] = useState<
    "installation" | "closeup"
  >();
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [localDemo, setLocalDemo] = useState(false);
  const [language, setLanguage] = useState<DriverLanguage>("en");
  const tr = (key: Parameters<typeof driverCopy>[1]) => driverCopy(language, key);
  const statusLabel = (status: string) => {
    const key = statusKeys[status as keyof typeof statusKeys];
    return key ? tr(key) : status;
  };
  const load = useCallback(async () => {
    setError("");
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Your session has expired.");
      const { data: driverRow, error: driverError } = await supabase
        .from("drivers")
        .select(
          "id,organization_id,full_name,driver_code,region:regions!drivers_region_id_fkey(name_en)",
        )
        .eq("user_id", user.id)
        .single();
      if (driverError || !driverRow)
        throw new Error(
          "This account is not linked to an active driver profile.",
        );
      setDriver(driverRow as Driver);
      const { data: siteRows, error: siteError } = await supabase
        .from("sites")
        .select(
          "id,site_code,merchant_name,address,status,latitude,longitude,city:cities!sites_city_id_fkey(name_en),category:merchant_categories!sites_category_id_fkey(name_en),visit_attempts(id,status,notes,submitted_at,review_decisions(decision,reason_code,notes,created_at)),exceptions(reason,status,details,created_at)",
        )
        .eq("assigned_driver_id", driverRow.id)
        .order("updated_at", { ascending: false });
      if (siteError) throw siteError;
      const nextSites = (siteRows ?? []) as Site[];
      setSites(nextSites);
      setActive((current) =>
        current ? nextSites.find((site) => site.id === current.id) : current,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load assignments",
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setLocalDemo(["localhost", "127.0.0.1"].includes(window.location.hostname));
    const saved = window.localStorage.getItem("driver-language");
    if (saved === "ar") setLanguage("ar");
  }, []);
  const toggleLanguage = () => {
    const next = language === "en" ? "ar" : "en";
    setLanguage(next);
    window.localStorage.setItem("driver-language", next);
  };
  const startVisitAt = async (gps: Position, message: string) => {
    if (!active) return;
    setPosition(gps);
    const { data, error: rpcError } = await supabase.rpc("start_site_visit", {
      p_site_code: active.site_code,
      p_latitude: gps.latitude,
      p_longitude: gps.longitude,
    });
    if (rpcError) throw rpcError;
    setAttemptId(data);
    setConfirmation(message);
  };
  const begin = async () => {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const gps = await capturePosition();
      await startVisitAt(gps, "GPS captured. Add both evidence photos.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to start visit",
      );
    } finally {
      setBusy(false);
    }
  };
  const useDemoLocation = async () => {
    if (!active || !localDemo) return;
    setBusy(true);
    setError("");
    try {
      await startVisitAt(
        {
          latitude: active.latitude,
          longitude: active.longitude,
          accuracy: 5,
        },
        "Demo location captured at the fictional site coordinates. Add both evidence photos.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start demo visit");
    } finally {
      setBusy(false);
    }
  };
  const ensureAttempt = async () => {
    if (attemptId) return attemptId;
    if (!active) throw new Error("Choose a site first.");
    const gps = position ?? (await capturePosition());
    setPosition(gps);
    const { data, error: rpcError } = await supabase.rpc("start_site_visit", {
      p_site_code: active.site_code,
      p_latitude: gps.latitude,
      p_longitude: gps.longitude,
    });
    if (rpcError) throw rpcError;
    setAttemptId(data);
    return data as string;
  };
  const getServerCaptureTime = async () => {
    const response = await fetch("/api/time", { cache: "no-store" });
    if (!response.ok) throw new Error(tr("captureTimeUnavailable"));
    const payload = (await response.json()) as { serverTime?: string };
    if (!payload.serverTime || Number.isNaN(Date.parse(payload.serverTime))) {
      throw new Error(tr("captureTimeInvalid"));
    }
    return payload.serverTime;
  };
  const capturePhoto = async (
    file: File | undefined,
    slot: "installation" | "closeup",
  ) => {
    if (!file || !active || !driver) return;
    if (!position) {
      setError(tr("gpsBeforePhotos"));
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError(tr("photoTypeError"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(tr("photoSizeError"));
      return;
    }
    setProcessingPhoto(slot);
    setError("");
    try {
      const capturedAt = await getServerCaptureTime();
      const evidenceUid = crypto.randomUUID();
      const stamped = await stampEvidencePhoto(file, {
        capturedAt,
        latitude: position.latitude,
        longitude: position.longitude,
        siteCode: active.site_code,
        language,
      });
      if (stamped.size > 10 * 1024 * 1024) {
        throw new Error(tr("stampedPhotoSizeError"));
      }
      const next: CapturedPhoto = {
        original: file,
        stamped,
        evidenceUid,
        capturedAt,
        latitude: position.latitude,
        longitude: position.longitude,
        siteCode: active.site_code,
        language,
        previewUrl: URL.createObjectURL(stamped),
      };
      const setter = slot === "installation" ? setPhotoOne : setPhotoTwo;
      setter((previous) => {
        if (previous) URL.revokeObjectURL(previous.previewUrl);
        return next;
      });
      setConfirmation(tr("photoReady"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("photoStampFailed"));
    } finally {
      setProcessingPhoto(undefined);
    }
  };
  const upload = async (
    photo: CapturedPhoto,
    kind: "installation_photo" | "close_up_photo",
    id: string,
    userId: string,
  ) => {
    if (!active || !driver) throw new Error("Site context is missing.");
    const paths = buildEvidenceObjectPaths(
      driver.organization_id,
      active.id,
      id,
      photo.evidenceUid,
      fileExtension(photo.original),
      fileExtension(photo.stamped),
    );
    const sharedMetadata = {
      evidence_uid: photo.evidenceUid,
      capture_timestamp: photo.capturedAt,
      capture_time_source: "application_server",
      capture_timezone: "Asia/Riyadh",
      stamp_language: photo.language ?? language,
      driver_id: driver.id,
      site_id: active.id,
      site_code: active.site_code,
      attempt_id: id,
      latitude: photo.latitude.toFixed(6),
      longitude: photo.longitude.toFixed(6),
    };
    const [originalChecksum, stampedChecksum] = await Promise.all([
      sha256(photo.original),
      sha256(photo.stamped),
    ]);
    const [originalUpload, stampedUpload] = await Promise.all([
      supabase.storage.from("site-evidence").upload(paths.original, photo.original, {
        contentType: photo.original.type,
        upsert: false,
        metadata: { ...sharedMetadata, variant: "original" },
      }),
      supabase.storage.from("site-evidence").upload(paths.stamped, photo.stamped, {
        contentType: photo.stamped.type,
        upsert: false,
        metadata: { ...sharedMetadata, variant: "stamped" },
      }),
    ]);
    if (originalUpload.error && !isExistingStorageObject(originalUpload.error)) {
      throw originalUpload.error;
    }
    if (stampedUpload.error && !isExistingStorageObject(stampedUpload.error)) {
      throw stampedUpload.error;
    }
    const originalRecordId = crypto.randomUUID();
    const { error: metadataError } = await supabase
      .from("evidence_files")
      .insert([
        {
          id: photo.evidenceUid,
          organization_id: driver.organization_id,
          site_id: active.id,
          attempt_id: id,
          kind,
          bucket_id: "site-evidence",
          object_path: paths.stamped,
          mime_type: photo.stamped.type,
          size_bytes: photo.stamped.size,
          checksum_sha256: stampedChecksum,
          uploaded_by: userId,
          evidence_uid: photo.evidenceUid,
          variant: "stamped",
          capture_timestamp: photo.capturedAt,
          capture_time_source: "application_server",
          stamp_language: photo.language ?? language,
          captured_latitude: photo.latitude,
          captured_longitude: photo.longitude,
        },
        {
          id: originalRecordId,
          organization_id: driver.organization_id,
          site_id: active.id,
          attempt_id: id,
          kind: "other",
          bucket_id: "site-evidence",
          object_path: paths.original,
          mime_type: photo.original.type,
          size_bytes: photo.original.size,
          checksum_sha256: originalChecksum,
          uploaded_by: userId,
          evidence_uid: photo.evidenceUid,
          variant: "original",
          capture_timestamp: photo.capturedAt,
          capture_time_source: "application_server",
          stamp_language: photo.language ?? language,
          captured_latitude: photo.latitude,
          captured_longitude: photo.longitude,
        },
      ]);
    if (metadataError) throw metadataError;
  };
  const submit = async () => {
    if (!active) return;
    const submissionIssue = getEvidenceSubmissionIssue({
      gpsCaptured: Boolean(position),
      installationPhoto: Boolean(photoOne),
      closeUpPhoto: Boolean(photoTwo),
    });
    if (submissionIssue) {
      setError(submissionIssue);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = await ensureAttempt();
      const gps = position!;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session has expired.");
      await Promise.all([
        upload(photoOne!, "installation_photo", id, user.id),
        upload(photoTwo!, "close_up_photo", id, user.id),
      ]);
      const { error: submitError } = await supabase.rpc(
        "submit_site_evidence",
        {
          p_attempt_id: id,
          p_latitude: gps.latitude,
          p_longitude: gps.longitude,
          p_notes: notes || null,
        },
      );
      if (submitError) throw submitError;
      setConfirmation("Evidence submitted to Operations for review.");
      setPhotoOne((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return undefined;
      });
      setPhotoTwo((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl);
        return undefined;
      });
      setNotes("");
      await load();
    } catch (cause) {
      setError(errorMessage(cause, "Evidence submission failed"));
    } finally {
      setBusy(false);
    }
  };
  const reportIssue = async () => {
    if (!notes.trim()) {
      setError("Describe why installation could not be completed.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = await ensureAttempt();
      const { error: issueError } = await supabase.rpc("report_site_issue", {
        p_attempt_id: id,
        p_notes: notes.trim(),
      });
      if (issueError) throw issueError;
      setConfirmation("Unable-to-install report sent to Operations.");
      setNotes("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Report failed");
    } finally {
      setBusy(false);
    }
  };
  const pending = useMemo(
    () =>
      sites.filter(
        (site) => !["verified", "closed_cancelled"].includes(site.status),
      ),
    [sites],
  );
  if (loading)
    return (
      <main className="loading">
        <LoaderCircle className="spin" />
        <b>{tr("loading")}</b>
      </main>
    );
  if (active) {
    const latest = [...(active.visit_attempts ?? [])].sort(
      (a, b) =>
        Date.parse(b.submitted_at ?? "1970") -
        Date.parse(a.submitted_at ?? "1970"),
    )[0];
    const decision = latest?.review_decisions?.[0];
    const latestException = [...(active.exceptions ?? [])].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    )[0];
    const exceptionReason =
      typeof latestException?.details?.reason_code === "string"
        ? latestException.details.reason_code
        : latestException?.reason;
    return (
      <main dir={language === "ar" ? "rtl" : "ltr"} lang={language}>
        <header className="mobile-header">
          <button
            className="icon"
            onClick={() => {
              setActive(undefined);
              setAttemptId(undefined);
              setPosition(undefined);
              setPhotoOne((current) => {
                if (current) URL.revokeObjectURL(current.previewUrl);
                return undefined;
              });
              setPhotoTwo((current) => {
                if (current) URL.revokeObjectURL(current.previewUrl);
                return undefined;
              });
              setError("");
              setConfirmation("");
            }}
            aria-label="Back"
          >
            <ArrowLeft />
          </button>
          <div>
            <b>{active.site_code}</b>
            <span>{statusLabel(active.status)}</span>
          </div>
        </header>
        <section className="site-detail">
          <div className="detail-hero">
            <span className={`status ${active.status}`}>
              {statusLabel(active.status)}
            </span>
            <h1>{active.merchant_name}</h1>
            <p>
              <MapPin />
              {active.address ||
                relationName(active.city) ||
                tr("locationUnavailable")}
            </p>
          </div>
          {active.status === "revisit_required" && (
            <div className="revisit">
              <RefreshCw />
              <div>
                <b>{tr("revisitRequested")}</b>
                <p>
                  {decision?.notes ||
                    decision?.reason_code ||
                    exceptionReason ||
                    tr("revisitFallback")}
                </p>
              </div>
            </div>
          )}
          <div className="workflow-card">
            <div className="step">
              <span>1</span>
              <div>
                <b>{tr("navigateToSite")}</b>
              </div>
              <a
                className="step-link"
                href={`https://www.google.com/maps?q=${active.latitude},${active.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink /> {tr("openMaps")}
              </a>
            </div>
            <div className="step">
              <span>2</span>
              <div>
                <b>{tr("captureLocation")}</b>
              </div>
              {position ? (
                <CheckCircle2 className="ok" />
              ) : (
                <button onClick={begin} disabled={busy}>
                  <LocateFixed />
                  {busy ? tr("capturing") : tr("captureGps")}
                </button>
              )}
            </div>
            {position && (
              <div className="gps">
                <b>{tr("gpsCaptured")}</b>
                <span>±{Math.round(position.accuracy)}m {tr("accuracy")}</span>
              </div>
            )}
            {!position && localDemo && error ? (
              <button className="demo-location" onClick={useDemoLocation} disabled={busy}>
                {tr("demoLocation")}
              </button>
            ) : null}
            <div className="step photos">
              <span>3</span>
              <div>
                <b>{tr("addPhotos")}</b>
              </div>
            </div>
            <div className="photo-inputs">
              <label
                className={photoOne ? "ready" : ""}
                aria-disabled={!position || busy || Boolean(processingPhoto)}
              >
                {photoOne ? (
                  <img src={photoOne.previewUrl} alt="Stamped installation evidence preview" />
                ) : (
                  <Camera />
                )}
                {photoOne ? (
                  <>
                    <b>{tr("installationReady")}</b>
                    <small>{tr("tapToRetake")}</small>
                  </>
                ) : (
                  <>
                    <b>{tr("installationPhoto")}</b>
                    <small>
                      {processingPhoto === "installation"
                        ? tr("stampingPhoto")
                        : position
                          ? tr("useCamera")
                          : tr("gpsBeforePhotos")}
                    </small>
                  </>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  disabled={!position || busy || Boolean(processingPhoto)}
                  onChange={(event) => {
                    void capturePhoto(event.target.files?.[0], "installation");
                    event.target.value = "";
                  }}
                />
              </label>
              <label
                className={photoTwo ? "ready" : ""}
                aria-disabled={!position || busy || Boolean(processingPhoto)}
              >
                {photoTwo ? (
                  <img src={photoTwo.previewUrl} alt="Stamped close-up evidence preview" />
                ) : (
                  <Camera />
                )}
                {photoTwo ? (
                  <>
                    <b>{tr("closeupReady")}</b>
                    <small>{tr("tapToRetake")}</small>
                  </>
                ) : (
                  <>
                    <b>{tr("closeupEvidence")}</b>
                    <small>
                      {processingPhoto === "closeup"
                        ? tr("stampingPhoto")
                        : position
                          ? tr("useCamera")
                          : tr("gpsBeforePhotos")}
                    </small>
                  </>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  disabled={!position || busy || Boolean(processingPhoto)}
                  onChange={(event) => {
                    void capturePhoto(event.target.files?.[0], "closeup");
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <details className="evidence-time-note">
              <summary>{tr("aboutPhotoStamps")}</summary>
              <p>{tr("evidenceTimeNote")}</p>
            </details>
            <label className="notes">
              {tr("fieldNotes")}
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={tr("notesPlaceholder")}
              />
            </label>
            <div className="issue-action">
              <small>{tr("issueHint")}</small>
              <button
                className="unable"
                onClick={reportIssue}
                disabled={busy || !notes.trim()}
              >
                <AlertTriangle />
                {tr("unable")}
              </button>
            </div>
            {error ? (
              <div className="message error">
                <AlertTriangle />
                {error}
              </div>
            ) : null}
            {confirmation ? (
              <div className="message success">
                <CheckCircle2 />
                {confirmation}
              </div>
            ) : null}
            <button
              className="submit"
              onClick={submit}
              disabled={
                busy ||
                !canSubmitEvidence({
                  gpsCaptured: Boolean(position),
                  installationPhoto: Boolean(photoOne),
                  closeUpPhoto: Boolean(photoTwo),
                })
              }
            >
              <Upload />
              {busy ? tr("submitting") : tr("submit")}
            </button>
          </div>
        </section>
      </main>
    );
  }
  return (
    <main dir={language === "ar" ? "rtl" : "ltr"} lang={language}>
      <header className="app-header">
        <div className="brand">
          <span>DMC</span>
          <b>10 Billion Steps</b>
          <small>{tr("driverApp")}</small>
        </div>
        <div className="header-actions">
          <button className="language-toggle" type="button" onClick={toggleLanguage}>
            {language === "en" ? "العربية" : "EN"}
          </button>
        <form action="/auth/signout" method="post">
          <button className="icon" aria-label="Sign out">
            <LogOut />
          </button>
        </form>
        </div>
      </header>
      <section className="home">
        <p className="kicker">{tr("todaysFieldwork")}</p>
        <h1>{tr("hello")}, {driver?.full_name.split(" ")[0]}</h1>
        <p>
          {pending.length} {tr("activeAssignments")} ·{" "}
          {relationName(driver?.region ?? null)}
        </p>
        {error ? (
          <div className="message error">
            <AlertTriangle />
            {error}
          </div>
        ) : null}
        <div className="summary">
          <div>
            <b>{pending.length}</b>
            <span>{tr("active")}</span>
          </div>
          <div>
            <b>
              {sites.filter((site) => site.status === "under_review").length}
            </b>
            <span>{tr("inReview")}</span>
          </div>
          <div>
            <b>{sites.filter((site) => site.status === "verified").length}</b>
            <span>{tr("verified")}</span>
          </div>
        </div>
        <div className="assignment-list">
          {pending.map((site) => (
            <button
              key={site.id}
              onClick={() => {
                setActive(site);
                setError("");
                setConfirmation("");
                const inProgress = site.visit_attempts?.find(
                  (attempt) => attempt.status === "in_progress",
                );
                setAttemptId(inProgress?.id);
              }}
            >
              <span className={`pin ${site.status}`}>
                <MapPin />
              </span>
              <span>
                <b>{site.merchant_name}</b>
                <small>
                  {site.site_code} · {relationName(site.city)}
                </small>
                <em className={site.status}>
                  {statusLabel(site.status)}
                </em>
              </span>
              <ChevronRight />
            </button>
          ))}
          {pending.length === 0 ? (
            <div className="empty">
              <CheckCircle2 />
              <h2>{tr("allCaughtUp")}</h2>
              <p>{tr("noSites")}</p>
            </div>
          ) : null}
        </div>
        <button className="refresh" onClick={() => void load()}>
          <RefreshCw />
          {tr("refresh")}
        </button>
      </section>
    </main>
  );
}
