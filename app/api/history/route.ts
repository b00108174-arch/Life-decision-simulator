// app/api/history/route.ts
//
// Fetches past decisions for a given email, joined through profiles.
// Returns an empty array (not an error) if Supabase isn't configured
// yet — the client falls back to localStorage in that case.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ records: [], configured: false });
  }

  const email = req.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'Missing email parameter' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ records: [], configured: false });

    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email);

    if (profileError || !profiles || profiles.length === 0) {
      return NextResponse.json({ records: [] });
    }

    const profileIds = profiles.map((p) => p.id);

    const { data: decisions, error: decisionsError } = await supabase
      .from('decisions')
      .select('id, scenario, analysis, created_at')
      .in('profile_id', profileIds)
      .order('created_at', { ascending: false })
      .limit(50);

    if (decisionsError) {
      console.error('Failed to fetch decisions:', decisionsError);
      return NextResponse.json({ records: [] });
    }

    const records = (decisions ?? []).map((d) => ({
      id: d.id,
      scenario: d.scenario,
      analysis: d.analysis,
      createdAt: d.created_at,
    }));

    return NextResponse.json({ records });
  } catch (err) {
    console.error('History route error:', err);
    return NextResponse.json({ records: [] });
  }
}
