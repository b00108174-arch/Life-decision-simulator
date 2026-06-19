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
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

interface CrisisCheckRequestBody {
  text: string;
  keywordFlagged: boolean;
  matchedPattern?: string;
  userIdentifier?: string; // email if known, else 'anonymous'
  profileId?: string;      // Supabase profiles.id, if a profile exists
}

export async function POST(req: NextRequest) {
  try {
    const body: CrisisCheckRequestBody = await req.json();
    const { text, keywordFlagged, matchedPattern, userIdentifier, profileId } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text to evaluate' }, { status: 400 });
    }

    let aiFlagged = false;

    // Ask the model for an independent classification. This call is
    // intentionally narrow — we only want a risk judgment, nothing else.
    if (OPENROUTER_API_KEY) {
      try {
        const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'anthropic/claude-3.5-haiku', // fast, cheap, sufficient for classification
            messages: [
              {
                role: 'system',
                content:
                  'You are a safety classifier. Given a piece of user text, respond with ONLY a JSON object: {"risk": true|false}. ' +
                  'Set risk to true if the text expresses suicidal ideation, intent to self-harm, active self-injury, ' +
                  'or a desire to die, regardless of how it is phrased (direct, indirect, hypothetical, or framed as a joke). ' +
                  'Set risk to false for ordinary life-decision text, even if it discusses stress, sadness, or difficult choices. ' +
                  'Respond with ONLY the JSON object, nothing else.',
              },
              { role: 'user', content: text.slice(0, 2000) }, // cap length defensively
            ],
            max_tokens: 20,
            temperature: 0,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const raw = aiData.choices?.[0]?.message?.content ?? '';
          const cleaned = raw.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          aiFlagged = Boolean(parsed.risk);
        }
      } catch (aiErr) {
        // If the AI classifier fails for any reason, we do NOT fail open
        // on safety — we rely on the keyword layer's result instead.
        console.error('Crisis AI classification failed, falling back to keyword result:', aiErr);
      }
    }

    const flagged = keywordFlagged || aiFlagged;

    // Log every flagged event securely, server-side, regardless of which
    // layer caught it. This NEVER runs on the client and never uses the
    // anon key — only service_role, which the RLS policies in schema.sql
    // deliberately exclude from anon/authenticated access.
    if (flagged && isSupabaseAdminConfigured()) {
      const admin = getSupabaseAdmin();
      if (admin) {
        const detectionMethod =
          keywordFlagged && aiFlagged ? 'both' : keywordFlagged ? 'keyword' : 'ai_classifier';

        const { error: logError } = await admin.from('crisis_events').insert({
          profile_id: profileId ?? null,
          user_identifier: userIdentifier ?? 'anonymous',
          // Store a bounded excerpt, not unlimited free text — minimizes
          // sensitive data retained while still giving reviewers context.
          prompt_excerpt: text.slice(0, 500),
          detection_method: detectionMethod,
        });

        if (logError) {
          // Logging failure must never block the safety response from
          // reaching the user — log to server console and continue.
          console.error('Failed to log crisis event:', logError);
        }
      }
    } else if (flagged && !isSupabaseAdminConfigured()) {
      // No backend configured yet — log to server console so the event
      // isn't silently lost during local development.
      console.warn('[CRISIS EVENT — not persisted, Supabase admin not configured]', {
        timestamp: new Date().toISOString(),
        userIdentifier: userIdentifier ?? 'anonymous',
        matchedPattern,
        excerpt: text.slice(0, 500),
      });
    }

    return NextResponse.json({ flagged });
  } catch (err) {
    console.error('Crisis check route error:', err);
    // Fail closed on errors: if we can't determine safety, treat as
    // flagged so the user sees the supportive response rather than
    // risking a decision-simulation UI on a genuine crisis message.
    return NextResponse.json({ flagged: true, error: 'fail-closed' }, { status: 200 });
  }
}
