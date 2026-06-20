'use client';

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

const RECOMMENDED_TOGGLE_IDS = new Set(['market_downturn', 'high_financial_support']);

function pathLetter(index: number) {
  return String.fromCharCode(65 + index);
}

function compactTitle(title: string) {
  return title.includes(':') ? title.split(':')[0] : title;
}

function userFacingSacrifice(name: string, path: WarmPath, index: number) {
  const fallback = path.opportunityCost || 'time, emotional bandwidth, and the easier version of the other paths';
  return (
    <>
      {name}, choosing Path {pathLetter(index)} means you sacrifice{' '}
      <strong className="font-semibold text-[#333333]">{fallback}</strong>. Keep this visible before the path starts to feel inevitable.
    </>
  );
}

function userFacingGain(path: WarmPath) {
  return (
    <>
      This path gives you <strong className="font-semibold text-[#333333]">{path.bestFor}</strong>, with clearer tradeoffs than a simple pros-and-cons list.
    </>
  );
}

function BlindspotCopy({ text }: { text: string }) {
  const lower = text.toLowerCase();
  const hasParentRisk = lower.includes('parents') || lower.includes('family');

  if (hasParentRisk) {
    return (
      <>
        Watch for the <strong className="font-semibold text-[#333333]">risk of over-reliance on your parents</strong> and the{' '}
        <strong className="font-semibold text-[#333333]">hidden risk of your own personal identity becoming too intertwined</strong> with this decision.
      </>
    );
  }

  return <>{text}</>;
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
  const user = {
    name: profile?.name || 'you',
    age: profile?.age,
    primaryPriority: 'your stated priorities',
    constraints: ['money', 'future certainty'],
  };
  const possessiveName = profile?.name ? `${profile.name}'s` : 'Your';
  const directName = profile?.name || 'you';

  const recommendedTitle =
    analysis.paths.find((path) => analysis.recommendation.includes(compactTitle(path.title).trim()))?.title ??
    analysis.paths[0]?.title ??
    '';

  return (
    <section className="space-y-6 text-[#333333]">
      <section className="rounded-2xl border border-[#EEEEEE] bg-gradient-to-br from-[#E6E1F9] via-[#F2EDF9] to-[#FAF9F6] p-7 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#666666]">Personalized context</p>
        <h2 className="text-2xl font-semibold leading-snug text-[#333333]">{possessiveName} decision landscape</h2>
        <p className="mt-3 max-w-3xl text-base leading-8 text-[#555555]">
          {profile?.name ? `${profile.name}, you are` : 'You are'} weighing a decision with real personal tradeoffs, not just abstract pros and cons.
          {user.age ? ` Given you are ${user.age},` : ' Based on your profile,'} we will prioritize your constraints, relationships, money pressure, and future certainty.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-[#333333]">Priority: {user.primaryPriority}</span>
          {user.constraints.map((constraint) => (
            <span key={constraint} className="rounded-full border border-white bg-white/60 px-3 py-1 text-xs font-semibold text-[#666666]">
              Constraint: {constraint}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#EEEEEE] bg-white p-6 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#666666]">What-if scenario toggles</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {whatIfToggles.map((toggle) => {
            const active = activeToggles.includes(toggle.id);
            const recommended = RECOMMENDED_TOGGLE_IDS.has(toggle.id);
            return (
              <button
                key={toggle.id}
                onClick={() => onToggleWhatIf(toggle.id)}
                className={`group rounded-2xl border bg-[#FAF9F6] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-md ${
                  active ? 'border-[#B094FF] ring-2 ring-[#E6E1F9]' : recommended ? 'border-[#D8CCFF]' : 'border-[#EEEEEE]'
                }`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-[#B094FF] shadow-sm">
                    {toggle.icon}
                  </span>
                  {recommended && (
                    <span className="rounded-full bg-[#E6E1F9] px-2.5 py-1 text-[11px] font-semibold text-[#333333]">
                      Recommended to toggle
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-[#333333]">{toggle.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#666666]">{toggle.description}</p>
              </button>
            );
          })}
        </div>
        {whatIfLoading && <p className="mt-4 text-sm font-medium text-[#666666]">Rebalancing the scenarios with your constraints...</p>}
      </section>

      <section className="rounded-2xl border border-[#EEEEEE] bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#666666]">Tradeoff matrix</p>
            <h3 className="mt-1 text-xl font-semibold text-[#333333]">A softer view of what each path asks from {directName}</h3>
          </div>
          <span className="rounded-full bg-[#F5E6E6] px-3 py-1 text-xs font-semibold text-[#333333]">Not a spreadsheet verdict</span>
        </div>
        <div className="space-y-4">
          {analysis.paths.map((path, index) => (
            <article key={path.title} className="rounded-2xl border border-[#EEEEEE] bg-[#FAF9F6] p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#B094FF] px-3 py-1 text-xs font-semibold text-white">Path {pathLetter(index)}</span>
                <h4 className="text-base font-semibold text-[#333333]">{path.title}</h4>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[#EEEEEE] bg-white p-4">
                  <span className="mb-3 inline-flex rounded-full bg-[#F5E6E6] px-3 py-1 text-xs font-semibold text-[#333333]">
                    Sacrifice
                  </span>
                  <p className="text-sm leading-7 text-[#666666]">{userFacingSacrifice(user.name, path, index)}</p>
                </div>
                <div className="rounded-2xl border border-[#EEEEEE] bg-white p-4">
                  <span className="mb-3 inline-flex rounded-full bg-[#E7F1E3] px-3 py-1 text-xs font-semibold text-[#333333]">
                    Gain
                  </span>
                  <p className="text-sm leading-7 text-[#666666]">{userFacingGain(path)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#666666]">Simulated future paths</p>
        {analysis.paths.map((path, index) => {
          const whatIf = whatIfResults[path.title];
          return (
            <article key={path.title} className="rounded-2xl border border-[#EEEEEE] bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#B094FF]">Path {pathLetter(index)}</p>
                  <h3 className="mt-1 text-xl font-semibold text-[#333333]">{path.title}</h3>
                </div>
                <button
                  onClick={() => onOpenChat(path, index)}
                  className="rounded-full border border-[#D8CCFF] bg-[#FAF9F6] px-4 py-2 text-sm font-semibold text-[#333333] hover:bg-[#E6E1F9]"
                >
                  Ask AI
                </button>
              </div>

              <p className="mb-5 rounded-2xl bg-[#FAF9F6] p-4 text-sm leading-7 text-[#666666]">{path.choice}</p>

              <div className="grid gap-3 md:grid-cols-2">
                <InfoBlock icon="⏳" title="Short term" text={path.shortTerm} />
                <InfoBlock icon="🔭" title="Long term" text={whatIf?.longTerm || path.longTerm} updated={Boolean(whatIf)} />
                <InfoBlock icon="⚠️" title="Risks" text={whatIf?.risks || path.risks} updated={Boolean(whatIf)} />
                <InfoBlock icon="✅" title="Best for" text={path.bestFor} />
              </div>

              {path.blindspot && (
                <div className="mt-4 rounded-2xl border-2 border-[#EEEEEE] bg-[#FFF8E1] p-4">
                  <p className="mb-2 text-sm font-semibold text-[#333333]">Blindspot alert</p>
                  <p className="text-sm leading-7 text-[#666666]">
                    <BlindspotCopy text={path.blindspot} />
                  </p>
                </div>
              )}

              <div className="mt-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#666666]">Timeline checkpoints</p>
                <div className="flex flex-wrap gap-2">
                  {['1 year', '3 years', '5 years'].map((year) => {
                    const active = activeTimeline?.pathIndex === index && activeTimeline?.year === year;
                    return (
                      <button
                        key={year}
                        onClick={() => onExploreTimeline(index, year, path)}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                          active
                            ? 'border-[#B094FF] bg-[#E6E1F9] text-[#333333]'
                            : 'border-[#EEEEEE] bg-[#FAF9F6] text-[#666666] hover:border-[#D8CCFF]'
                        }`}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
                {activeTimeline?.pathIndex === index && (
                  <div className="mt-3 rounded-2xl border border-[#EEEEEE] bg-[#FAF9F6] p-4 text-sm leading-7 text-[#666666]">
                    {timelineLoading && !timelineData[`${index}-${activeTimeline.year}`]
                      ? 'Opening this future branch...'
                      : timelineData[`${index}-${activeTimeline.year}`] ||
                        (activeTimeline.year === '1 year'
                          ? path.shortTerm
                          : activeTimeline.year === '3 years'
                            ? path.threeYear || path.longTerm
                            : path.fiveYear || path.longTerm)}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-[#D8CCFF] bg-[#E6E1F9] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#666666]">Responsible AI and human-in-the-loop</p>
        <h3 className="mt-1 text-2xl font-semibold text-[#333333]">Final Decision: Humans Remain in Control.</h3>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#555555]">
          This simulator can organize possibilities, but it cannot know your parents, your finances, or the lived reality of a mid-career move.
          Use it as a conversation starter, not an authority.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="rounded-full bg-[#B094FF] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#9D7DFF]">
            Generate conversation points to discuss this matrix with a Mentor or Partner.
          </button>
          <a
            href="#responsible-ai-limitations"
            className="rounded-full border border-white bg-white/70 px-5 py-3 text-sm font-semibold text-[#333333] hover:bg-white"
          >
            How our NLP simulation is different from a spreadsheet.
          </a>
        </div>
      </section>

      <section className="rounded-2xl border border-[#EEEEEE] bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#666666]">Decision flowchart</p>
            <h3 className="mt-1 text-xl font-semibold text-[#333333]">A branching view, not a command</h3>
          </div>
          {profile?.email && (
            <button
              onClick={onSendPlanByEmail}
              disabled={emailStatus === 'sending'}
              className="rounded-full border border-[#D8CCFF] bg-[#FAF9F6] px-4 py-2 text-sm font-semibold text-[#333333] hover:bg-[#E6E1F9] disabled:opacity-50"
            >
              {emailStatus === 'sending' ? 'Sending...' : 'Email me this plan'}
            </button>
          )}
        </div>
        <div id="decision-flowchart-svg">
          <DecisionFlowchart
            scenario={scenario}
            paths={analysis.paths.map((path) => ({ title: path.title, bestFor: path.bestFor }))}
            recommendedTitle={recommendedTitle}
          />
        </div>
        {emailStatus === 'sent' && <p className="mt-3 text-sm text-[#46653D]">Sent. Check your inbox at {profile?.email}.</p>}
        {emailStatus === 'unavailable' && <p className="mt-3 text-sm text-[#666666]">Email delivery is not set up yet. Add a Resend API key.</p>}
        {emailStatus === 'error' && <p className="mt-3 text-sm text-[#7A3E3E]">Could not send the email. Please try again later.</p>}
      </section>

      <section id="responsible-ai-limitations" className="rounded-2xl border border-[#EEEEEE] bg-[#FAF9F6] p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#666666]">Limitations FAQ</p>
        <h3 className="mt-1 text-lg font-semibold text-[#333333]">How this differs from a spreadsheet</h3>
        <p className="mt-2 text-sm leading-7 text-[#666666]">
          A spreadsheet compares static values. This NLP simulation creates narrative futures from your stated context, then asks you to verify them with people you trust.
          It can be wrong, incomplete, or biased, so the human review step is part of the product, not a disclaimer at the bottom.
        </p>
      </section>
    </section>
  );
}

function InfoBlock({ icon, title, text, updated = false }: { icon: string; title: string; text: string; updated?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#EEEEEE] bg-[#FAF9F6] p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base" aria-hidden="true">
          {icon}
        </span>
        <p className="text-sm font-semibold text-[#333333]">{title}</p>
        {updated && <span className="rounded-full bg-[#FFF8E1] px-2 py-0.5 text-[11px] font-semibold text-[#666666]">updated</span>}
      </div>
      <p className="text-sm leading-7 text-[#666666]">{text}</p>
    </div>
  );
}
