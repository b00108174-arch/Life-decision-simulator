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

// NEW — alert type discriminator exported for use across the app
export type AlertType = 'self_harm' | 'harm_to_others';

export interface CrisisCheckResult {
  flagged: boolean;
  matchedPattern?: string;
  alertType?: AlertType; // NEW: identifies the category of detected risk
}

// NEW — Harm-to-others patterns
// Detects signals that a user may be planning or describing violence toward
// someone else. Intentionally broad (same rationale as CRISIS_PATTERNS above);
// the AI layer in serverSafety.ts confirms ambiguous hits to cut false positives.
// Kept server-safe: these patterns only read text, no logging happens here.
const HARM_TO_OTHERS_PATTERNS: RegExp[] = [
  /\b(kill|murder|shoot|stab)\s+(someone|somebody|anyone|people|them|him|her|my\s+\w+)\b/i,
  /\bwant(ing)?\s+to\s+(hurt|kill|attack|harm|shoot|stab|murder)\s+(someone|somebody|anyone|people|them|him|her)\b/i,
  /\b(plan(ning)?|going)\s+to\s+(kill|hurt|attack|harm|shoot|stab|murder)\s+(someone|somebody|anyone|them|him|her)\b/i,
  /\bshoot\s+(up|everyone|the\s+place|the\s+building|them|people)\b/i,
  /\bmass\s+(shooting|attack|killing|casualt)/i,
  /\bbomb\s+(threat|the\s+place|the\s+building|everyone)\b/i,
  /\b(murder|assassinate)\s+(someone|somebody|them|him|her)\b/i,
  /\bthreatening\s+to\s+(kill|hurt|harm|shoot|stab)\b/i,
];

/**
 * Synchronous, client-safe keyword scan. Call this on every piece
 * of free-text input (scenario, follow-up answers, chat messages)
 * BEFORE sending anything to the AI or rendering any decision UI.
 */
export function checkForCrisisKeywords(text: string): CrisisCheckResult {
  if (!text || typeof text !== 'string') return { flagged: false };

  for (const pattern of CRISIS_PATTERNS) {
    if (pattern.test(text)) {
      return { flagged: true, matchedPattern: pattern.source, alertType: 'self_harm' };
    }
  }

  // NEW: Check harm-to-others patterns
  for (const pattern of HARM_TO_OTHERS_PATTERNS) {
    if (pattern.test(text)) {
      return { flagged: true, matchedPattern: pattern.source, alertType: 'harm_to_others' };
    }
  }

  return { flagged: false };
}
