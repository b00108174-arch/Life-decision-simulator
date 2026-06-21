import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase';

function isAuthorized(req: NextRequest) {
  const token = process.env.ADMIN_DASHBOARD_TOKEN;
  if (!token) return true;
  return req.headers.get('x-admin-token') === token;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ alerts: [], configured: false });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ alerts: [], configured: false });

  const { data, error } = await admin
    .from('crisis_events')
    .select('id, user_identifier, prompt_excerpt, detection_method, source, reviewed, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Failed to load admin alerts:', error);
    return NextResponse.json({ error: 'Failed to load alerts' }, { status: 500 });
  }

  return NextResponse.json({ alerts: data ?? [], configured: true });
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Supabase admin is not configured' }, { status: 400 });
  }

  const { id, reviewed } = await req.json();
  if (!id || typeof reviewed !== 'boolean') {
    return NextResponse.json({ error: 'Missing alert id or reviewed value' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Supabase admin is not configured' }, { status: 400 });

  const { error } = await admin
    .from('crisis_events')
    .update({ reviewed })
    .eq('id', id);

  if (error) {
    console.error('Failed to update alert:', error);
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
