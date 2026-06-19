// app/api/profile/route.ts
//
// Two jobs:
//   1. Generate 3-4 adaptive follow-up questions based on the scenario
//      + profile (age can shift question framing — e.g. career
//      questions for an adult vs. study-path questions for a student).
//   2. Save the profile to Supabase if configured; otherwise the
//      client falls back to localStorage (see lib/localHistory.ts).
//
// This route does NOT run crisis detection — that's handled separately
// via /api/crisis-check, called directly from the client before this
// route is ever reached for a given piece of text.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

interface ProfileRequestBody {
  scenario: string;
  profile: { name: string; age: number; email: string };
}

export async function POST(req: NextRequest) {
  try {
    const body: ProfileRequestBody = await req.json();
    const { scenario, profile } = body;

    if (!scenario || !profile?.name || !profile?.email || !profile?.age) {
      return NextResponse.json({ error: 'Missing required profile fields' }, { status: 400 });
    }

    // --- Generate adaptive follow-up questions ---
    let questions: string[] = [];
    if (OPENROUTER_API_KEY) {
      try {
        const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'anthropic/claude-3.5-sonnet',
            messages: [
              {
                role: 'system',
                content:
                  'You generate short, specific follow-up questions to help understand someone\'s life-decision scenario better ' +
                  'before producing recommendations. Questions must be respectful, supportive, non-judgmental, and never presumptuous ' +
                  'about the person\'s circumstances. Tailor questions to the person\'s age where relevant. ' +
                  'Return ONLY a JSON object: {"questions": ["...", "...", "..."]} with exactly 3 questions, each under 20 words, ' +
                  'each addressing a DIFFERENT angle (e.g. constraints, motivations, risk tolerance, timeline) — no overlapping questions.',
              },
              {
                role: 'user',
                content: `Scenario: "${scenario}"\nPerson's age: ${profile.age}`,
              },
            ],
            max_tokens: 300,
            temperature: 0.4,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const raw = aiData.choices?.[0]?.message?.content ?? '';
          const cleaned = raw.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed.questions)) {
            questions = parsed.questions.filter((q: unknown) => typeof q === 'string').slice(0, 4);
          }
        }
      } catch (aiErr) {
        console.error('Follow-up question generation failed:', aiErr);
      }
    }

    if (questions.length === 0) {
      // Safe generic fallback if the AI call fails for any reason.
      questions = [
        'What matters most to you in making this decision?',
        'What constraints (time, money, relationships) should we factor in?',
        'How comfortable are you with risk and uncertainty here?',
      ];
    }

    // --- Save/update profile in Supabase if configured ---
    let profileId: string | null = null;
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data, error: dbError } = await supabase
          .from('profiles')
          .insert({ name: profile.name, age: profile.age, email: profile.email })
          .select('id')
          .single();

        if (dbError) {
          console.error('Failed to save profile to Supabase:', dbError);
        } else {
          profileId = data?.id ?? null;
        }
      }
    }

    return NextResponse.json({ questions, profileId });
  } catch (err) {
    console.error('Profile route error:', err);
    return NextResponse.json({ error: 'Failed to process profile' }, { status: 500 });
  }
}
