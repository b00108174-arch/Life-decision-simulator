// app/history/page.tsx
//
// History dashboard: shows past decisions for the current user.
// Reads from Supabase if configured (via /api/history), otherwise
// falls back to localStorage (lib/localHistory.ts) so this page
// always works, even before the backend is wired up.

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getLocalHistory, getLocalProfile, LocalDecisionRecord } from '@/lib/localHistory';

interface AnalysisShape {
  summary?: string;
  recommendation?: string;
  paths?: { title: string }[];
}

export default function HistoryPage() {
  const [records, setRecords] = useState<LocalDecisionRecord[]>([]);
  const [source, setSource] = useState<'database' | 'local'>('local');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const profile = getLocalProfile();

      // Try the database first if we have an email to look up by.
      if (profile?.email) {
        try {
          const res = await fetch(`/api/history?email=${encodeURIComponent(profile.email)}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.records) && data.records.length > 0) {
              setRecords(data.records);
              setSource('database');
              setLoading(false);
              return;
            }
          }
        } catch {
          // fall through to local
        }
      }

      // Fallback: localStorage
      setRecords(getLocalHistory());
      setSource('local');
      setLoading(false);
    };
    load();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Your decision history</h1>
            <p className="text-sm text-gray-500 mt-1">
              {source === 'local'
                ? 'Stored in this browser only — connect a backend to sync across devices.'
                : 'Synced from your account.'}
            </p>
          </div>
          <Link href="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            ← New simulation
          </Link>
        </div>

        {loading && <p className="text-sm text-gray-400">Loading...</p>}

        {!loading && records.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
            <p className="text-sm text-gray-500">No decisions yet. Run a simulation to see it here.</p>
          </div>
        )}

        <div className="space-y-4">
          {records.map((record) => {
            const analysis = record.analysis as AnalysisShape;
            return (
              <div key={record.id} className="bg-white border border-gray-200 rounded-2xl p-5">
                <p className="text-xs text-gray-400 mb-2">
                  {new Date(record.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
                <p className="text-sm font-semibold text-gray-800 mb-2">{record.scenario}</p>
                {analysis?.summary && <p className="text-sm text-gray-600 mb-2">{analysis.summary}</p>}
                {analysis?.paths && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {analysis.paths.map((p) => (
                      <span key={p.title} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                        {p.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
