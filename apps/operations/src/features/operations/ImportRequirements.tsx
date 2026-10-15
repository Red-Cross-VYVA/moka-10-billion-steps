"use client";

import { useId, useRef } from "react";
import { CircleHelp, Download, X } from "lucide-react";
import { categories, regions } from "@/data/fixtures";
import { importFields, type ImportField } from "@/data/site-import";
import type { Language } from "@/i18n/translations";
import "./import-requirements.css";

const guidance: Record<ImportField, [string, string]> = {
  id: [
    "Unique site code. Do not reuse a code already in the system or this file.",
    "رمز فريد للموقع. لا تكرر رمزاً موجوداً في النظام أو الملف.",
  ],
  merchant: ["Merchant or site name.", "اسم التاجر أو الموقع."],
  region: [
    "Use one of the region names listed below, with the same spelling.",
    "استخدم إحدى المناطق أدناه بنفس التهجئة.",
  ],
  city: [
    "An existing city in the selected region. Match its name exactly.",
    "مدينة موجودة ضمن المنطقة المحددة. طابق الاسم تماماً.",
  ],
  category: [
    "Use one of the categories listed below, with the same spelling.",
    "استخدم إحدى الفئات أدناه بنفس التهجئة.",
  ],
  lat: [
    "Actual decimal latitude, from −90 to 90.",
    "خط العرض الفعلي بالدرجات العشرية، من −90 إلى 90.",
  ],
  lng: [
    "Actual decimal longitude, from −180 to 180.",
    "خط الطول الفعلي بالدرجات العشرية، من −180 إلى 180.",
  ],
  address: [
    "Street address. Recommended, but may be left blank.",
    "عنوان الشارع. يُنصح بإضافته ويمكن تركه فارغاً.",
  ],
};
const sampleCsv = `${importFields.join(",")}\nEXAMPLE-001,Example Store,Riyadh,Riyadh,Grocery,24.7136,46.6753,King Road\n`;

export function ImportRequirements({ language }: { language: Language }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const ar = language === "ar";
  const tx = (en: string, arabic: string) => (ar ? arabic : en);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + sampleCsv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "site-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <button
        type="button"
        className="button secondary"
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={() => dialog.current?.showModal()}
      >
        <CircleHelp />
        {tx("Import requirements", "متطلبات الاستيراد")}
      </button>
      <dialog
        ref={dialog}
        id={id}
        className="import-guide-dialog"
        dir={ar ? "rtl" : "ltr"}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <header className="import-guide-header">
          <div>
            <span>{tx("SITE IMPORT GUIDE", "دليل استيراد المواقع")}</span>
            <h2 id={`${id}-title`}>
              {tx("Prepare your site list", "جهّز قائمة المواقع")}
            </h2>
            <p id={`${id}-description`}>
              {tx(
                "7 required fields · CSV format · One site per row",
                "٧ حقول إلزامية · ملف CSV · موقع واحد في كل صف",
              )}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            autoFocus
            onClick={() => dialog.current?.close()}
            aria-label={tx(
              "Close import requirements",
              "إغلاق متطلبات الاستيراد",
            )}
          >
            <X />
          </button>
        </header>
        <div className="import-guide-body">
          <div className="import-guide-table">
            <table>
              <thead>
                <tr>
                  <th>{tx("Column", "العمود")}</th>
                  <th>{tx("Required?", "إلزامي؟")}</th>
                  <th>{tx("What to enter", "القيمة المطلوبة")}</th>
                </tr>
              </thead>
              <tbody>
                {importFields.map((field) => (
                  <tr key={field}>
                    <td>
                      <code dir="ltr">{field}</code>
                    </td>
                    <td>
                      {field === "address"
                        ? tx("Optional", "اختياري")
                        : tx("Required", "إلزامي")}
                    </td>
                    <td>{guidance[field][ar ? 1 : 0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="import-guide-values">
            <section>
              <h3>{tx("Accepted regions", "المناطق المقبولة")}</h3>
              <p dir="ltr">{regions.join(" · ")}</p>
            </section>
            <section>
              <h3>{tx("Accepted categories", "الفئات المقبولة")}</h3>
              <p dir="ltr">{categories.join(" · ")}</p>
            </section>
          </div>
          <h3>{tx("Before you import", "قبل الاستيراد")}</h3>
          <ul>
            <li>
              {tx(
                "Save as a comma-separated CSV in UTF-8, with a header row. Convert Excel files to CSV first.",
                "احفظ الملف بصيغة CSV مفصولة بفواصل وبترميز UTF-8 مع صف عناوين. حوّل ملفات Excel إلى CSV أولاً.",
              )}
            </li>
            <li>
              {tx(
                "You can map different column headings during upload. Region, city and category values must match the accepted names.",
                "يمكنك ربط عناوين الأعمدة المختلفة أثناء الرفع. يجب أن تطابق قيم المنطقة والمدينة والفئة الأسماء المقبولة.",
              )}
            </li>
            <li>
              {tx(
                "Contacts, drivers, photos and scan counts are not required. Add contacts and assign drivers after importing.",
                "لا تُطلب بيانات الاتصال أو السائقين أو الصور أو أعداد المسح. أضف بيانات الاتصال وعيّن السائقين بعد الاستيراد.",
              )}
            </li>
            <li>
              {tx(
                "Validate the rows and review errors before confirming. Start with a few sites before importing your full list.",
                "تحقق من الصفوف وراجع الأخطاء قبل التأكيد. ابدأ بعدد قليل من المواقع قبل استيراد القائمة كاملة.",
              )}
            </li>
          </ul>
          <h3>{tx("Example CSV", "مثال CSV")}</h3>
          <pre dir="ltr">{sampleCsv}</pre>
          <p className="import-guide-example-note">
            {tx(
              "The sample row is fictional. Replace it with your own site details before importing.",
              "صف المثال افتراضي. استبدله ببيانات موقعك قبل الاستيراد.",
            )}
          </p>
        </div>
        <footer>
          <button type="button" className="button secondary" onClick={download}>
            <Download />
            {tx("Download CSV template", "تنزيل نموذج CSV")}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => dialog.current?.close()}
          >
            {tx("Got it", "فهمت")}
          </button>
        </footer>
      </dialog>
    </>
  );
}
