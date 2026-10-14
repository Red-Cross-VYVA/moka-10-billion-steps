export function extractSiteCode(value: string) {
  const raw = value.trim();
  try {
    const url = new URL(raw);
    return (
      url.searchParams.get("site_code") ??
      url.searchParams.get("site") ??
      url.pathname.split("/").filter(Boolean).at(-1) ??
      raw
    ).toUpperCase();
  } catch {
    return raw.toUpperCase();
  }
}
