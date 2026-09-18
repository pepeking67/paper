export type AccountSyncConfig = {
  url: string;
  anonKey: string;
};

export function getAccountSyncConfig(): AccountSyncConfig | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/u, "");
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return url && anonKey ? { url, anonKey } : null;
}
