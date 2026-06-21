// lib/toneReview.ts
//
// Lightweight safeguard applied to AI-generated text before it's shown
// to the user. Two layers:
//   1. A system-prompt instruction baked into every AI call (the real
//      first line of defense — see PROMPT instructions used in the
//      analyze/profile/crisis-check routes).
//   2. This module: a fast pattern check that catches the rare case
//      where generated text still reads as dismissive, mocking, or
//      hostile, and replaces it with a safe fallback rather than
//      showing it.
//
// This is NOT a replacement for good prompting — it's a backstop.

const HOSTILE_PATTERNS: RegExp[] = [
  /\byou'?re\s+(stupid|dumb|pathetic|an?\s+idiot)\b/i,
  /\bthat'?s\s+a\s+(stupid|dumb|terrible|ridiculous)\s+(idea|question|plan)\b/i,
  /\bobviously\s+you\s+(should|can't|don't)\b/i, // condescending framing
  /\bjust\s+(get\s+over\s+it|deal\s+with\s+it)\b/i,
  /\bwhatever\s+you\s+say\b/i, // dismissive sarcasm
];

export interface ToneCheckResult {
  safe: boolean;
  reason?: string;
}

/**
 * Scans a single piece of AI-generated text for hostile/dismissive
 * patterns. Call this on every user-facing string before rendering
 * (path descriptions, chat answers, recommendations).
 */
export function checkTone(text: string): ToneCheckResult {
  if (!text || typeof text !== 'string') return { safe: true };
  for (const pattern of HOSTILE_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: pattern.source };
    }
  }
  return { safe: true };
}

/**
 * Returns the original text if it passes the tone check, or a safe
 * generic fallback if it doesn't. Use this to wrap any AI-generated
 * field right before it's rendered.
 */
export function safeguardText(text: string, fallback = "Let's look at this from a different angle."): string {
  const result = checkTone(text);
  return result.safe ? text : fallback;
}

/**
 * Applies safeguardText across every string field of an arbitrary
 * object (used for the Analysis/Path objects returned by /api/analyze
 * before they're stored in state and rendered).
 */
export function safeguardObjectStrings<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = { ...obj };
  for (const key of Object.keys(result)) {
    const value = result[key];
    if (typeof value === 'string') {
      result[key] = safeguardText(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'string' ? safeguardText(item) : item
      );
    }
  }
  return result as T;
}

// System-prompt fragment to append to every AI call across the app.
// Keep this in sync if tone requirements change — used in
// app/api/analyze, app/api/profile, and the chat flow.
export const TONE_SYSTEM_INSTRUCTION =
  'You must always respond with a respectful, supportive, professional, empathetic, and non-judgmental tone. ' +
  'Never be rude, insulting, dismissive, mocking, sarcastic, or hostile, even if the user is frustrated or the ' +
  'scenario involves a sensitive or difficult life situation. Avoid presumptuous or condescending phrasing.';
