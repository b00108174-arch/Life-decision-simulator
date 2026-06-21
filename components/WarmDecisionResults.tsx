'use client';

import { useState } from 'react';
import DecisionFlowchart from '@/components/DecisionFlowchart';
import { CollectedProfile } from '@/components/ProfileAndFollowUp';

export interface WarmPath {
  title: string;
  choice: string;
  shortTerm: string;
  longTerm: string;
  risks: string;
  bestFor: string;
  opportunityCost?: string;
  blindspot?: string;
  threeYear?: string;
  fiveYear?: string;
}

export interface WarmAnalysis {
  summary: string;
  pros: string[];
  cons: string[];
  paths: WarmPath[];
  recommendation: string;
}

interface ToggleOption {
  id: string;
  label: string;
  icon: string;
  description: string;
}

interface WarmDecisionResultsProps {
  scenario: string;
  analysis: WarmAnalysis;
  profile: CollectedProfile | null;
  whatIfToggles: ToggleOption[];
  activeToggles: string[];
  whatIfLoading: boolean;
  whatIfResults: Record<string, { risks: string; longTerm: string }>;
  activeTimeline: { pathIndex: number; year: string } | null;
  timelineData: Record<string, string>;
  timelineLoading: boolean;
  emailStatus: 'idle' | 'sending' | 'sent' | 'unavailable' | 'error';
  onToggleWhatIf: (toggleId: string) => void;
  onExploreTimeline: (pathIndex: number, year: string, path: WarmPath) => void;
  onOpenChat: (path: WarmPath, pathIndex: number) => void;
  onSendPlanByEmail: () => void;
}

const TIMELINE_YEARS = ['1 year', '3 years', '5 years', '10 years'] as const;

function pathLetter(index: number) {
  return String.fromCharCode(65 + index);
}

function DetailRow({ label, text, accent }: { label: string; text: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-1 py-4 border-b border-[var(--border-soft)] last:border-0">
      <span
        className="font-semibold uppercase tracking-widest"
        style={{ fontSize: 'var(--text-2xs)', color: accent ?? 'var(--text-muted)' }}
      >
        {label}
      </span>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
        {text}
      </p>
    </div>
  );
}

