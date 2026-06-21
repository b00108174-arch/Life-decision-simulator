// IMPORTANT - two different keys, two different trust levels:
//   - NEXT_PUBLIC_SUPABASE_ANON_KEY: safe to ship to the browser.
//     Row Level Security (see sql/schema.sql) restricts what it can do.
//   - SUPABASE_SERVICE_ROLE_KEY: full admin access, bypasses RLS.
//     Must ONLY be imported in server-side files (app/api/**/route.ts).
//     Never import getSupabaseAdmin() from a 'use client' file.
//
// Until env vars are set, both clients are null and calling code
// should fall back to localStorage (see lib/localHistory.ts) so the
// app keeps working in "no backend configured yet" mode.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let browserClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

/**
 * Client-safe Supabase instance. Use this in 'use client' components
 * and in API routes for anything that should respect RLS (profiles,
 * decisions). Returns null if env vars aren't configured yet –
 * always check before using.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !anonKey) return null;
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, anonKey);
  }
  return browserClient;
}

/**
 * Server-only Supabase instance using the service_role key.
 * Bypasses RLS entirely - only call this from API routes
 * (files under app/api/.../route.ts), never in client components.
 * Used exclusively for writing to crisis events.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseUrl || !serviceRoleKey) return null;
  if (!adminClient) {
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return adminClient;
}
export function isSupabaseAdminConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

