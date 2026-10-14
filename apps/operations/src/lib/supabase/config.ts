export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey)
    throw new Error("Supabase environment variables are not configured.");
  return { url, publishableKey };
}

export const hasSupabaseConfig = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

export const isSupabaseAuthRequired =
  process.env.NEXT_PUBLIC_SUPABASE_AUTH_REQUIRED === "true";

export function getSafeNextPath(value: string | null, fallback = "/overview") {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(value)
    ? value
    : fallback;
}
