// v3.73.0: Shared classification for payments and memberships.
// Do not classify by member: a single member can buy aqua and ground products.
export type BillingCategory = "aqua" | "ground" | "device";
function knownCategory(value: unknown): BillingCategory | undefined {
  const v = String(value ?? "").trim().toLowerCase();
  if (["ground", "지상", "지상재활"].includes(v)) return "ground";
  if (["device", "디바이스", "디바이스케어"].includes(v)) return "device";
  if (["aqua", "수중", "수중재활"].includes(v)) return "aqua";
}
function namedCategory(value: unknown): BillingCategory | undefined {
  const v = String(value ?? "").toLowerCase();
  if (/디바이스|리커버리|device|recovery/.test(v)) return "device";
  if (/지상|ground/.test(v)) return "ground";
  if (/수중|aqua/.test(v)) return "aqua";
}
function productName(value: unknown): string {
  return String(value ?? "").replace(/\s*\(\+서비스\s*\d+회\)\s*$/, "").trim().toLowerCase();
}
export function resolveBillingCategory(row: any, plans: any[] = [], linked?: any): BillingCategory {
  const nested = Array.isArray(row?.memberships) ? row.memberships[0] : row?.memberships;
  const membership = linked || nested;
  const ids = [row?.plan_id, membership?.plan_id].filter(Boolean);
  const byId = plans.find(p => ids.includes(p.id));
  if (byId) {
    const c = namedCategory(byId.name) || knownCategory(byId.service_track) || knownCategory(byId.category) || knownCategory(byId.track);
    if (c) return c;
  }
  const names = [membership?.plan_name, row?.plan_name, row?.lesson_name, row?.description].filter(Boolean);
  // Explicit product names repair legacy rows whose category defaulted to aqua.
  for (const n of names) { const c = namedCategory(n); if (c) return c; }
  for (const n of names) {
    const matches = plans.filter(p => productName(p.name) === productName(n));
    const categories = Array.from(new Set(matches.map(p => namedCategory(p.name) || knownCategory(p.service_track) || knownCategory(p.category) || knownCategory(p.track)).filter(Boolean)));
    if (categories.length === 1) return categories[0] as BillingCategory;
  }
  const cats = [membership?.service_track, membership?.track, membership?.category, row?.service_track, row?.track, row?.category].map(knownCategory).filter(Boolean);
  // aqua is a legacy default; explicit ground/device evidence wins.
  return cats.find(c => c === "ground" || c === "device") || cats[0] || "aqua";
}
