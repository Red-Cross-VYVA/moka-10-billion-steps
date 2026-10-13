import type { SiteStatus } from "../domain/model";
export type Language="en"|"ar";
export const copy={
  en:{overview:"Overview",sites:"Sites",map:"Geographic map",assignments:"Assignments",drivers:"Drivers",reviews:"Review queue",exceptions:"Exceptions",reports:"Reports",notifications:"Notifications",addSite:"Add site",importCsv:"Import CSV",search:"Search site ID or merchant…",allRegions:"All regions",allCities:"All cities",allCategories:"All categories",allStatuses:"All statuses",allDrivers:"All drivers",results:"results",createSite:"Create site",cancel:"Cancel",confirmAssignment:"Confirm assignment",markAllRead:"Mark all as read",openReview:"Open review queue"},
  ar:{overview:"نظرة عامة",sites:"المواقع",map:"الخريطة الجغرافية",assignments:"التعيينات",drivers:"السائقون",reviews:"قائمة المراجعة",exceptions:"الاستثناءات",reports:"التقارير",notifications:"الإشعارات",addSite:"إضافة موقع",importCsv:"استيراد CSV",search:"البحث بمعرّف الموقع أو اسم التاجر…",allRegions:"كل المناطق",allCities:"كل المدن",allCategories:"كل الفئات",allStatuses:"كل الحالات",allDrivers:"كل السائقين",results:"نتيجة",createSite:"إنشاء الموقع",cancel:"إلغاء",confirmAssignment:"تأكيد التعيين",markAllRead:"تحديد الكل كمقروء",openReview:"فتح قائمة المراجعة"}
} as const;
export const statusArabic:Record<SiteStatus,string>={"Unassigned":"غير معيّن","Assigned":"معيّن","In Progress":"قيد التنفيذ","Under Review":"قيد المراجعة","Verified":"موثّق","Revisit Required":"تتطلب إعادة زيارة","Flagged / Exception":"معلّم / استثناء","Closed / Cancelled":"مغلق / ملغى"};
export function t(language:Language,key:keyof typeof copy.en){return copy[language][key]}
export function statusLabel(language:Language,status:SiteStatus){return language==="ar"?statusArabic[status]:status}
