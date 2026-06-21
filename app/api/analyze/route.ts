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

Analyse this scenario and determine the most appropriate number of distinct paths (between 2 and 5). 
Do not default to exactly 3 — prefer 2 to 3 directions if simple, and up to 5 only if genuinely distinct options exist.
Each path must represent a meaningfully different direction, not just a variation in degree.

CRITICAL SEPARATION OF LABOUR (NO CONTENT REPETITION):
Each part of the JSON payload serves a distinct structural asset. DO NOT re-use strings across sections.
Keep textual fields descriptive but highly concise (1-3 sentences maximum per property) to manage space limitations.

1. ACCORDION CARD FLUID DATA:
- "shortTerm": Describe ONLY the immediate positive wins, benefits, and momentum gains. Do not mix risks here.
- "longTerm": Project ONLY the long-term vision and compound positive advantages at the 3-5 year mark. Pure upside.
- "risks": Detail ONLY failure modes, vulnerabilities, and internal frictions.
- "opportunityCost": State explicitly what alternative options, values, or stability parameters are sacrificed to choose this path.
- "bestFor": Outline the perfect situational context or profile of an individual who will naturally excel here.
- "blindspot": Identify a hidden psychological trap or non-obvious consequence most people miss entirely.

2. DYNAMIC WHAT-IF CONDITIONS ("dynamicWhatIfs" array):
- Generate EXACTLY 4 highly realistic, unpredictable scenario-specific what-if conditions to stress-test these frameworks.
- Each label entry MUST be strictly limited to 1 to 2 words maximum (e.g., "Market Crash", "Burnout", "Funding Cut", "Health Pivot").
- Each entry must be an object containing: { "id": "unique_string", "label": "1-2 words", "description": "Clear sentence detailing the risk condition context." }

3. TIMELINE NARRATIVE LIFE STREAM ("timelineSteps" array):
- Generate a dynamic array of chronological stages representing the long-term biographical lifecycle of this choice.
- Minimum of 5 timestamps, maximum of 12 timestamps. Determine the time gaps based on the scenario pacing.
- Each entry must be an object: { "label": "Time Unit (e.g., Day 1, Month 3, Year 5)", "text": "Narrative transformation details regarding lifestyle adjustments. Max 2 sentences." }

4. FLOWCHART OPERATIONAL FLOW ("flowchartSteps" array):
- Generate exactly 5 tactical, progressive deployment checkpoints executing this specific lane from left to right.
- This is an implementation map, not a narrative. Focus on engineering the framework.
- Each entry must be an object containing: 
  { 
    "phase": "01", 
    "title": "Phase Name", 
    "desc": "Actionable task description or safeguard parameter. Max 2 sentences.",
    "timeframe": "A highly concise immediate pacing indicator label string (possible values: 'Now', '2 weeks', '1 month', '2 months', '6 months', etc.)"
  }

Respond ONLY with a valid JSON object in exactly this structure (no markdown, no code blocks, just raw JSON text):

{
  "summary": "A 2-3 sentence neutral summary of the core tension in this decision",
  "pros": ["general pro 1", "general pro 2", "general pro 3"],
  "cons": ["general con 1", "general con 2", "general con 3"],
  "dynamicWhatIfs": [
    { "id": "cond_1", "label": "Word One", "description": "Detailed scenario risk condition text..." },
    { "id": "cond_2", "label": "Word Two", "description": "..." },
    { "id": "cond_3", "label": "Word Three", "description": "..." },
    { "id": "cond_4", "label": "Word Four", "description": "..." }
  ],
  "paths": [
    {
      "title": "[Short, high-signal descriptive name, 2-4 words max representing the concept. Do NOT prefix with 'Path A:' or 'Path B:']",
      "choice": "One clear sentence describing what the person actually does in this path",
      "shortTerm": "Concrete, short-term positive benefits only (6-12 months)",
      "longTerm": "Pure long-term positive targets only (3-5 years)",
      "risks": "The structural risks and downsides of this path",
      "bestFor": "The psychological profile or match metric this path suits best",
      "opportunityCost": "What specific option or value is given up by choosing this track",
      "blindspot": "One hidden bias or overlooked consequence of this path",
      "threeYear": "Specific narrative snapshot of life at exactly 3 years on this path",
      "fiveYear": "Specific narrative snapshot of life at exactly 5 years on this path",
      "tenYear": "Specific narrative snapshot of life at exactly 10 years on this path",
      "timelineSteps": [
        { "label": "Stage 1 Interval", "text": "Unique long-term narrative update..." }
      ],
      "flowchartSteps": [
        { "phase": "01", "title": "Setup", "desc": "Unique functional milestone details...", "timeframe": "Now" },
        { "phase": "02", "title": "Action", "desc": "...", "timeframe": "2 weeks" },
        { "phase": "03", "title": "Validation", "desc": "...", "timeframe": "1 month" },
        { "phase": "04", "title": "Optimization", "desc": "...", "timeframe": "2 months" },
        { "phase": "05", "title": "Stabilize", "desc": "...", "timeframe": "6 months" }
      ]
    }
  ],
  "recommendation": "A balanced 2-3 sentence suggestion based on common considerations, naming the most suitable path by its specific descriptive title"
}

Ensure the timelineSteps array strictly matches the customized range parameters requested (5-12 items max). All dynamicWhatIfs labels MUST be 1-2 words max. Keep titles short and thematic.`;

    const models = [
      'poolside/laguna-m.1:free'
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
          if (
            lastError.includes('not found') ||
            lastError.includes('unavailable') ||
            lastError.includes('No endpoints')
          ) {
            continue;
          }
          throw new Error(lastError);
        }

        const text = data.choices?.[0]?.message?.content ?? '';
        
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');

        if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
          throw new Error('Model response stream did not contain a valid stringified JSON structure.');
        }

        const cleaned = text.substring(startIdx, endIdx + 1).trim();
        const parsed = JSON.parse(cleaned);

        if (!Array.isArray(parsed.paths) || parsed.paths.length === 0) {
          throw new Error('Model returned no paths');
        }

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
        if (
          msg.includes('not found') ||
          msg.includes('unavailable') ||
          msg.includes('No endpoints')
        ) {
          lastError = msg;
          continue;
        }
        throw e;
      }
    }

    return NextResponse.json(
      { error: `All models failed. Last error: ${lastError}` },
      { status: 500 }
    );

  } catch (error: unknown) {
    console.error('Backend Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}