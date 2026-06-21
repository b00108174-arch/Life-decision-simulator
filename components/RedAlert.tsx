// components/RedAlert.tsx
//
// Rendered INSTEAD OF any decision/simulation UI when a HARM-TO-OTHERS
// signal is detected. Distinct from CrisisSupport (which handles self-harm).
// This is the most severe alert state — shown with maximum visual urgency.
// Developers are also notified via email (see lib/serverSafety.ts).
//
// Rules:
//   - Never render alongside path simulations, timelines, or chat.
//   - Never downgrade to CrisisSupport if harm-to-others is flagged.
//   - Always show emergency services contact, not just mental health lines.

'use client';

interface RedAlertProps {
  onBack: () => void;
}

const EMERGENCY_CONTACTS = [
  { region: 'UAE',           name: 'UAE Police & Emergency',         contact: '999' },
  { region: 'UAE',           name: 'UAE Ambulance',                  contact: '998' },
  { region: 'International', name: 'Interpol Emergency Referral',    contact: 'interpol.int' },
  { region: 'US',            name: 'US Emergency Services',          contact: '911' },
  { region: 'UK',            name: 'UK Emergency Services',          contact: '999' },
  { region: 'EU',            name: 'EU Emergency Number',            contact: '112' },
];

export default function RedAlert({ onBack }: RedAlertProps) {
  return (
    <div className="rounded-2xl border-2 border-red-600 bg-white shadow-xl overflow-hidden">

      {/* ── Flashing red banner ────────────────────────────────── */}
      <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
        <span className="text-3xl select-none" aria-hidden="true">🚨</span>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-red-100">
            Safety System — Red Alert
          </p>
          <h2 className="text-xl font-bold text-white mt-0.5">
            Potential Harm Detected
          </h2>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="p-6">
        <p className="text-sm text-gray-700 leading-relaxed mb-5">
          Your message contained content that may indicate a risk of harm to yourself
          or others. This app cannot process that request. Our team has been notified
          automatically. If there is an immediate threat to anyone&apos;s safety,
          please contact emergency services right now.
        </p>

        {/* Emergency contacts */}
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-red-600 mb-3">
            Emergency Services
          </p>
          <ul className="space-y-2">
            {EMERGENCY_CONTACTS.map((c) => (
              <li
                key={c.name}
                className="flex items-center justify-between gap-3 text-sm text-red-900"
              >
                <span>
                  <span className="font-semibold">{c.name}</span>
                  <span className="ml-1.5 text-xs text-red-400">({c.region})</span>
                </span>
                <span className="font-mono font-bold text-red-700 whitespace-nowrap">
                  {c.contact}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Developer notice */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-1">
            Developer Notice
          </p>
          <p className="text-sm text-amber-800">
            A red-alert event has been logged to the safety database and an email
            notification has been dispatched to the admin address configured in{' '}
            <code className="text-xs bg-amber-100 px-1 rounded">ADMIN_ALERT_EMAIL</code>.
            Review it in the{' '}
            <a
              href="/admin/alerts"
              className="font-semibold underline hover:text-amber-900"
            >
              Safety Inbox →
            </a>
          </p>
        </div>

        <p className="text-sm text-gray-500 mb-5">
          If this was triggered by mistake, please return and rephrase your input.
          This tool is designed for everyday life decisions — not for processing
          content involving threats or violence.
        </p>

        <button
          onClick={onBack}
          className="text-sm font-semibold text-gray-500 hover:text-gray-800 transition"
        >
          ← Back to simulator
        </button>
      </div>
    </div>
  );
}
