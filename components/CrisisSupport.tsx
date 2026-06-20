// components/CrisisSupport.tsx
//
// Rendered INSTEAD OF any decision/simulation UI whenever a crisis
// signal is detected (see lib/crisisDetection.ts + app/api/crisis-check).
// This component must never be shown alongside path simulations,
// timelines, or chat — it fully replaces that content.

'use client';

interface CrisisSupportProps {
  onBack: () => void;
}

// Helplines — keep this list short, accurate, and easy to scan.
// UAE-first since the user base is AUS/Sharjah-based, with major
// international fallbacks. Update if Anthropic/regional guidance changes.
const HELPLINES = [
  { region: 'UAE', name: 'UAE Ministry of Community Development Helpline', contact: '800-HOPE (800-4673)' },
  { region: 'UAE', name: 'Dubai Police Mental Health Support', contact: '800-4438' },
  { region: 'International', name: 'Befrienders Worldwide (find a local helpline)', contact: 'befrienders.org' },
  { region: 'US', name: 'Suicide & Crisis Lifeline', contact: '988 (call or text)' },
  { region: 'UK', name: 'Samaritans', contact: '116 123' },
];

export default function CrisisSupport({ onBack }: CrisisSupportProps) {
  return (
    <div className="bg-white border border-rose-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <span className="text-2xl">💙</span>
        <div>
          <h2 className="text-lg font-bold text-gray-800">You&apos;re not alone in this</h2>
          <p className="text-sm text-gray-600 mt-1">
            What you&apos;ve shared matters, and it deserves more support than a decision
            simulator can offer. Please reach out to someone who can help right now —
            a trusted adult, a counselor, or one of the services below.
          </p>
        </div>
      </div>

      <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-rose-500 mb-3">
          Immediate support
        </p>
        <ul className="space-y-2">
          {HELPLINES.map((h) => (
            <li key={h.name} className="text-sm text-rose-900 flex justify-between gap-3">
              <span>
                <span className="font-semibold">{h.name}</span>
                <span className="text-rose-500 text-xs ml-1">({h.region})</span>
              </span>
              <span className="font-mono text-rose-700 whitespace-nowrap">{h.contact}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        If you or someone else is in immediate danger, please contact local emergency
        services right away. If it feels safe to do so, telling a trusted adult,
        friend, or family member what&apos;s going on can also make a real difference —
        you don&apos;t have to carry this alone.
      </p>

      <button
        onClick={onBack}
        className="text-sm font-semibold text-gray-500 hover:text-gray-700 transition"
      >
        ← Back
      </button>
    </div>
  );
}
