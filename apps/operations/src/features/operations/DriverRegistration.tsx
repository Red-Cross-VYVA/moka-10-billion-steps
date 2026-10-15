"use client";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { regions as demoRegions } from "@/data/fixtures";
import {
  loadDriverRegions,
  registerLiveDriver,
  validateDriver,
  type DriverDraft,
  type DriverErrors,
  type DriverRegion,
} from "@/data/driver-registration";
import type { Driver } from "@/domain/model";
import type { Language } from "@/i18n/translations";
import "./driver-registration.css";

const emptyDraft: DriverDraft = {
  code: "",
  name: "",
  regionId: "",
  mobile: "",
  email: "",
};

export function DriverRegistration({
  liveMode,
  language,
  existingCodes,
  onCreated,
}: {
  liveMode: boolean;
  language: Language;
  existingCodes: string[];
  onCreated: (driver: Driver) => void;
}) {
  const ar = language === "ar";
  const tx = (en: string, arabic: string) => (ar ? arabic : en);
  const client = useMemo(() => (liveMode ? createClient() : null), [liveMode]);
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const id = useId();
  const [regions, setRegions] = useState<DriverRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState<DriverDraft>(emptyDraft);
  const [errors, setErrors] = useState<DriverErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    const task = client
      ? loadDriverRegions(client)
      : Promise.resolve(
          demoRegions.map((name) => ({
            id: name,
            name,
            organizationId: "demo",
            organizationName: "Demo",
          })),
        );
    task
      .then((items) => {
        if (active) setRegions(items);
      })
      .catch((cause) => {
        if (active) {
          setRegions([]);
          setLoadError(
            cause instanceof Error ? cause.message : "Unable to load regions.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, retry]);
  const open = () => {
    setDraft(emptyDraft);
    setErrors({});
    setError("");
    dialog.current?.showModal();
  };
  const close = () => {
    if (!lock.current) dialog.current?.close();
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    const nextErrors = validateDriver(draft, regions);
    if (
      !client &&
      existingCodes.some(
        (code) => code.toLowerCase() === draft.code.trim().toLowerCase(),
      )
    )
      nextErrors.code = tx(
        "This driver code already exists.",
        "رمز السائق موجود بالفعل.",
      );
    setErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length) return;
    lock.current = true;
    setBusy(true);
    try {
      const region = regions.find((item) => item.id === draft.regionId)!;
      const driver: Driver = client
        ? await registerLiveDriver(client, draft, regions)
        : {
            id: `DRV-${crypto.randomUUID()}`,
            code: draft.code.trim(),
            name: draft.name.trim(),
            mobile: draft.mobile.trim(),
            email: draft.email.trim() || "—",
            region: region.name as Driver["region"],
            active: true,
            available: true,
          };
      onCreated(driver);
      dialog.current?.close();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tx("Unable to save the driver.", "تعذر حفظ السائق."),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="driver-registration">
      <button
        type="button"
        className="button primary"
        disabled={loading || !regions.length}
        aria-haspopup="dialog"
        onClick={open}
      >
        <Plus />
        {loading
          ? tx("Checking access…", "جارٍ التحقق من الصلاحية…")
          : tx("Add driver", "إضافة سائق")}
      </button>
      {!loading && !regions.length && (
        <span
          className="driver-registration-note"
          role={loadError ? "alert" : "status"}
        >
          {loadError ||
            tx(
              "An active administrator or operator with an available region can add drivers.",
              "يمكن لمسؤول أو مشغّل نشط لديه منطقة متاحة إضافة السائقين.",
            )}
          {loadError && (
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              {tx("Retry", "إعادة المحاولة")}
            </button>
          )}
        </span>
      )}
      <dialog
        ref={dialog}
        className="driver-registration-dialog"
        dir={ar ? "rtl" : "ltr"}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCancel={(event) => {
          if (lock.current) event.preventDefault();
        }}
      >
        <header>
          <div>
            <h2 id={`${id}-title`}>{tx("Register driver", "تسجيل سائق")}</h2>
            <p id={`${id}-description`}>
              {client
                ? tx(
                    "Create a driver profile for assignments. No invitation email is sent.",
                    "أنشئ ملف سائق للتعيينات. لن تُرسل رسالة دعوة.",
                  )
                : tx(
                    "Demo profile · Saved only on this device.",
                    "ملف تجريبي · يُحفظ على هذا الجهاز فقط.",
                  )}
            </p>
          </div>
          <button
            className="icon-btn"
            type="button"
            disabled={busy}
            onClick={close}
            aria-label={tx("Close driver registration", "إغلاق تسجيل السائق")}
          >
            <X />
          </button>
        </header>
        <form onSubmit={submit} noValidate>
          <div className="driver-registration-fields">
            {(
              [
                ["code", "Driver code", "رمز السائق", 50],
                ["name", "Full name", "الاسم الكامل", 200],
              ] as const
            ).map(([key, en, a, max]) => (
              <label key={key} htmlFor={`${id}-${key}`}>
                {tx(en, a)} <span>*</span>
                <input
                  id={`${id}-${key}`}
                  required
                  autoFocus={key === "code"}
                  maxLength={max}
                  disabled={busy}
                  value={draft[key]}
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={
                    errors[key] ? `${id}-${key}-error` : undefined
                  }
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      [key]: event.target.value,
                    }))
                  }
                  placeholder={
                    key === "code" ? "DRV-003" : tx("Driver name", "اسم السائق")
                  }
                />
                {errors[key] && (
                  <small id={`${id}-${key}-error`} className="field-error">
                    {errors[key]}
                  </small>
                )}
              </label>
            ))}
            <label className="span2" htmlFor={`${id}-region`}>
              {tx("Region", "المنطقة")} <span>*</span>
              <select
                id={`${id}-region`}
                required
                disabled={busy}
                value={draft.regionId}
                aria-invalid={Boolean(errors.regionId)}
                aria-describedby={
                  errors.regionId ? `${id}-region-error` : undefined
                }
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    regionId: event.target.value,
                  }))
                }
              >
                <option value="">
                  {tx("Choose a region", "اختر المنطقة")}
                </option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                    {new Set(regions.map((item) => item.organizationId)).size >
                    1
                      ? ` · ${region.organizationName}`
                      : ""}
                  </option>
                ))}
              </select>
              {errors.regionId && (
                <small id={`${id}-region-error`} className="field-error">
                  {errors.regionId}
                </small>
              )}
            </label>
            {(
              [
                ["mobile", "Mobile", "الهاتف", 60, "tel"],
                [
                  "email",
                  "Email (optional)",
                  "البريد الإلكتروني (اختياري)",
                  254,
                  "email",
                ],
              ] as const
            ).map(([key, en, a, max, type]) => (
              <label key={key} htmlFor={`${id}-${key}`}>
                {tx(en, a)} {key === "mobile" && <span>*</span>}
                <input
                  id={`${id}-${key}`}
                  type={type}
                  required={key === "mobile"}
                  autoComplete={type}
                  maxLength={max}
                  disabled={busy}
                  value={draft[key]}
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={
                    errors[key] ? `${id}-${key}-error` : undefined
                  }
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      [key]: event.target.value,
                    }))
                  }
                />
                {errors[key] && (
                  <small id={`${id}-${key}-error`} className="field-error">
                    {key === "mobile" &&
                    errors[key] === "Mobile number is required."
                      ? tx("Mobile number is required.", "رقم الهاتف مطلوب.")
                      : errors[key]}
                  </small>
                )}
              </label>
            ))}
          </div>
          {client && (
            <p className="driver-registration-access">
              {tx(
                "Signing in requires an invited account linked to this profile. An email address here is contact information only.",
                "يتطلب تسجيل الدخول حساباً مدعواً مرتبطاً بهذا الملف. البريد الإلكتروني هنا مخصص للتواصل فقط.",
              )}
            </p>
          )}
          {error && (
            <p className="driver-registration-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={close}
            >
              {tx("Cancel", "إلغاء")}
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              {busy
                ? tx("Saving…", "جارٍ الحفظ…")
                : tx("Register driver", "تسجيل سائق")}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
