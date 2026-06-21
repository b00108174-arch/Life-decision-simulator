// lib/crisisDetection.ts
//
// Layer 1 of crisis detection: fast keyword/pattern matching.
// Runs synchronously, client-side, before any API call is made.
// This is intentionally broad (favors false positives over false
// negatives) — a missed crisis signal is much worse than an
// unnecessary safety screen. Layer 2 (AI classification, see
// app/api/crisis-check/route.ts) refines this server-side.
//
// IMPORTANT: this file does not log anything. Logging happens
// server-side only, in the crisis-check API route, using the
// service_role key. Keep it that way — client-side code should
// never write directly to crisis_events.

const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid(e|al)\b/i,
  /\bkill(ing)?\s+myself\b/i,
  /\bend(ing)?\s+(my\s+)?life\b/i,
  /\bwant(ing)?\s+to\s+die\b/i,
  /\bself[\s-]?harm\b/i,
  /\bcutt?ing\s+myself\b/i,
  /\bhurt(ing)?\s+myself\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\bdon'?t\s+want\s+to\s+(be\s+alive|live\s+anymore|exist)\b/i,
  /\bplan(ning)?\s+to\s+(kill|hurt)\s+myself\b/i,
  /\boverdose\b/i,
  /\bsuicide\s+note\b/i,
];

export interface CrisisCheckResult {
  flagged: boolean;
  matchedPattern?: string;
}

/**
 * Synchronous, client-safe keyword scan. Call this on every piece
 * of free-text input (scenario, follow-up answers, chat messages)
 * BEFORE sending anything to the AI or rendering any decision UI.
 */
export function checkForCrisisKeywords(text: string): CrisisCheckResult {
  if (!text || typeof text !== 'string') return { flagged: false };

  for (const pattern of CRISIS_PATTERNS) {
    if (pattern.test(text)) {
      return { flagged: true, matchedPattern: pattern.source };
    }
  }
  return { flagged: false };
}
