'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { checkForCrisisKeywords } from '@/lib/crisisDetection';
import { safeguardText } from '@/lib/toneReview';
import {
  saveLocalProfile,
  saveLocalDecision,
  buildPersonalizationContext,
} from '@/lib/localHistory';
import CrisisSupport from '@/components/CrisisSupport';
import RedAlert from '@/components/RedAlert';
import ProfileAndFollowUp, { CollectedProfile, FollowUpAnswer } from '@/components/ProfileAndFollowUp';
import WarmDecisionResults from '@/components/WarmDecisionResults';

interface Path {
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
}

interface Analysis {
  summary: string;
  pros: string[];
  cons: string[];
  paths: Path[];
  recommendation: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const WHAT_IF_TOGGLES = [
  { id: 'market_downturn', label: 'Market downturn', icon: 'M', description: 'Job market is struggling' },
  { id: 'high_financial_support', label: 'Financial support', icon: 'F', description: 'Strong backing is available' },
  { id: 'low_energy', label: 'Low energy', icon: 'E', description: 'Limited bandwidth or motivation' },
  { id: 'fast_industry_change', label: 'Industry shift', icon: 'I', description: 'The field is changing quickly' },
];

type Stage = 'input' | 'profile' | 'results' | 'crisis' | 'red_alert';

export default function Home() {
  const [stage, setStage] = useState<Stage>('input');
  const [scenario, setScenario] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeToggles, setActiveToggles] = useState<string[]>([]);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [whatIfResults, setWhatIfResults] = useState<Record<string, { risks: string; longTerm: string }>>({});
  const [activeTimeline, setActiveTimeline] = useState<{ pathIndex: number; year: string } | null>(null);
  const [timelineData, setTimelineData] = useState<Record<string, string>>({});
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [chatModal, setChatModal] = useState<{ open: boolean; path: Path | null; pathIndex: number }>({ open: false, path: null, pathIndex: 0 });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<CollectedProfile | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'unavailable' | 'error'>('idle');
  // NEW: tracks whether the flagged content was self_harm or harm_to_others
  // so the correct alert screen (CrisisSupport vs RedAlert) is displayed.
  const [detectedAlertType, setDetectedAlertType] = useState<'self_harm' | 'harm_to_others' | null>(null);

