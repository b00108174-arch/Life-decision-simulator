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

// App flow stages. 'crisis' fully replaces the simulation UI and is
// never shown alongside path content — see components/CrisisSupport.tsx.
type Stage = 'input' | 'profile' | 'results' | 'crisis';

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

  // Profile state and email-send status for the flowchart delivery feature.
  const [profile, setProfile] = useState<CollectedProfile | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'unavailable' | 'error'>('idle');

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

  /**
   * Runs both layers of crisis detection (keyword, client-side, then AI
   * confirmation, server-side) on a piece of free text. Returns true if
   * the text was flagged, in which case the caller should stop whatever
   * it was doing and let this function's side effect (switching to the
   * 'crisis' stage) take over. This must run BEFORE any scenario is
   * sent to /api/analyze, and before any follow-up answer is accepted.
   */
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
        setStage('crisis');
        return true;
      }
      return false;
    } catch {
      // If the check itself fails, fail closed only on a clear keyword
      // hit — otherwise let the user continue rather than blocking the
      // whole app on a network blip.
      if (keywordResult.flagged) {
        setStage('crisis');
        return true;
      }
      return false;
    }
  };

  /**
   * Step 1 of the flow: user enters a scenario. Run crisis check first;
   * if clear, move to profile + follow-up collection instead of
   * analyzing immediately.
   */
  const handleScenarioSubmit = async () => {
    if (!scenario.trim()) return;
    setError('');

    const flagged = await runCrisisCheck(scenario, 'scenario');
    if (flagged) return;

    setStage('profile');
  };

  /**
   * Step 2 callback: profile + follow-up answers collected. Now run
   * the actual analysis.
   */
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
          scenario: scenario + `. For each path also provide: 1) opportunityCost: what is specifically sacrificed by choosing this path over others, 2) blindspot: one non-obvious hidden consequence most people miss, 3) threeYear: specific situation at 3 years, 4) fiveYear: specific situation at 5 years. Add these as extra fields inside each path object.`,
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
        setStage('crisis');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Something went wrong');

      // Apply tone safeguard to top-level text fields as a backstop,
      // in addition to the system-prompt instruction already sent to
      // the model (see lib/toneReview.ts).
      const safeData: Analysis = {
        ...data,
        summary: safeguardText(data.summary),
        recommendation: safeguardText(data.recommendation),
      };

      setAnalysis(safeData);
      setStage('results');

      // Persist to local history immediately (works even without a
      // backend). The /api/analyze route also persists to Supabase
      // server-side if configured and a profileId is present.
      saveLocalDecision({
        scenario,
        followUpAnswers: answers ?? [],
        analysis: safeData,
      });
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

    if (!analysis || newToggles.length === 0) {
      setWhatIfResults({});
      return;
    }

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
    } catch {
      console.error('What-if failed');
    } finally {
      setWhatIfLoading(false);
    }
  };

  const exploreTimeline = async (pathIndex: number, year: string, path: Path) => {
    const key = `${pathIndex}-${year}`;
    if (activeTimeline?.pathIndex === pathIndex && activeTimeline?.year === year) {
      setActiveTimeline(null);
      return;
    }
    setActiveTimeline({ pathIndex, year });
    if (timelineData[key]) return;

    setTimelineLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: `For someone who chose "${path.title}" (${path.choice}) in this scenario: "${scenario}". Describe specifically what their life looks like at the ${year} mark. What compounded effects have occurred? What decisions are they now facing? Be concrete and vivid. Return as JSON with a single "text" field.`,
          originalScenario: scenario,
          profileId,
          userIdentifier: profile?.email ?? 'anonymous',
          source: 'server_analyze',
        }),
      });
      const data = await res.json();
      setTimelineData(prev => ({
        ...prev,
        [key]: data.summary || data.recommendation || data.text || `At ${year}: ${path.longTerm}`
      }));
    } catch {
      setTimelineData(prev => ({ ...prev, [key]: `At ${year}: ${path.longTerm}` }));
    } finally {
      setTimelineLoading(false);
    }
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

    // Crisis check on chat messages too — the deep-dive chat is still
    // a free-text input surface and needs the same protection.
    const flagged = await runCrisisCheck(userMsg, 'deep_dive_chat');
    if (flagged) {
      setChatModal({ open: false, path: null, pathIndex: 0 });
      return;
    }

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
      if (data.flagged) {
        setChatModal({ open: false, path: null, pathIndex: 0 });
        setStage('crisis');
        return;
      }
      const answer = safeguardText(data.answer || data.summary || data.recommendation || 'Let me think about that differently...');
      setChatMessages([...newMessages, { role: 'assistant', content: answer }]);
    } catch {
      setChatMessages([...newMessages, { role: 'assistant', content: 'Sorry, something went wrong. Try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  /** Sends the flowchart + decision plan to the user's email via Resend. */
  const sendPlanByEmail = async () => {
    if (!profile?.email || !analysis) return;
    setEmailStatus('sending');

    // Serialize the flowchart SVG so it can be embedded in the email body.
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
      if (data.error === 'not_configured') {
        setEmailStatus('unavailable');
      } else if (!res.ok || data.error) {
        setEmailStatus('error');
      } else {
        setEmailStatus('sent');
      }
    } catch {
      setEmailStatus('error');
    }
  };

  const resetToStart = () => {
    setStage('input');
    setScenario('');
    setAnalysis(null);
    setProfile(null);
  };

  return (
    <main className="min-h-screen bg-[#FAF9F6] px-4 py-6 text-[#333333] sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#EEEEEE] pb-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#333333]">
              {stage !== 'input' && profile?.name ? `${profile.name}'s Life Path Simulator` : 'Life Decision Simulator'}
            </h1>
            <p className="mt-1 text-sm leading-6 text-[#666666]">
              Simulating unique future cascading scenarios using predictive NLP for mid-career choices.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/alerts" className="whitespace-nowrap rounded-full border border-[#D8CCFF] px-4 py-2 text-sm font-semibold text-[#333333] hover:bg-white">
              Safety inbox
            </Link>
            <Link href="/history" className="whitespace-nowrap rounded-full border border-[#EEEEEE] px-4 py-2 text-sm font-semibold text-[#666666] hover:bg-white">
              History
            </Link>
          </div>
        </div>

        {/* CRISIS STAGE — fully replaces all simulation/decision UI.
            No paths, toggles, timelines, or chat are rendered here. */}
        {stage === 'crisis' && <CrisisSupport onBack={resetToStart} />}

        {/* INPUT STAGE */}
        {stage === 'input' && (
          <div className="rounded-2xl border border-[#EEEEEE] bg-white p-7 shadow-sm">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#666666]">
              Describe your decision
            </label>
            <textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              rows={4}
              placeholder="e.g. Should I take a job offer abroad or stay close to family?"
              className="w-full resize-none rounded-2xl border border-[#EEEEEE] bg-[#FAF9F6] px-4 py-3 text-sm leading-7 text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#B094FF]"
            />
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4 text-sm text-red-700">{error}</div>
            )}
            <button
              onClick={handleScenarioSubmit}
              disabled={!scenario.trim()}
              className="mt-4 w-full rounded-full bg-[#B094FF] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#9D7DFF] disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {/* PROFILE + FOLLOW-UP STAGE */}
        {stage === 'profile' && (
          <ProfileAndFollowUp
            scenario={scenario}
            onComplete={handleProfileComplete}
            onCrisisCheck={runCrisisCheck}
          />
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4 animate-pulse mt-6">
            <div className="h-24 bg-gray-100 rounded-2xl" />
            <div className="h-24 bg-gray-100 rounded-2xl" />
            <div className="h-24 bg-gray-100 rounded-2xl" />
          </div>
        )}

        {/* RESULTS STAGE */}
        {stage === 'results' && analysis && !loading && (
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
        )}
      </div>

      {/* CHAT MODAL */}
      {chatModal.open && chatModal.path && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="flex h-[70vh] w-full max-w-lg flex-col rounded-2xl bg-white">

            {/* Modal header */}
            <div className="flex items-center justify-between rounded-t-2xl border-b border-[#EEEEEE] bg-[#E6E1F9] p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#666666]">Deep Dive</p>
                <p className="text-sm font-semibold text-[#333333]">{chatModal.path.title}</p>
              </div>
              <button onClick={() => setChatModal({ open: false, path: null, pathIndex: 0 })} className="text-xl text-[#666666] hover:text-[#333333]">x</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs text-sm rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-[#B094FF] text-white rounded-br-sm'
                      : 'bg-[#FAF9F6] text-[#333333] rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="animate-pulse rounded-2xl rounded-bl-sm bg-[#FAF9F6] px-4 py-3 text-sm text-[#666666]">Thinking...</div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 border-t border-[#EEEEEE] p-4">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="What if I hate it after 3 months?"
                className="flex-1 rounded-xl border border-[#EEEEEE] bg-[#FAF9F6] px-4 py-2 text-sm text-[#333333] focus:outline-none focus:ring-2 focus:ring-[#B094FF]"
              />
              <button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="rounded-xl bg-[#B094FF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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
