import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase';
import { checkForCrisisKeywords } from '@/lib/crisisDetection';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL;
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || 'Life Decision Simulator <onboarding@resend.dev>';

export interface SafetyCheckInput {
  text: string;
  keywordFlagged?: boolean;
  matchedPattern?: string;
  userIdentifier?: string;
  profileId?: string;
  source: 'scenario' | 'profile_followup' | 'deep_dive_chat' | 'server_analyze';
}

export interface SafetyCheckResult {
  flagged: boolean;
  keywordFlagged: boolean;
  aiFlagged: boolean;
  matchedPattern?: string;
}

async function classifyWithAI(text: string): Promise<boolean> {
  if (!OPENROUTER_API_KEY) return false;

  try {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-haiku',
        messages: [
          {
            role: 'system',
            content:
              'You are a safety classifier. Given user text, respond with ONLY JSON: {"risk": true|false}. ' +
              'Set risk true for suicidal ideation, self-harm intent, active self-injury, or desire to die, ' +
              'including indirect, hypothetical, or joking phrasing. Set risk false for ordinary stressful decisions.',
          },
          { role: 'user', content: text.slice(0, 2000) },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
    });

    if (!aiRes.ok) return false;
    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return Boolean(parsed.risk);
  } catch (err) {
    console.error('Safety AI classification failed:', err);
    return false;
  }
}

async function sendAdminEmail(input: SafetyCheckInput, detectionMethod: string) {
  if (!RESEND_API_KEY || !ADMIN_ALERT_EMAIL) return;

  const excerpt = input.text.slice(0, 500);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      <h2>Self-harm safety alert</h2>
      <p><strong>Source:</strong> ${input.source}</p>
      <p><strong>User:</strong> ${input.userIdentifier ?? 'anonymous'}</p>
      <p><strong>Detection:</strong> ${detectionMethod}</p>
      <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;padding:14px;margin-top:14px;">
        <p style="margin:0;white-space:pre-wrap;">${excerpt
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</p>
      </div>
      <p style="font-size:12px;color:#6b7280;margin-top:16px;">Review the admin safety inbox in the app for context.</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [ADMIN_ALERT_EMAIL],
      subject: 'Life Decision Simulator safety alert',
      html,
    }),
  });

  if (!res.ok) {
    console.error('Failed to notify admin via Resend:', await res.text());
  }
}

async function recordAlert(input: SafetyCheckInput, detectionMethod: string) {
  if (isSupabaseAdminConfigured()) {
    const admin = getSupabaseAdmin();
    if (admin) {
      const { error } = await admin.from('crisis_events').insert({
        profile_id: input.profileId ?? null,
        user_identifier: input.userIdentifier ?? 'anonymous',
        prompt_excerpt: input.text.slice(0, 500),
        detection_method: detectionMethod,
        source: input.source,
      });

      if (error) {
        console.error('Failed to log crisis event:', error);
      }
    }
  } else {
    console.warn('[CRISIS EVENT - configure Supabase to persist]', {
      timestamp: new Date().toISOString(),
      userIdentifier: input.userIdentifier ?? 'anonymous',
      source: input.source,
      detectionMethod,
      matchedPattern: input.matchedPattern,
      excerpt: input.text.slice(0, 500),
    });
  }

  try {
    await sendAdminEmail(input, detectionMethod);
  } catch (err) {
    console.error('Admin email alert failed:', err);
  }
}

export async function evaluateAndAlert(input: SafetyCheckInput): Promise<SafetyCheckResult> {
  const keywordResult =
    typeof input.keywordFlagged === 'boolean'
      ? { flagged: input.keywordFlagged, matchedPattern: input.matchedPattern }
      : checkForCrisisKeywords(input.text);

  const aiFlagged = await classifyWithAI(input.text);
  const flagged = keywordResult.flagged || aiFlagged;

  if (flagged) {
    const detectionMethod =
      keywordResult.flagged && aiFlagged ? 'both' : keywordResult.flagged ? 'keyword' : 'ai_classifier';
    await recordAlert(
      {
        ...input,
        matchedPattern: keywordResult.matchedPattern,
      },
      detectionMethod
    );
  }

  return {
    flagged,
    keywordFlagged: keywordResult.flagged,
    aiFlagged,
    matchedPattern: keywordResult.matchedPattern,
  };
}
