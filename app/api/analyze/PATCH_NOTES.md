// app/api/analyze/route.ts — CHANGES NEEDED (patch notes)
//
// I don't have your current route.ts content (only the page.tsx diff
// was shared), so I can't safely overwrite it without risking deleting
// logic I haven't seen. Apply these changes by hand — they're additive
// and small:
//
// 1. Import the tone instruction:
//      import { TONE_SYSTEM_INSTRUCTION } from '@/lib/toneReview';
//
// 2. Find your system prompt string (the one instructing the model to
//    return JSON with paths/pros/cons/recommendation) and prepend:
//      const systemPrompt = `${TONE_SYSTEM_INSTRUCTION}\n\n` + yourExistingSystemPromptString;
//
// 3. Accept an optional `personalizationContext` and `followUpAnswers`
//    field in the request body, and fold them into the user message
//    sent to OpenRouter, e.g.:
//
//      const { scenario, personalizationContext, followUpAnswers } = await req.json();
//
//      let userContent = scenario;
//      if (followUpAnswers?.length) {
//        const qa = followUpAnswers.map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join('\n');
//        userContent += `\n\nAdditional context from follow-up questions:\n${qa}`;
//      }
//      if (personalizationContext) {
//        userContent += `\n\nRelevant history about this person: ${personalizationContext}`;
//      }
//
//    Then send userContent instead of the raw scenario as the user message.
//
// 4. After parsing the AI's JSON response and before returning it,
//    run it through safeguardObjectStrings (tone backstop) and
//    optionally persist to Supabase:
//
//      import { safeguardObjectStrings, safeguardText } from '@/lib/toneReview';
//      import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
//
//      data.paths = data.paths.map((p: any) => safeguardObjectStrings(p));
//      data.summary = safeguardText(data.summary);
//      data.recommendation = safeguardText(data.recommendation);
//
//      if (isSupabaseConfigured() && body.profileId) {
//        const supabase = getSupabaseClient();
//        await supabase?.from('decisions').insert({
//          profile_id: body.profileId,
//          scenario,
//          follow_up_answers: followUpAnswers ?? [],
//          analysis: data,
//        });
//      }
//
// IMPORTANT: this route should NEVER be the place crisis detection
// happens. By the time a request reaches /api/analyze, the client
// should have already called /api/crisis-check and confirmed
// flagged: false. Do not add crisis keyword logic here — keep that
// concern isolated to lib/crisisDetection.ts + app/api/crisis-check.
