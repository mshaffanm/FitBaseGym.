import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;
let initPromise: Promise<SupabaseClient | null> | null = null;

async function resolvePublicCredentials(): Promise<{ url: string; anonKey: string } | null> {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const envAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

  if (envUrl && envAnon) {
    return { url: envUrl, anonKey: envAnon };
  }

  try {
    const res = await fetch('/api/public/config');
    if (!res.ok) return null;
    const json = (await res.json()) as {
      supabaseUrl?: string | null;
      supabaseAnonKey?: string | null;
    };
    if (json.supabaseUrl && json.supabaseAnonKey) {
      return { url: json.supabaseUrl, anonKey: json.supabaseAnonKey };
    }
  } catch {
    // Non-fatal if server config is unavailable
  }

  return null;
}

export async function getBrowserSupabaseClient(): Promise<SupabaseClient | null> {
  if (browserClient) return browserClient;
  if (!initPromise) {
    initPromise = (async () => {
      const creds = await resolvePublicCredentials();
      if (!creds) return null;
      browserClient = createClient(creds.url, creds.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
      return browserClient;
    })();
  }
  return initPromise;
}

export async function syncBrowserSession(
  accessToken?: string | null,
  refreshToken?: string | null
): Promise<void> {
  if (!accessToken || !refreshToken) return;
  try {
    const client = await getBrowserSupabaseClient();
    if (client) {
      await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }
  } catch {
    // Best-effort browser session sync
  }
}

export async function clearBrowserSession(): Promise<void> {
  try {
    const client = await getBrowserSupabaseClient();
    if (client) {
      await client.auth.signOut();
    }
  } catch {
    // Best-effort browser signout
  }
}
