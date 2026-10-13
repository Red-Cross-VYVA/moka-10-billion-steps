import type { Category, Driver, Notification, Region, Site, SiteStatus } from "@/domain/model";

const regionConfig: Record<Region, { cities: string[]; center: [number, number] }> = {
  Riyadh: { cities: ["Riyadh", "Al Kharj", "Diriyah"], center: [46.6753, 24.7136] },
  Makkah: { cities: ["Jeddah", "Makkah", "Taif"], center: [39.1925, 21.4858] },
  "Eastern Province": { cities: ["Dammam", "Khobar", "Dhahran"], center: [50.1033, 26.4207] },
  Madinah: { cities: ["Madinah", "Yanbu"], center: [39.5692, 24.5247] },
  Asir: { cities: ["Abha", "Khamis Mushait"], center: [42.5053, 18.2164] },
};
const regions = Object.keys(regionConfig) as Region[];
const categories: Category[] = ["Grocery", "Pharmacy", "Café", "Restaurant", "Convenience", "Electronics"];
const statuses: SiteStatus[] = ["Unassigned", "Assigned", "In Progress", "Under Review", "Verified", "Revisit Required", "Flagged / Exception", "Closed / Cancelled"];
const weights = [13, 17, 10, 12, 35, 6, 5, 2];
const merchantRoots = ["Palm", "Sadu", "Nakhla", "Misk", "Dune", "Wadi", "Nour", "Sahab", "Tuwaiq", "Rawabi", "Mada", "Rimal"];
function hash(n: number) { const x = Math.sin(n * 999.91) * 43758.5453; return x - Math.floor(x); }
function weightedStatus(n: number) { let v = hash(n) * 100; for (let i=0;i<weights.length;i++) { v -= weights[i]; if (v <= 0) return statuses[i]; } return statuses[0]; }

export const drivers: Driver[] = Array.from({ length: 14 }, (_, i) => {
  const region = regions[i % regions.length];
  return { id: `DRV-${String(i + 1).padStart(3, "0")}`, name: `${["Rayan","Noor","Salman","Dana","Faisal","Lina","Omar","Hala","Ziad","Sara","Adel","Maya","Tariq","Reem"][i]} ${["Al Harbi","Al Qahtani","Al Otaibi","Al Zahrani"][i%4]}`, mobile: `+966 5${(i%8)+1} 000 ${String(1200+i*37).slice(-4)}`, email: `driver.${i+1}@demo.moka.invalid`, region, active: i !== 12, available: i % 5 !== 4, assignedCount: 0, workloadLimit: 180 };
});

export function generateSites(count = 10000): Site[] {
  drivers.forEach(driver => { driver.assignedCount = 0; });
  const result: Site[] = [];
  for (let i=0;i<count;i++) {
    const region = regions[i % regions.length], cfg = regionConfig[region], status = weightedStatus(i + 17);
    const city = cfg.cities[Math.floor(hash(i + 3) * cfg.cities.length)], category = categories[Math.floor(hash(i + 8) * categories.length)];
    const eligible = drivers.filter(d => d.region === region && d.active);
    const assigned = status !== "Unassigned" && status !== "Closed / Cancelled" ? eligible[i % eligible.length] : undefined;
    if (assigned) assigned.assignedCount++;
    const day = 1 + (i % 28), hour = 8 + (i % 10);
    result.push({ id: `KSA-${String(i+1).padStart(5,"0")}`, merchant: `${merchantRoots[i%merchantRoots.length]} ${category} ${String(100+i).slice(-3)}`, region, city, category, status, driverId: assigned?.id, lat: cfg.center[1] + (hash(i+21)-.5)*1.6, lng: cfg.center[0] + (hash(i+33)-.5)*1.8, updatedAt: `2026-10-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:00:00Z`, address: `${120 + (i%880)} ${["King Road","Olaya Street","Corniche Road","Prince Sultan Road"][i%4]}, ${city}`, attemptStatus: status === "Under Review" ? "Submitted" : status === "Verified" ? "Accepted" : status === "Revisit Required" || status === "Flagged / Exception" ? "Rejected" : status === "In Progress" ? "In progress" : "Not started", audit: [{ id: `evt-${i}-1`, at: `2026-10-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:00:00Z`, actor: assigned?.name ?? "Operations import", action: status === "Unassigned" ? "Site imported" : `Status changed to ${status}`, detail: "Deterministic demo event" }] });
  }
  return result;
}

export const initialNotifications: Notification[] = [
  { id: "n1", type: "review", title: "24 evidence packs ready", detail: "Riyadh review queue received new submissions.", at: "10 minutes ago", read: false },
  { id: "n2", type: "exception", title: "GPS mismatch cluster", detail: "6 sites in Jeddah require attention.", at: "42 minutes ago", read: false },
  { id: "n3", type: "assignment", title: "Assignment completed", detail: "84 sites assigned to three drivers.", at: "2 hours ago", read: true },
  { id: "n4", type: "approval", title: "Review batch approved", detail: "31 sites moved to Verified.", at: "Yesterday", read: true },
];

export { regionConfig, regions, categories };
