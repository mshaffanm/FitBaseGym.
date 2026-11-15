import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class SupabaseConfigError extends Error {
  statusCode = 503;

  constructor(
    message = 'Supabase is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in environment secrets.'
  ) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

function readEnv(primary: string, fallback?: string): string {
  const val = process.env[primary]?.trim() || (fallback ? process.env[fallback]?.trim() : '');
  return val || '';
}

export function getSupabasePublicConfig(): {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
} {
  const supabaseUrl = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const supabaseAnonKey = readEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  return {
    supabaseUrl: supabaseUrl || null,
    supabaseAnonKey: supabaseAnonKey || null,
  };
}

export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicConfig();
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  return Boolean(supabaseUrl && supabaseAnonKey && serviceKey);
}

let cachedAdminClient: SupabaseClient | null = null;
let cachedAnonClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  const { supabaseUrl } = getSupabasePublicConfig();
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new SupabaseConfigError();
  }
  if (!cachedAdminClient) {
    cachedAdminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return cachedAdminClient;
}

export function getSupabaseAnon(): SupabaseClient {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicConfig();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new SupabaseConfigError();
  }
  if (!cachedAnonClient) {
    cachedAnonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return cachedAnonClient;
}