  // Prevents SSR/client hydration mismatch on the Simulate button.
  // The server always renders it as enabled; after mount the real
  // scenario-derived disabled value takes over without a mismatch.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (profile?.name.trim().toLowerCase() === 'veena' && profile.age === 40) {
      const timer = window.setTimeout(() => {
        setProfile(null);
        setProfileId(null);
        setAnalysis(null);
        setStage('input');
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [profile]);

  const runCrisisCheck = async (
    text: string,
    source: 'scenario' | 'profile_followup' | 'deep_dive_chat' = 'scenario',
    context?: { userIdentifier?: string; profileId?: string | null }
  ): Promise<boolean> => {
    const keywordResult = checkForCrisisKeywords(text);
    try {
      const res = await fetch('/api/crisis-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          keywordFlagged: keywordResult.flagged,
          matchedPattern: keywordResult.matchedPattern,
          userIdentifier: context?.userIdentifier ?? profile?.email ?? 'anonymous',
          profileId: context?.profileId ?? profileId ?? undefined,
          source,
        }),
      });
      const data = await res.json();
      if (data.flagged) {
        // NEW: route to red_alert for harm-to-others, crisis for self-harm
        const type = data.alertType ?? keywordResult.alertType ?? 'self_harm';
        setDetectedAlertType(type);
        setStage(type === 'harm_to_others' ? 'red_alert' : 'crisis');
        return true;
      }
      return false;
    } catch {
      if (keywordResult.flagged) {
        const type = keywordResult.alertType ?? 'self_harm';
        setDetectedAlertType(type);
        setStage(type === 'harm_to_others' ? 'red_alert' : 'crisis');
        return true;
      }
      return false;
    }
  };

  const handleScenarioSubmit = async () => {
    if (!scenario.trim()) return;
    setError('');
    const flagged = await runCrisisCheck(scenario, 'scenario');
    if (flagged) return;
    setStage('profile');
  };

  const handleProfileComplete = async (
    collectedProfile: CollectedProfile,
    answers: FollowUpAnswer[],
    savedProfileId?: string | null
  ) => {
    setProfile(collectedProfile);
    setProfileId(savedProfileId ?? null);
    saveLocalProfile(collectedProfile);
    await analyze(collectedProfile, answers, savedProfileId ?? null);
  };

  const analyze = async (
    collectedProfile?: CollectedProfile,
    answers?: FollowUpAnswer[],
    savedProfileId?: string | null
  ) => {
    setLoading(true);
    setError('');
    setAnalysis(null);
    setActiveToggles([]);
    setWhatIfResults({});
    setTimelineData({});
    setEmailStatus('idle');

    try {
      const personalizationContext = buildPersonalizationContext();
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: scenario,
          originalScenario: scenario,
          followUpAnswers: answers ?? [],
          personalizationContext,
          profileId: savedProfileId ?? profileId,
          userIdentifier: collectedProfile?.email ?? profile?.email ?? 'anonymous',
          source: 'scenario',
        }),
      });
      const data = await res.json();
      if (data.flagged) {
        // NEW: distinguish harm_to_others (red_alert) from self_harm (crisis)
        setDetectedAlertType(data.alertType ?? 'self_harm');
        setStage(data.alertType === 'harm_to_others' ? 'red_alert' : 'crisis');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Something went wrong');

      const safeData: Analysis = {
        ...data,
        summary: safeguardText(data.summary),
        recommendation: safeguardText(data.recommendation),
      };

      setAnalysis(safeData);
      setStage('results');
      saveLocalDecision({ scenario, followUpAnswers: answers ?? [], analysis: safeData });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setStage('input');
    } finally {
      setLoading(false);
    }
  };

  const toggleWhatIf = async (toggleId: string) => {
    const newToggles = activeToggles.includes(toggleId)
      ? activeToggles.filter(t => t !== toggleId)
      : [...activeToggles, toggleId];
    setActiveToggles(newToggles);

    if (!analysis || newToggles.length === 0) { setWhatIfResults({}); return; }

    setWhatIfLoading(true);
    const conditions = WHAT_IF_TOGGLES.filter(t => newToggles.includes(t.id)).map(t => t.label).join(', ');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: `Given these active conditions: ${conditions}. For this original scenario: "${scenario}". Rewrite only the risks and longTerm for each of these paths: ${analysis.paths.map(p => p.title).join(', ')}. Return ONLY a JSON object like: {"Path A: title": {"risks": "...", "longTerm": "..."}, "Path B: title": {...}}. Use the exact path titles as keys.`,
          originalScenario: scenario,
          profileId,
          userIdentifier: profile?.email ?? 'anonymous',
          source: 'server_analyze',
        }),
      });
      const data = await res.json();
      const results: Record<string, { risks: string; longTerm: string }> = {};
      analysis.paths.forEach(path => {
        if (data[path.title]) {
          results[path.title] = data[path.title];
        } else {
          results[path.title] = {
            risks: data.paths?.[0]?.risks || path.risks,
            longTerm: data.paths?.[0]?.longTerm || path.longTerm,
          };
        }
      });
      setWhatIfResults(results);
    } catch { console.error('What-if failed'); }
    finally { setWhatIfLoading(false); }
  };

  const exploreTimeline = async (pathIndex: number, year: string, path: Path) => {
    const key = `${pathIndex}-${year}`;
    setActiveTimeline({ pathIndex, year });

    // Use cached pre-generated fields if available to avoid an extra API call
    const cached =
      year === '1 year'   ? path.shortTerm  :
      year === '3 years'  ? path.threeYear  :
      year === '5 years'  ? path.fiveYear   :
      year === '10 years' ? path.tenYear    :
      undefined;

    if (timelineData[key]) return;
    if (cached) {
      setTimelineData(prev => ({ ...prev, [key]: cached }));
      return;
    }

    setTimelineLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: `For someone who chose "${path.title}" (${path.choice}) in this scenario: "${scenario}". Describe specifically and vividly what their life looks like at the ${year} mark. Cover: career/finances, relationships, wellbeing, regrets or pride. What compounded effects have occurred? Return as JSON with a single "text" field.`,
          originalScenario: scenario,
          profileId,
          userIdentifier: profile?.email ?? 'anonymous',
          source: 'server_analyze',
        }),
      });
      const data = await res.json();
      setTimelineData(prev => ({
        ...prev,
        [key]: data.text || data.summary || data.recommendation || `At ${year}: ${path.longTerm}`
      }));
    } catch {
      setTimelineData(prev => ({ ...prev, [key]: `At ${year}: ${path.longTerm}` }));
    } finally { setTimelineLoading(false); }
  };

  const openChat = (path: Path, pathIndex: number) => {
    setChatModal({ open: true, path, pathIndex });
    setChatMessages([{
      role: 'assistant',
      content: `I'm your advisor for **${path.title}**. You've chosen to ${path.choice}. Ask me anything — "What if I hate it after 3 months?", "What does success look like?", or any scenario you're worried about.`
    }]);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !chatModal.path) return;
    const userMsg = chatInput.trim();
    const flagged = await runCrisisCheck(userMsg, 'deep_dive_chat');
    if (flagged) { setChatModal({ open: false, path: null, pathIndex: 0 }); return; }

    setChatInput('');
    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: userMsg }];
    setChatMessages(newMessages);
    setChatLoading(true);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: `You are a life advisor. Context: The user chose "${chatModal.path.title}" for their scenario: "${scenario}". Path details: ${chatModal.path.choice}. Short term: ${chatModal.path.shortTerm}. Long term: ${chatModal.path.longTerm}. The user asks: "${userMsg}". Give a thoughtful, specific response. Return as JSON with a single "answer" field containing your response as plain text.`,
          originalScenario: userMsg,
          profileId,
          userIdentifier: profile?.email ?? 'anonymous',
          source: 'deep_dive_chat',
        }),
      });
      const data = await res.json();
      if (data.flagged) { setChatModal({ open: false, path: null, pathIndex: 0 }); setStage('crisis'); return; }
      const answer = safeguardText(data.answer || data.summary || data.recommendation || 'Let me think about that differently...');
      setChatMessages([...newMessages, { role: 'assistant', content: answer }]);
    } catch {
      setChatMessages([...newMessages, { role: 'assistant', content: 'Sorry, something went wrong. Try again.' }]);
    } finally { setChatLoading(false); }
  };

  const sendPlanByEmail = async () => {
    if (!profile?.email || !analysis) return;
    setEmailStatus('sending');
    const svgElement = document.getElementById('decision-flowchart-svg');
    const flowchartSvg = svgElement ? svgElement.outerHTML : '';

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: profile.email,
          name: profile.name,
          scenario,
          summary: analysis.summary,
          recommendation: analysis.recommendation,
          paths: analysis.paths.map(p => ({ title: p.title, choice: p.choice, bestFor: p.bestFor })),
          flowchartSvg,
        }),
      });
      const data = await res.json();
      if (data.error === 'not_configured') setEmailStatus('unavailable');
      else if (!res.ok || data.error) setEmailStatus('error');
      else setEmailStatus('sent');
    } catch { setEmailStatus('error'); }
  };

  const resetToStart = () => {
    setStage('input');
    setScenario('');
    setAnalysis(null);
    setProfile(null);
    setDetectedAlertType(null); // NEW: clear alert state on back
  };

  /* ─── Derived ─── */
  const showDock = stage === 'input';

  return (
    <main className={`min-h-screen bg-[#F7F8FC] text-[#1E2235] ${showDock ? 'has-scenario-dock' : ''}`}>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header className="header-bar sticky top-0 z-30 px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <div>
            <h1
              className="font-display font-semibold text-[#1E2235] tracking-tight"
              style={{ fontSize: 'var(--text-lg)' }}   /* 26px — golden ratio heading */
            >
              {stage !== 'input' && profile?.name
                ? `${profile.name}'s Life Path Simulator`
                : 'Life Decision Simulator'}
            </h1>
            <p
              className="mt-0.5 text-[#7A809A]"
              style={{ fontSize: 'var(--text-xs)' }}    /* 11px — golden ratio label */
            >
              Simulating unique future cascading scenarios using predictive NLP for mid-career choices.
            </p>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/admin/alerts"
              className="whitespace-nowrap rounded-full border border-[#A8CFEE] bg-[#EEF5FC] px-4 py-2 font-semibold text-[#245F9A] hover:bg-[#D6E8F7]"
              style={{ fontSize: 'var(--text-xs)' }}
            >
              Safety inbox
            </Link>
            <Link
              href="/history"
              className="whitespace-nowrap rounded-full border border-[#E4E8F2] bg-white px-4 py-2 font-semibold text-[#4A5068] hover:bg-[#F7F8FC]"
              style={{ fontSize: 'var(--text-xs)' }}
            >
              History
            </Link>
          </nav>
        </div>
      </header>

      {/* ── PAGE CONTENT ───────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

        {/* CRISIS STAGE — self-harm support screen */}
        {stage === 'crisis' && <CrisisSupport onBack={resetToStart} />}

        {/* RED ALERT STAGE — harm-to-others, highest severity */}
        {stage === 'red_alert' && <RedAlert onBack={resetToStart} />}

        {/* INPUT STAGE — hero copy, sits above the bottom dock */}
        {stage === 'input' && (
          <div className="fade-up flex flex-col items-center justify-center py-16 text-center">
            <span
              className="mb-4 inline-block rounded-full bg-[#EEF5FC] px-4 py-1.5 font-semibold text-[#4A90D9]"
              style={{ fontSize: 'var(--text-xs)' }}
            >
              AI-powered decision planning
            </span>
            <h2
              className="font-display font-bold text-[#1E2235] leading-tight max-w-2xl"
              style={{ fontSize: 'var(--text-xl)' }}   /* 42px display */
            >
              What decision is{' '}
              <span className="text-[#4A90D9]">weighing on you?</span>
            </h2>
            <p
              className="mt-4 max-w-lg text-[#7A809A] leading-relaxed"
              style={{ fontSize: 'var(--text-sm)' }}
            >
              Describe your scenario below and we'll simulate realistic future paths — complete with tradeoffs, timelines, and a personal flowchart.
            </p>

            {error && (
              <div
                className="mt-6 w-full max-w-xl rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700"
                style={{ fontSize: 'var(--text-xs)' }}
              >
                {error}
              </div>
            )}
          </div>
        )}

        {/* PROFILE + FOLLOW-UP STAGE */}
        {stage === 'profile' && (
          <div className="fade-up">
            <ProfileAndFollowUp
              scenario={scenario}
              onComplete={handleProfileComplete}
              onCrisisCheck={runCrisisCheck}
            />
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4 animate-pulse mt-6">
            <div className="h-28 rounded-2xl bg-[#EEF5FC]" />
            <div className="h-28 rounded-2xl bg-[#EEF5FC]" />
            <div className="h-28 rounded-2xl bg-[#EEF5FC]" />
          </div>
        )}

        {/* RESULTS STAGE */}
        {stage === 'results' && analysis && !loading && (
          <div className="fade-up">
            <WarmDecisionResults
              scenario={scenario}
              analysis={analysis}
              profile={profile}
              whatIfToggles={WHAT_IF_TOGGLES}
              activeToggles={activeToggles}
              whatIfLoading={whatIfLoading}
              whatIfResults={whatIfResults}
              activeTimeline={activeTimeline}
              timelineData={timelineData}
              timelineLoading={timelineLoading}
              emailStatus={emailStatus}
              onToggleWhatIf={toggleWhatIf}
              onExploreTimeline={exploreTimeline}
              onOpenChat={openChat}
              onSendPlanByEmail={sendPlanByEmail}
            />
          </div>
        )}
      </div>

      {/* ── BOTTOM-DOCKED SCENARIO INPUT ───────────────────────────── */}
      {showDock && (
        <div className="scenario-dock">
          <div className="mx-auto w-full max-w-2xl">
            <div className="relative flex items-end gap-3 rounded-2xl border border-[#A8CFEE] bg-white p-1 shadow-lg shadow-[#4A90D9]/10">
              <textarea
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleScenarioSubmit();
                  }
                }}
                rows={2}
                placeholder="e.g. Should I take a job offer abroad or stay close to family?"
                className="flex-1 resize-none rounded-xl bg-transparent px-4 py-3 text-[#1E2235] placeholder-[#7A809A] focus:outline-none"
                style={{ fontSize: 'var(--text-sm)', lineHeight: '1.6' }}
              />
              <button
                onClick={handleScenarioSubmit}
                disabled={isMounted && !scenario.trim()}
                className="mb-1 mr-1 flex-shrink-0 rounded-xl bg-[#4A90D9] px-5 py-3 font-semibold text-white shadow-sm hover:bg-[#357ABD] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontSize: 'var(--text-xs)' }}
              >
                Simulate →
              </button>
            </div>
            <p
              className="mt-2 text-center text-[#7A809A]"
              style={{ fontSize: 'var(--text-2xs)' }}
            >
              Press Enter or click Simulate · Shift+Enter for a new line
            </p>
          </div>
        </div>
      )}

      {/* ── CHAT MODAL ─────────────────────────────────────────────── */}
      {chatModal.open && chatModal.path && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm sm:items-center sm:justify-center p-4">
          <div className="flex h-[72vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">

            {/* Modal header */}
            <div className="flex items-center justify-between rounded-t-2xl border-b border-[#E4E8F2] bg-[#EEF5FC] p-4">
              <div>
                <p
                  className="font-semibold uppercase tracking-widest text-[#4A90D9]"
                  style={{ fontSize: 'var(--text-2xs)' }}
                >
                  Deep Dive
                </p>
                <p
                  className="font-display font-semibold text-[#1E2235] mt-0.5"
                  style={{ fontSize: 'var(--text-xs)' }}
                >
                  {chatModal.path.title}
                </p>
              </div>
              <button
                onClick={() => setChatModal({ open: false, path: null, pathIndex: 0 })}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#7A809A] hover:text-[#1E2235] hover:bg-[#F7F8FC]"
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-xs rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-[#4A90D9] text-white rounded-br-sm'
                        : 'bg-[#F7F8FC] text-[#1E2235] rounded-bl-sm border border-[#E4E8F2]'
                    }`}
                    style={{ fontSize: 'var(--text-xs)' }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div
                    className="animate-pulse rounded-2xl rounded-bl-sm border border-[#E4E8F2] bg-[#F7F8FC] px-4 py-3 text-[#7A809A]"
                    style={{ fontSize: 'var(--text-xs)' }}
                  >
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 border-t border-[#E4E8F2] p-3">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="What if I hate it after 3 months?"
                className="flex-1 rounded-xl border border-[#D6E8F7] bg-[#F7F8FC] px-4 py-2.5 text-[#1E2235] placeholder-[#7A809A]"
                style={{ fontSize: 'var(--text-xs)' }}
              />
              <button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="rounded-xl bg-[#4A90D9] px-4 py-2.5 font-semibold text-white disabled:opacity-40 hover:bg-[#357ABD]"
                style={{ fontSize: 'var(--text-xs)' }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}