'use client';

import { useState } from 'react';
import DecisionFlowchart from '@/components/DecisionFlowchart';
import { CollectedProfile } from '@/components/ProfileAndFollowUp';

export interface TimelineStep {
  label: string;
  text: string;
}

export interface FlowchartStep {
  phase?: string;
  title: string;
  desc: string;
  timeframe?: string; // Added timeframe to the interface
}

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
  tenYear?: string;
  timelineSteps?: TimelineStep[];
  flowchartSteps?: FlowchartStep[];
}

export interface WarmAnalysis {
  summary: string;
  pros: string[];
  cons: string[];
  dynamicWhatIfs?: { id: string; label: string; description: string }[];
  paths: WarmPath[];
  recommendation: string;
}

interface ToggleOption {
  id: string;
  label: string;
  icon?: string;
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

// Helper function to extract a clean title if a model fallback slips a legacy prefix through
function getCleanTitle(title: string) {
  return title.includes(':') ? title.split(':').slice(1).join(':').trim() : title;
}

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
  const cleanTitle = getCleanTitle(path.title);

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
              {letter}: {cleanTitle}
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

        <span className="flex-shrink-0 mt-0.5 text-[var(--text-muted)]" style={{ fontSize: 'var(--text-xs)' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 border-t border-[var(--border-soft)] bg-slate-50/30">
          <div className="pt-1">
            <DetailRow 
              label="🌱 Upside: Short Term Benefits (6–12 months)" 
              text={path.shortTerm} 
              accent="var(--blue-600)"
            />
            <DetailRow 
              label={whatIf ? '🚀 Upside: Long Term Targets · updated' : '🚀 Upside: Long Term Targets (3–5 years)'} 
              text={whatIf?.longTerm ?? path.longTerm} 
              accent="#6366F1"
            />
            <DetailRow 
              label={whatIf ? '⚠️ Downside: Core Risks · updated' : '⚠️ Downside: Core Risks'} 
              text={whatIf?.risks ?? path.risks} 
              accent="#D97706"
            />
            {path.opportunityCost && (
              <DetailRow 
                label="⚖️ Sacrifices: What You Give Up" 
                text={path.opportunityCost} 
                accent="#EF4444"
              />
            )}
            <DetailRow 
              label="🎯 Ideal Match: Best For" 
              text={path.bestFor} 
              accent="var(--sage)"
            />
            {path.blindspot && (
              <DetailRow 
                label="🔍 Hidden Blindspot" 
                text={path.blindspot} 
                accent="#9A3E1E"
              />
            )}
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
  const [timelinePath, setTimelinePath] = useState<number>(0);

  const recommendedTitle = (() => {
    for (const path of analysis.paths) {
      const short = getCleanTitle(path.title);
      if (analysis.recommendation.toLowerCase().includes(short.toLowerCase())) return path.title;
    }
    return analysis.paths[0]?.title ?? '';
  })();

  const selectedPath = analysis.paths[timelinePath];

  const getTimelineMarkerStyles = (idx: number) => {
    const sequence = [
      'border-indigo-500 text-indigo-600',
      'border-cyan-500 text-cyan-600',
      'border-emerald-500 text-emerald-600',
      'border-amber-500 text-amber-600',
      'border-rose-500 text-rose-600',
      'border-purple-500 text-purple-600',
      'border-teal-500 text-teal-600',
    ];
    return sequence[idx % sequence.length];
  };

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

      {/* ── 2. WHAT-IF TOGGLES ── */}
      <div className="rounded-2xl border border-[var(--border-soft)] bg-white p-6 shadow-sm">
        <p className="text-label text-[var(--text-muted)] mb-1">What-if conditions</p>
        <div className="flex flex-wrap gap-2">
          {(analysis.dynamicWhatIfs || whatIfToggles).map((toggle) => {
            const active = activeToggles.includes(toggle.id);
            return (
              <button
                key={toggle.id}
                onClick={() => onToggleWhatIf(toggle.id)}
                title={toggle.description}
                className={`rounded-full border px-5 py-2.5 font-semibold transition-all ${
                  active
                    ? 'border-[var(--blue-400)] bg-[var(--blue-50)] text-[var(--blue-700)] shadow-sm'
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
          <p className="mt-3 text-[var(--text-muted)] animate-pulse" style={{ fontSize: 'var(--text-2xs)' }}>
            Recalculating risks and long-term outcomes under this stress condition…
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
        <h3 className="text-label text-[var(--text-muted)] mb-1">Timeline storybook</h3>
        <div className="mb-6">
          <p className="font-semibold text-[var(--text-secondary)] mb-2" style={{ fontSize: 'var(--text-2xs)' }}>
            Select your sequence lane
          </p>
          <div className="flex flex-wrap gap-2">
            {analysis.paths.map((path, index) => (
              <button
                key={`time-btn-${path.title}`}
                onClick={() => {
                  setTimelinePath(index);
                  if (path) {
                    onExploreTimeline(index, 'Full Sequence', path);
                  }
                }}
                className={`rounded-xl border px-4 py-2.5 font-semibold transition-all ${
                  timelinePath === index
                    ? 'border-[var(--lavender)] bg-[var(--lavender-light)] text-[var(--text-primary)]'
                    : 'border-[var(--border-soft)] bg-[var(--surface-warm)] text-[var(--text-secondary)] hover:border-[var(--lavender-mid)]'
                }`}
                style={{ fontSize: 'var(--text-2xs)' }}
              >
                {getCleanTitle(path.title)}
              </button>
            ))}
          </div>
        </div>

        {timelineLoading ? (
          <p className="text-[var(--text-muted)] animate-pulse py-4" style={{ fontSize: 'var(--text-2xs)' }}>
            Running lifetime sequence simulations...
          </p>
        ) : selectedPath ? (
          <div className="relative mt-4 space-y-6 before:absolute before:bottom-3 before:top-3 before:left-3.5 before:w-0.5 before:bg-[var(--border-soft)]">
            
            {(selectedPath.timelineSteps || [
              { label: '🌱 Stage 1: Initiation (Year 1)', text: selectedPath.shortTerm },
              { label: '⚡ Stage 2: Navigation & Friction (Year 2)', text: 'Navigating initial friction points, iron out execution bottlenecks, and beginning to compound early wins.' },
              { label: '🚀 Stage 3: Momentum Balance (Year 3)', text: selectedPath.threeYear || 'Establishing consistent workflows, stabilizing structural resources, and solidifying long-term strategic alignments.' },
              { label: '🎯 Stage 4: High Growth Target (Year 5)', text: selectedPath.fiveYear || selectedPath.longTerm },
              { label: '🏹 Stage 5: System Legacy Integration (Year 10)', text: selectedPath.tenYear || 'Compounding historical returns take root completely, defining stable lifestyles and opening subsequent generation horizons.' }
            ]).map((step, sIdx) => {
              const markerStyles = getTimelineMarkerStyles(sIdx);
              return (
                <div key={`step-${sIdx}`} className="relative pl-9">
                  <div className={`absolute left-[7px] top-1 h-[14px] w-[14px] rounded-full border-2 bg-white ${markerStyles.split(' ')[0]}`} />
                  <h4 className={`font-bold uppercase tracking-wider ${markerStyles.split(' ')[1]}`} style={{ fontSize: 'var(--text-2xs)' }}>
                    {step.label}
                  </h4>
                  <p className="text-[var(--text-primary)] mt-1.5 leading-relaxed" style={{ fontSize: 'var(--text-xs)' }}>
                    {step.text}
                  </p>
                </div>
              );
            })}

          </div>
        ) : (
          <p className="text-[var(--text-muted)] italic" style={{ fontSize: 'var(--text-2xs)' }}>
            Select a pathway above to initialize the story track.
          </p>
        )}
      </div>

      {/* ── 5. FLOWCHART ── */}
      <div className="rounded-2xl border border-[var(--border-soft)] bg-white p-6 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-label text-[var(--text-primary)] font-bold">Tactical action pipeline</h3>
          </div>
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

        <div className="border-t border-[var(--border-soft)] pt-6">
          <p className="font-semibold text-[var(--text-secondary)] mb-3" style={{ fontSize: 'var(--text-2xs)' }}>
            Select tactical implementation lane:
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            {analysis.paths.map((path, index) => (
              <button
                key={`flow-${path.title}`}
                onClick={() => setOpenIndex(index)}
                className={`rounded-xl border px-4 py-2.5 font-semibold transition-all ${
                  openIndex === index
                    ? 'border-[var(--blue-400)] bg-[var(--blue-50)] text-[var(--blue-700)]'
                    : 'border-[var(--border-soft)] bg-[var(--surface-warm)] text-[var(--text-secondary)] hover:border-[var(--blue-200)]'
                }`}
                style={{ fontSize: 'var(--text-2xs)' }}
              >
                {getCleanTitle(path.title)} Map
              </button>
            ))}
          </div>

          {openIndex !== null && analysis.paths[openIndex] && (
            <div className="w-full overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              <div className="flex flex-row items-stretch space-x-8 min-w-max px-4 relative py-4">
                
                <div className="absolute top-[42px] left-8 right-8 h-0.5 bg-slate-200 z-0" />

                {(analysis.paths[openIndex].flowchartSteps || [
                  { phase: '01', title: 'Setup Baseline', desc: 'Secure operational limits, dependencies, and baseline fallback architectures.', timeframe: 'Now' },
                  { phase: '02', title: 'Core Strategy Execution', desc: analysis.paths[openIndex].choice, timeframe: '2 weeks' },
                  { phase: '03', title: 'Short-Term Deliverables', desc: analysis.paths[openIndex].shortTerm, timeframe: '1 month' },
                  { phase: '04', title: 'Risk Safeguards & Constraints', desc: analysis.paths[openIndex].risks, timeframe: '2 months' },
                  { phase: '05', title: 'Target Metric Capture', desc: `Optimize conditions explicitly for: ${analysis.paths[openIndex].bestFor}`, timeframe: '6 months' }
                ]).map((node, nIdx) => (
                  <div 
                    key={`node-${nIdx}`} 
                    className="w-72 flex-shrink-0 bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative z-10 flex flex-col justify-between transition-all hover:border-[var(--blue-300)] hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] font-bold bg-slate-100 text-slate-500 rounded px-2 py-0.5 uppercase tracking-wide">
                          Step {node.phase || `0${nIdx + 1}`}
                        </span>
                        
                        {/* Styled Green Timestamp Badge */}
                        {node.timeframe && (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5 shadow-2xs">
                            ⏰ {node.timeframe}
                          </span>
                        )}
                      </div>
                      <h5 className="font-bold text-slate-800 text-xs mb-1.5">{node.title}</h5>
                      <p className="text-[var(--text-secondary)] leading-relaxed" style={{ fontSize: 'var(--text-2xs)' }}>
                        {node.desc}
                      </p>
                    </div>
                  </div>
                ))}

              </div>
            </div>
          )}
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
      <p className="text-center text-[var(--text-muted)] px-4" style={{ fontSize: 'var(--text-2xs)' }}>
        AI can make mistakes. Please double-check responses.
      </p>
    </section>
  );
}