function PathCard({
  path,
  index,
  isRecommended,
  whatIf,
  isOpen,
  onToggle,
  onOpenChat,
}: {
  path: WarmPath;
  index: number;
  isRecommended: boolean;
  whatIf?: { risks: string; longTerm: string };
  isOpen: boolean;
  onToggle: () => void;
  onOpenChat: () => void;
}) {
  const letter = pathLetter(index);

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 ${
        isRecommended
          ? 'border-[var(--blue-400)] bg-[var(--blue-50)] shadow-md shadow-[#4A90D9]/10'
          : 'border-[var(--border-soft)] bg-white hover:border-[var(--blue-200)] hover:shadow-sm'
      }`}
    >
      <button onClick={onToggle} className="w-full flex items-start gap-4 p-5 text-left">
        <span
          className={`flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full font-display font-bold ${
            isRecommended ? 'bg-[var(--blue-500)] text-white' : 'bg-[var(--lavender-light)] text-[var(--lavender)]'
          }`}
          style={{ fontSize: 'var(--text-xs)' }}
        >
          {letter}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold text-[var(--text-primary)]" style={{ fontSize: 'var(--text-xs)' }}>
              {path.title}
            </span>
            {isRecommended && (
              <span className="rounded-full bg-[var(--blue-500)] px-3 py-0.5 font-semibold text-white" style={{ fontSize: 'var(--text-2xs)' }}>
                Suggested
              </span>
            )}
          </div>
          <p className="mt-1 text-[var(--text-secondary)] line-clamp-2" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.55 }}>
            {path.choice}
          </p>
        </div>

        <span className="flex-shrink-0 mt-0.5 text-[var(--text-muted)] text-xl">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 border-t border-[var(--border-soft)]">
          <div className="pt-1">
            <DetailRow label="Short term (6–12 months)" text={path.shortTerm} />
            <DetailRow label={whatIf ? 'Long term · updated' : 'Long term (3–5 years)'} text={whatIf?.longTerm ?? path.longTerm} accent={whatIf ? 'var(--blue-600)' : undefined} />
            <DetailRow label={whatIf ? 'Risks · updated' : 'Risks'} text={whatIf?.risks ?? path.risks} accent={whatIf ? '#c05c00' : undefined} />
            <DetailRow label="Best for" text={path.bestFor} />
            {path.opportunityCost && <DetailRow label="What you give up" text={path.opportunityCost} />}
            {path.blindspot && <DetailRow label="⚠ Blindspot" text={path.blindspot} accent="#9a3e1e" />}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onOpenChat(); }}
            className="mt-4 rounded-full border border-[var(--lavender-mid)] bg-[var(--lavender-light)] px-5 py-2.5 font-semibold text-[var(--text-primary)] hover:bg-[var(--lavender-mid)] transition-colors"
            style={{ fontSize: 'var(--text-2xs)' }}
          >
            Ask AI about this path →
          </button>
        </div>
      )}
    </div>
  );
}

export default function WarmDecisionResults({
  scenario,
  analysis,
  profile,
  whatIfToggles,
  activeToggles,
  whatIfLoading,
  whatIfResults,
  activeTimeline,
  timelineData,
  timelineLoading,
  emailStatus,
  onToggleWhatIf,
  onExploreTimeline,
  onOpenChat,
  onSendPlanByEmail,
}: WarmDecisionResultsProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [timelinePath, setTimelinePath] = useState<number | null>(0);
  const [timelineYear, setTimelineYear] = useState<string>('3 years');

  const recommendedTitle = (() => {
    for (const path of analysis.paths) {
      const short = path.title.includes(':') ? path.title.split(':')[0].trim() : path.title;
      if (analysis.recommendation.includes(short)) return path.title;
    }
    return analysis.paths[0]?.title ?? '';
  })();

  const handleTimelineRequest = () => {
    if (timelinePath === null || !timelineYear) return;
    const path = analysis.paths[timelinePath];
    if (!path) return;
    onExploreTimeline(timelinePath, timelineYear, path);
  };

  const timelineKey = timelinePath !== null && timelineYear ? `${timelinePath}-${timelineYear}` : null;
  const timelineResult = timelineKey ? timelineData[timelineKey] : null;

  const isTimelineActive = activeTimeline?.pathIndex === timelinePath && activeTimeline?.year === timelineYear;

  return (
    <section className="space-y-10 pb-12" style={{ fontSize: 'var(--text-xs)' }}>

      {/* ── 1. SUMMARY ── */}
      <div className="rounded-2xl border border-[var(--blue-100)] bg-[var(--blue-50)] p-6">
        <p className="text-label text-[var(--blue-700)] mb-2">Summary</p>
        <p className="text-[var(--text-primary)] leading-relaxed" style={{ fontSize: 'var(--text-xs)' }}>
          {analysis.summary}
        </p>
        {analysis.recommendation && (
          <p className="mt-3 text-[var(--text-secondary)] border-t border-[var(--blue-100)] pt-3" style={{ fontSize: 'var(--text-2xs)' }}>
            <span className="font-semibold text-[var(--blue-700)]">Starting point: </span>
            {analysis.recommendation}
          </p>
        )}
      </div>

      {/* ── 2. WHAT-IF TOGGLES (Moved Above Suggested Paths) ── */}
      <div className="rounded-2xl border border-[var(--border-soft)] bg-white p-6 shadow-sm">
        <p className="text-label text-[var(--text-muted)] mb-3">What-if conditions</p>
        <div className="flex flex-wrap gap-2">
          {whatIfToggles.map((toggle) => {
            const active = activeToggles.includes(toggle.id);
            return (
              <button
                key={toggle.id}
                onClick={() => onToggleWhatIf(toggle.id)}
                className={`rounded-full border px-5 py-2.5 font-semibold transition-all ${
                  active
                    ? 'border-[var(--blue-400)] bg-[var(--blue-50)] text-[var(--blue-700)]'
                    : 'border-[var(--border-soft)] bg-[var(--surface-warm)] text-[var(--text-secondary)] hover:border-[var(--blue-200)]'
                }`}
                style={{ fontSize: 'var(--text-2xs)' }}
              >
                {active ? '✓ ' : ''}{toggle.label}
              </button>
            );
          })}
        </div>
        {whatIfLoading && (
          <p className="mt-3 text-[var(--text-muted)]" style={{ fontSize: 'var(--text-2xs)' }}>
            Recalculating risks and long-term outcomes…
          </p>
        )}
        {activeToggles.length > 0 && !whatIfLoading && (
          <p className="mt-2 text-[var(--blue-600)]" style={{ fontSize: 'var(--text-2xs)' }}>
            Risks and long-term fields in each path are updated for the active conditions.
          </p>
        )}
      </div>

      {/* ── 3. EXPLORABLE PATHS ACCORDIONS ── */}
      <div>
        <p className="text-label text-[var(--text-muted)] mb-3">
          {analysis.paths.length} path{analysis.paths.length !== 1 ? 's' : ''} identified
        </p>
        <div className="space-y-4">
          {analysis.paths.map((path, index) => (
            <PathCard
              key={path.title}
              path={path}
              index={index}
              isRecommended={path.title === recommendedTitle}
              whatIf={whatIfResults[path.title]}
              isOpen={openIndex === index}
              onToggle={() => setOpenIndex(openIndex === index ? null : index)}
              onOpenChat={() => onOpenChat(path, index)}
            />
          ))}
        </div>
      </div>

      {/* ── 4. TIMELINE EXPLORER ── */}
      <div className="rounded-2xl border border-[var(--border-soft)] bg-white p-6 shadow-sm">
        <p className="text-label text-[var(--text-muted)] mb-1">Timeline explorer</p>
        <p className="text-[var(--text-muted)] mb-4" style={{ fontSize: 'var(--text-2xs)' }}>
          Choose a path and a time horizon to see a vivid projection of what life looks like at that point.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Path Selector */}
          <div>
            <p className="font-semibold text-[var(--text-secondary)] mb-2" style={{ fontSize: 'var(--text-2xs)' }}>
              Select path
            </p>
            <div className="flex flex-col gap-2">
              {analysis.paths.map((path, index) => (
                <button
                  key={path.title}
                  onClick={() => setTimelinePath(index)}
                  className={`w-full text-left rounded-xl border px-4 py-3 font-semibold transition-all ${
                    timelinePath === index
                      ? 'border-[var(--lavender)] bg-[var(--lavender-light)] text-[var(--text-primary)]'
                      : 'border-[var(--border-soft)] bg-[var(--surface-warm)] text-[var(--text-secondary)] hover:border-[var(--lavender-mid)]'
                  }`}
                  style={{ fontSize: 'var(--text-2xs)' }}
                >
                  Path {pathLetter(index)} {path.title.includes(':') && `· ${path.title.split(':')[1]?.trim()}`}
                </button>
              ))}
            </div>
          </div>

          {/* Horizon Selector */}
          <div>
            <p className="font-semibold text-[var(--text-secondary)] mb-2" style={{ fontSize: 'var(--text-2xs)' }}>
              Time horizon
            </p>
            <div className="grid grid-cols-2 gap-2">
              {TIMELINE_YEARS.map((year) => (
                <button
                  key={year}
                  onClick={() => setTimelineYear(year)}
                  className={`rounded-xl border p-3 font-semibold transition-all text-center ${
                    timelineYear === year
                      ? 'border-[var(--blue-400)] bg-[var(--blue-50)] text-[var(--blue-700)]'
                      : 'border-[var(--border-soft)] bg-[var(--surface-warm)] text-[var(--text-secondary)] hover:border-[var(--blue-200)]'
                  }`}
                  style={{ fontSize: 'var(--text-2xs)' }}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleTimelineRequest}
          disabled={timelinePath === null || !timelineYear || timelineLoading}
          className="w-full md:w-auto rounded-xl bg-[var(--blue-500)] px-6 py-3 font-semibold text-white disabled:opacity-40 hover:bg-[var(--blue-600)] transition-colors"
          style={{ fontSize: 'var(--text-2xs)' }}
        >
          {timelineLoading && isTimelineActive ? 'Projecting…' : 'Project this future →'}
        </button>

        {timelineResult && (
          <div className="mt-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-warm)] p-4">
            <p className="font-semibold text-[var(--text-muted)] mb-2" style={{ fontSize: 'var(--text-2xs)' }}>
              {timelinePath !== null ? analysis.paths[timelinePath]?.title : ''} · {timelineYear}
            </p>
            <p className="text-[var(--text-primary)] leading-relaxed" style={{ fontSize: 'var(--text-xs)', lineHeight: 1.7 }}>
              {timelineResult}
            </p>
          </div>
        )}
      </div>

      {/* ── 5. FLOWCHART + EMAIL ── */}
      <div className="rounded-2xl border border-[var(--border-soft)] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <p className="text-label text-[var(--text-muted)]">Decision flowchart</p>
          {profile?.email && (
            <button
              onClick={onSendPlanByEmail}
              disabled={emailStatus === 'sending'}
              className="rounded-full border border-[var(--blue-200)] bg-[var(--blue-50)] px-5 py-2.5 font-semibold text-[var(--blue-700)] hover:bg-[var(--blue-100)] disabled:opacity-50 transition-colors"
              style={{ fontSize: 'var(--text-2xs)' }}
            >
              {emailStatus === 'sending' ? 'Sending…' : 'Email me this plan'}
            </button>
          )}
        </div>
        <div id="decision-flowchart-svg">
          <DecisionFlowchart
            scenario={scenario}
            paths={analysis.paths.map((p) => ({ title: p.title, bestFor: p.bestFor }))}
            recommendedTitle={recommendedTitle}
          />
        </div>
        {emailStatus === 'sent' && (
          <p className="mt-3 text-[var(--sage)]" style={{ fontSize: 'var(--text-2xs)' }}>
            Sent to {profile?.email}.
          </p>
        )}
      </div>

      <p className="text-center text-[var(--text-muted)] px-4" style={{ fontSize: 'var(--text-2xs)' }}>
        This simulator organises possibilities — it cannot know your full circumstances.
        Use it as a conversation starter, not a final authority.
      </p>
    </section>
  );
}