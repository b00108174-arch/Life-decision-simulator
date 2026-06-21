import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase';
import { checkForCrisisKeywords, AlertType } from '@/lib/crisisDetection';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL;
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || 'Life Decision Simulator <onboarding@resend.dev>';

export interface SafetyCheckInput {
  text: string;
  keywordFlagged?: boolean;
  matchedPattern?: string;
  alertType?: AlertType;    // NEW: carries the category detected by keyword layer
  userIdentifier?: string;
  profileId?: string;
  source: 'scenario' | 'profile_followup' | 'deep_dive_chat' | 'server_analyze';
}

export interface SafetyCheckResult {
  flagged: boolean;
  keywordFlagged: boolean;
  aiFlagged: boolean;
  matchedPattern?: string;
  alertType?: AlertType;    // NEW: final resolved category ('self_harm' | 'harm_to_others')
}

async function classifyWithAI(text: string): Promise<{ risk: boolean; alertType?: AlertType }> {
  if (!OPENROUTER_API_KEY) return { risk: false };

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
              'You are a safety classifier. Given user text, respond with ONLY JSON: {"risk": true|false, "alertType": "self_harm"|"harm_to_others"|null}. ' +
              'Set risk true and alertType "self_harm" for suicidal ideation, self-harm intent, active self-injury, or desire to die, ' +
              'including indirect, hypothetical, or joking phrasing. ' +
              'Set risk true and alertType "harm_to_others" for content describing intent, plans, or threats to harm, attack, or kill another person or group. ' +
              'Set risk false and alertType null for ordinary stressful decisions or general frustration.',
          },
          { role: 'user', content: text.slice(0, 2000) },
        ],
        max_tokens: 30,
        temperature: 0,
      }),
    });

    if (!aiRes.ok) return { risk: false };
    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return {
      risk: Boolean(parsed.risk),
      alertType: parsed.alertType ?? undefined,
    };
  } catch (err) {
    console.error('Safety AI classification failed:', err);
    return { risk: false };
  }
}

// NEW: alertType parameter added — 'harm_to_others' triggers a red-alert subject line
async function sendAdminEmail(input: SafetyCheckInput, detectionMethod: string, alertType?: AlertType) {
  if (!RESEND_API_KEY || !ADMIN_ALERT_EMAIL) return;

  const isHarmToOthers = alertType === 'harm_to_others';
  const excerpt = input.text.slice(0, 500);
  const alertLabel = isHarmToOthers ? '🚨 HARM-TO-OTHERS RED ALERT' : 'Self-harm safety alert';
  const bannerColor = isHarmToOthers ? '#dc2626' : '#fff1f2';
  const bannerBorder = isHarmToOthers ? '#991b1b' : '#fecdd3';
  const bannerText = isHarmToOthers ? '#ffffff' : '#111827';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      ${isHarmToOthers ? `<div style="background:#dc2626;color:#fff;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-weight:bold;font-size:16px;">🚨 RED ALERT — Potential harm to others detected. Review immediately.</div>` : ''}
      <h2>${alertLabel}</h2>
      <p><strong>Alert Type:</strong> ${alertType ?? 'unknown'}</p>
      <p><strong>Source:</strong> ${input.source}</p>
      <p><strong>User:</strong> ${input.userIdentifier ?? 'anonymous'}</p>
      <p><strong>Detection:</strong> ${detectionMethod}</p>
      <div style="background:${bannerColor};border:1px solid ${bannerBorder};border-radius:10px;padding:14px;margin-top:14px;">
        <p style="margin:0;white-space:pre-wrap;color:${bannerText};">${excerpt
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
      subject: isHarmToOthers
        ? '🚨 RED ALERT — Harm-to-others detected: Life Decision Simulator'
        : 'Life Decision Simulator safety alert',
      html,
    }),
  });

  if (!res.ok) {
    console.error('Failed to notify admin via Resend:', await res.text());
  }
}

// NEW: alertType parameter added — stored in Supabase for admin dashboard filtering
async function recordAlert(input: SafetyCheckInput, detectionMethod: string, alertType?: AlertType) {
  if (isSupabaseAdminConfigured()) {
    const admin = getSupabaseAdmin();
    if (admin) {
      const { error } = await admin.from('crisis_events').insert({
        profile_id: input.profileId ?? null,
        user_identifier: input.userIdentifier ?? 'anonymous',
        prompt_excerpt: input.text.slice(0, 500),
        detection_method: detectionMethod,
        source: input.source,
        alert_type: alertType ?? 'self_harm', // NEW column — see sql/schema.sql migration
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
      alertType: alertType ?? 'self_harm',
      matchedPattern: input.matchedPattern,
      excerpt: input.text.slice(0, 500),
    });
  }

  try {
    await sendAdminEmail(input, detectionMethod, alertType);
  } catch (err) {
    console.error('Admin email alert failed:', err);
  }
}

export async function evaluateAndAlert(input: SafetyCheckInput): Promise<SafetyCheckResult> {
  const keywordResult =
    typeof input.keywordFlagged === 'boolean'
      ? { flagged: input.keywordFlagged, matchedPattern: input.matchedPattern, alertType: input.alertType }
      : checkForCrisisKeywords(input.text);

  const aiResult = await classifyWithAI(input.text);
  const aiFlagged = aiResult.risk;
  const flagged = keywordResult.flagged || aiFlagged;

  // Keyword layer takes precedence for alertType; AI fills in if keyword didn't fire
  const resolvedAlertType: AlertType | undefined =
    keywordResult.alertType ?? aiResult.alertType ?? undefined;

  if (flagged) {
    const detectionMethod =
      keywordResult.flagged && aiFlagged ? 'both' : keywordResult.flagged ? 'keyword' : 'ai_classifier';
    await recordAlert(
      { ...input, matchedPattern: keywordResult.matchedPattern },
      detectionMethod,
      resolvedAlertType
    );
  }

  return {
    flagged,
    keywordFlagged: keywordResult.flagged,
    aiFlagged,
    matchedPattern: keywordResult.matchedPattern,
    alertType: resolvedAlertType,
  };
}
