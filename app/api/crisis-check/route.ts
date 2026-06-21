// app/api/crisis-check/route.ts
//
// Layer 2 of crisis detection, server-side only.
//
// Flow:
//   1. Client already ran the fast keyword check (lib/crisisDetection.ts).
//   2. This route asks the AI model to independently classify risk,
//      regardless of whether the keyword layer fired — this catches
//      phrasing the keyword list misses, and confirms/denies keyword
//      hits to reduce false positives shown to the user.
//   3. If EITHER layer flags risk, we log the event to crisis_events
//      using the service_role key (server-only, bypasses RLS) and
//      return flagged: true so the client shows the safety response
//      instead of any decision/simulation content.
//
// This route deliberately does NOT return decision analysis. Its
// only job is the safety determination + logging.

import { NextRequest, NextResponse } from 'next/server';
import { evaluateAndAlert } from '@/lib/serverSafety';

interface CrisisCheckRequestBody {
  text: string;
  keywordFlagged: boolean;
  matchedPattern?: string;
  userIdentifier?: string; // email if known, else 'anonymous'
  profileId?: string;      // Supabase profiles.id, if a profile exists
  source?: 'scenario' | 'profile_followup' | 'deep_dive_chat';
}

export async function POST(req: NextRequest) {
  try {
    const body: CrisisCheckRequestBody = await req.json();
    const { text, keywordFlagged, matchedPattern, userIdentifier, profileId, source } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text to evaluate' }, { status: 400 });
    }

    const result = await evaluateAndAlert({
      text,
      keywordFlagged,
      matchedPattern,
      userIdentifier,
      profileId,
      source: source ?? 'scenario',
    });

    return NextResponse.json({ flagged: result.flagged, alertType: result.alertType ?? null });
  } catch (err) {
    console.error('Crisis check route error:', err);
    // Fail closed on errors: if we can't determine safety, treat as
    // flagged so the user sees the supportive response rather than
    // risking a decision-simulation UI on a genuine crisis message.
    return NextResponse.json({ flagged: true, error: 'fail-closed' }, { status: 200 });
  }
}
