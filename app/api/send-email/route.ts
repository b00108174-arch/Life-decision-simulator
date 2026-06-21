// app/api/send-email/route.ts
//
// Sends the decision plan (summary, recommended path, alternatives,
// reasoning) to the user's email via Resend, with the flowchart SVG
// embedded inline as an image.
//
// Degrades gracefully: if RESEND_API_KEY isn't set, returns a clear
// "not configured" response instead of crashing, so the rest of the
// app keeps working in local/demo mode. See SETUP.md for how to
// add the key.

import { NextRequest, NextResponse } from 'next/server';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Resend's sandbox sender works without domain verification for testing.
// Replace with a verified sender once you've added your own domain.
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || 'Life Decision Simulator <onboarding@resend.dev>';

interface SendEmailRequestBody {
  to: string;
  name: string;
  scenario: string;
  summary: string;
  recommendation: string;
  paths: { title: string; choice: string; bestFor: string }[];
  flowchartSvg: string; // raw SVG markup from DecisionFlowchart, serialized client-side
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEmailHtml(body: SendEmailRequestBody): string {
  const pathsHtml = body.paths
    .map(
      (p) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
          <p style="margin:0;font-weight:600;font-size:14px;color:#1f2937;">${escapeHtml(p.title)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#4b5563;">${escapeHtml(p.choice)}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;"><strong>Best for:</strong> ${escapeHtml(p.bestFor)}</p>
        </td>
      </tr>`
    )
    .join('');

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
    <h2 style="color:#4338ca;">Hi ${escapeHtml(body.name)}, here's your decision plan</h2>
    <p style="font-size:14px;color:#4b5563;">For your scenario: <em>${escapeHtml(body.scenario)}</em></p>

    <div style="background:#eef2ff;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0;font-size:14px;color:#312e81;">${escapeHtml(body.summary)}</p>
    </div>

    <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;">Your decision flowchart</h3>
    <div style="margin:12px 0;">${body.flowchartSvg}</div>

    <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;">Paths considered</h3>
    <table style="width:100%;border-collapse:collapse;">${pathsHtml}</table>

    <div style="background:#fffbeb;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0;font-size:13px;font-weight:600;color:#92400e;">Suggested starting point</p>
      <p style="margin:6px 0 0;font-size:14px;color:#92400e;">${escapeHtml(body.recommendation)}</p>
    </div>

    <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:24px;">
      This simulation is for reflection only — the final decision is always yours.
    </p>
  </div>`;
}

export async function POST(req: NextRequest) {
  if (!RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'not_configured', message: 'Email delivery is not set up yet. Add RESEND_API_KEY to enable it.' },
      { status: 200 } // 200, not an app error — this is an expected "not configured" state
    );
  }

  try {
    const body: SendEmailRequestBody = await req.json();

    if (!body.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to)) {
      return NextResponse.json({ error: 'Invalid recipient email' }, { status: 400 });
    }

    const html = buildEmailHtml(body);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [body.to],
        subject: 'Your life decision plan',
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Resend API error:', errText);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Send email route error:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}

