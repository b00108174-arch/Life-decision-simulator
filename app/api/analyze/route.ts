import { NextRequest, NextResponse } from 'next/server';
import { evaluateAndAlert } from '@/lib/serverSafety';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

interface AnalyzeRequestBody {
  scenario: string;
  originalScenario?: string;
  followUpAnswers?: { question: string; answer: string }[];
  personalizationContext?: string;
  profileId?: string | null;
  userIdentifier?: string;
  source?: 'scenario' | 'deep_dive_chat' | 'server_analyze';
}

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequestBody = await req.json();
    const {
      scenario,
      originalScenario,
      followUpAnswers = [],
      personalizationContext = '',
      profileId,
      userIdentifier,
      source = 'server_analyze',
    } = body;

    if (!scenario || scenario.trim().length === 0) {
      return NextResponse.json({ error: 'Scenario is required' }, { status: 400 });
    }

    const textToCheck = originalScenario ?? scenario;
    const safety = await evaluateAndAlert({
      text: textToCheck,
      userIdentifier,
      profileId: profileId ?? undefined,
      source,
    });

    if (safety.flagged) {
      return NextResponse.json(
        { error: 'crisis_detected', flagged: true },
        { status: 409 }
      );
    }

    const followUpContext = followUpAnswers.length
      ? `\n\nAdditional context from follow-up questions:\n${followUpAnswers
          .map((item) => `- ${item.question}: ${item.answer}`)
          .join('\n')}`
      : '';

    const historyContext = personalizationContext
      ? `\n\nRelevant user history for personalization:\n${personalizationContext}`
      : '';

    const prompt = `You are a thoughtful life advisor. A user is facing this decision or scenario:

"${scenario}"${followUpContext}${historyContext}

Respond ONLY with a valid JSON object in exactly this structure (no markdown, no code blocks, just raw JSON):

{
  "summary": "A 1-2 sentence neutral summary of the decision",
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2", "con 3"],
  "paths": [
    {
      "title": "Path A: [short name]",
      "choice": "What the person does in this path",
      "shortTerm": "What happens in the first 6-12 months",
      "longTerm": "What life looks like in 3-5 years",
      "risks": "Key risks or downsides",
      "bestFor": "The type of person this path suits"
    },
    {
      "title": "Path B: [short name]",
      "choice": "What the person does in this path",
      "shortTerm": "What happens in the first 6-12 months",
      "longTerm": "What life looks like in 3-5 years",
      "risks": "Key risks or downsides",
      "bestFor": "The type of person this path suits"
    },
    {
      "title": "Path C: [short name]",
      "choice": "What the person does in this path",
      "shortTerm": "What happens in the first 6-12 months",
      "longTerm": "What life looks like in 3-5 years",
      "risks": "Key risks or downsides",
      "bestFor": "The type of person this path suits"
    }
  ],
  "recommendation": "A balanced 2-3 sentence recommendation based on common considerations"
}`;

    // Try reliably free models in order
    const models = [
      'openrouter/auto',                              // auto-picks best available free model
      'deepseek/deepseek-r1:free',                   // top reasoning model, free
      'deepseek/deepseek-v3:free',                   // strong general model, free
      'meta-llama/llama-3.3-70b-instruct:free',      // reliable llama free
      'google/gemma-3-12b-it:free',                  // google gemma free
      'qwen/qwen-2.5-7b-instruct:free',              // lightweight qwen free
    ];

    let lastError = '';

    for (const model of models) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Life Decision Simulator',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          lastError = data.error?.message || `Model ${model} failed`;
          // Only skip to next model for 404/unavailable errors
          if (lastError.includes('not found') || lastError.includes('unavailable') || lastError.includes('No endpoints')) {
            continue;
          }
          throw new Error(lastError);
        }

        const text = data.choices?.[0]?.message?.content ?? '';
        const cleaned = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        if (profileId && originalScenario && isSupabaseConfigured()) {
          const supabase = getSupabaseClient();
          if (supabase) {
            const { error: dbError } = await supabase.from('decisions').insert({
              profile_id: profileId,
              scenario: originalScenario,
              follow_up_answers: followUpAnswers,
              analysis: parsed,
            });

            if (dbError) {
              console.error('Failed to persist decision:', dbError);
            }
          }
        }

        return NextResponse.json(parsed);

      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found') || msg.includes('unavailable') || msg.includes('No endpoints')) {
          lastError = msg;
          continue;
        }
        throw e;
      }
    }

    return NextResponse.json({ error: `All models failed. Last error: ${lastError}` }, { status: 500 });

  } catch (error: unknown) {
    console.error('Backend Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
