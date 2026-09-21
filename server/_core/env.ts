export const ENV = {
  /** Supabase project URL, e.g. https://abcdefgh.supabase.co */
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  /**
   * Where Supabase publishes the keys it signs access tokens with. Overridable
   * for a self-hosted project; derived from `supabaseUrl` when unset.
   */
  supabaseJwksUrl: process.env.SUPABASE_JWKS_URL ?? "",
  /**
   * Server-only key (`sb_secret_...`). Bypasses row level security, so it must
   * never reach a client bundle.
   */
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  /**
   * Account granted the admin role. Replaces the old `OWNER_OPEN_ID` check,
   * which relied on an identifier the new provider does not issue.
   */
  ownerEmail: process.env.OWNER_EMAIL ?? "",
  isProduction: process.env.NODE_ENV === "production",
};

/**
 * The endpoint Supabase signs its access tokens for, and publishes its keys on.
 *
 * Derived from the project URL so a project only has to be configured once. A
 * trailing slash is tolerated because both forms are copy-pasted in practice,
 * and `/auth/v1//.well-known/...` is not a URL Supabase answers on.
 */
export function supabaseAuthBaseUrl(): string {
  const url = ENV.supabaseUrl.replace(/\/+$/, "");
  return url ? `${url}/auth/v1` : "";
}

export function supabaseJwksUrl(): string {
  if (ENV.supabaseJwksUrl) return ENV.supabaseJwksUrl;
  const base = supabaseAuthBaseUrl();
  return base ? `${base}/.well-known/jwks.json` : "";
}
