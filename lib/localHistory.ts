// lib/localHistory.ts
//
// localStorage-backed history, used as a fallback when Supabase isn't
// configured yet (see lib/supabase.ts → isSupabaseConfigured()). Once
// Supabase is live, app/history/page.tsx and the analyze flow should
// prefer the database; this stays as an offline/demo-safe path so the
// app never breaks for users without a backend.
//
// NOTE: this is per-browser, not per-account — it's a convenience
// layer, not a privacy boundary. Don't store sensitive content here
// beyond what's already visible in the UI (no crisis-related data
// ever goes through this file — that's server-only, see crisis-check route).

export interface LocalProfile {
  name: string;
  age: number;
  email: string;
  goals?: string;
}

export interface LocalDecisionRecord {
  id: string;
  scenario: string;
  followUpAnswers: { question: string; answer: string }[];
  analysis: unknown; // Analysis type from app/page.tsx
  createdAt: string;
}

const PROFILE_KEY = 'lds_profile';
const HISTORY_KEY = 'lds_history';
const MAX_HISTORY_ITEMS = 50; // keep localStorage bounded

export function saveLocalProfile(profile: LocalProfile): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getLocalProfile(): LocalProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveLocalDecision(record: Omit<LocalDecisionRecord, 'id' | 'createdAt'>): void {
  if (typeof window === 'undefined') return;
  const existing = getLocalHistory();
  const newRecord: LocalDecisionRecord = {
    ...record,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const updated = [newRecord, ...existing].slice(0, MAX_HISTORY_ITEMS);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

export function getLocalHistory(): LocalDecisionRecord[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function clearLocalHistory(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(HISTORY_KEY);
}

/**
 * Builds a short personalization summary string from past decisions,
 * to be injected into future AI prompts. Keeps it compact — we don't
 * want to blow up token usage with full history every time.
 */
export function buildPersonalizationContext(): string {
  const history = getLocalHistory();
  const profile = getLocalProfile();

  if (!profile && history.length === 0) return '';

  const parts: string[] = [];
  if (profile?.goals) parts.push(`Stated long-term goals: ${profile.goals}.`);
  if (history.length > 0) {
    const recentTitles = history
      .slice(0, 3)
      .map((h) => h.scenario.slice(0, 80))
      .join(' | ');
    parts.push(`Past scenarios considered (most recent first): ${recentTitles}.`);
  }
  return parts.join(' ');
}
