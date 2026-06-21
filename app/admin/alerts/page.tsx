'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface AlertRecord {
  id: string;
  user_identifier: string | null;
  prompt_excerpt: string;
  detection_method: string;
  source?: string | null;
  reviewed: boolean;
  created_at: string;
}

export default function AdminAlertsPage() {
  const [token, setToken] = useState('');
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const openCount = useMemo(() => alerts.filter((alert) => !alert.reviewed).length, [alerts]);

  const loadAlerts = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/alerts', {
        headers: token ? { 'x-admin-token': token } : {},
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Could not load alerts');

      setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      setConfigured(Boolean(data.configured));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAlerts();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setReviewed = async (id: string, reviewed: boolean) => {
    setAlerts((current) => current.map((alert) => (alert.id === id ? { ...alert, reviewed } : alert)));

    try {
      const res = await fetch('/api/admin/alerts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-admin-token': token } : {}),
        },
        body: JSON.stringify({ id, reviewed }),
      });
      if (!res.ok) await loadAlerts();
    } catch {
      await loadAlerts();
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f5f1] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Safety Alerts</h1>
            <p className="mt-1 text-sm text-slate-500">{openCount} open alerts need review.</p>
          </div>
          <Link href="/" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white">
            Simulator
          </Link>
        </div>

        <div className="mb-5 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto]">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Admin token, if configured"
            className="min-w-0 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <button
            onClick={loadAlerts}
            disabled={loading}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {!configured && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Supabase admin keys are not configured yet. Alerts will show in the server console until
            `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
          </div>
        )}

        {error && <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {alerts.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No alerts recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {alerts.map((alert) => (
                <article key={alert.id} className={`grid gap-4 p-4 md:grid-cols-[180px_1fr_140px] ${alert.reviewed ? 'bg-slate-50' : 'bg-white'}`}>
                  <div className="text-xs text-slate-500">
                    <p className="font-semibold text-slate-800">{new Date(alert.created_at).toLocaleString()}</p>
                    <p className="mt-2">{alert.user_identifier || 'anonymous'}</p>
                    <p>{alert.source || 'unknown source'}</p>
                    <p>{alert.detection_method}</p>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{alert.prompt_excerpt}</p>
                  <button
                    onClick={() => setReviewed(alert.id, !alert.reviewed)}
                    className={`h-10 rounded-md px-3 text-sm font-semibold ${
                      alert.reviewed
                        ? 'border border-slate-300 text-slate-700 hover:bg-white'
                        : 'bg-rose-700 text-white hover:bg-rose-800'
                    }`}
                  >
                    {alert.reviewed ? 'Reopen' : 'Mark reviewed'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
