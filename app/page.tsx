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
import DecisionFlowchart from '@/components/DecisionFlowchart';

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

const PATH_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-600', text: 'text-blue-800', label: 'text-blue-700', glow: 'shadow-blue-100' },
  { bg: 'bg-violet-50', border: 'border-violet-200', badge: 'bg-violet-600', text: 'text-violet-800', label: 'text-violet-700', glow: 'shadow-violet-100' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-600', text: 'text-emerald-800', label: 'text-emerald-700', glow: 'shadow-emerald-100' },
];

const WHAT_IF_TOGGLES = [
  { id: 'market_downturn', label: 'Market Downturn', icon: '📉', description: 'Job market is struggling' },
  { id: 'high_financial_support', label: 'High Financial Support', icon: '💰', description: 'Strong financial backing available' },
  { id: 'low_energy', label: 'Low Energy Levels', icon: '😴', description: 'Limited bandwidth and motivation' },
  { id: 'fast_industry_change', label: 'Fast Industry Change', icon: '⚡', description: 'Industry evolving rapidly' },
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

  // New state: profile + follow-up answers collected before analysis,
  // and email-send status for the flowchart delivery feature.
  const [profile, setProfile] = useState<CollectedProfile | null>(null);
  const [followUpAnswers, setFollowUpAnswers] = useState<FollowUpAnswer[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'unavailable' | 'error'>('idle');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  /**
   * Runs both layers of crisis detection (keyword, client-side, then AI
   * confirmation, server-side) on a piece of free text. Returns true if
   * the text was flagged, in which case the caller should stop whatever
   * it was doing and let this function's side effect (switching to the
   * 'crisis' stage) take over. This must run BEFORE any scenario is
   * sent to /api/analyze, and before any follow-up answer is accepted.
   */
  const runCrisisCheck = async (text: string): Promise<boolean> => {
    const keywordResult = checkForCrisisKeywords(text);

    try {
      const res = await fetch('/api/crisis-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          keywordFlagged: keywordResult.flagged,
          matchedPattern: keywordResult.matchedPattern,
          userIdentifier: profile?.email ?? 'anonymous',
          profileId: profileId ?? undefined,
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

    const flagged = await runCrisisCheck(scenario);
    if (flagged) return;

    setStage('profile');
  };

  /**
   * Step 2 callback: profile + follow-up answers collected. Now run
   * the actual analysis.
   */
  const handleProfileComplete = async (collectedProfile: CollectedProfile, answers: FollowUpAnswer[]) => {
    setProfile(collectedProfile);
    setFollowUpAnswers(answers);
    saveLocalProfile(collectedProfile);
    await analyze(collectedProfile, answers);
  };

  const analyze = async (collectedProfile?: CollectedProfile, answers?: FollowUpAnswer[]) => {
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
          followUpAnswers: answers ?? [],
          personalizationContext,
          profileId,
        }),
      });
      const data = await res.json();
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
          scenario: `Given these active conditions: ${conditions}. For this original scenario: "${scenario}". Rewrite only the risks and longTerm for each of these paths: ${analysis.paths.map(p => p.title).join(', ')}. Return ONLY a JSON object like: {"Path A: title": {"risks": "...", "longTerm": "..."}, "Path B: title": {...}}. Use the exact path titles as keys.`
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
          scenario: `For someone who chose "${path.title}" (${path.choice}) in this scenario: "${scenario}". Describe specifically what their life looks like at the ${year} mark. What compounded effects have occurred? What decisions are they now facing? Be concrete and vivid. Return as JSON with a single "text" field.`
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
    const flagged = await runCrisisCheck(userMsg);
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
          scenario: `You are a life advisor. Context: The user chose "${chatModal.path.title}" for their scenario: "${scenario}". Path details: ${chatModal.path.choice}. Short term: ${chatModal.path.shortTerm}. Long term: ${chatModal.path.longTerm}. The user asks: "${userMsg}". Give a thoughtful, specific response. Return as JSON with a single "answer" field containing your response as plain text.`
        }),
      });
      const data = await res.json();
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
    setFollowUpAnswers([]);
  };

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Life Decision Simulator</h1>
            <p className="text-sm text-gray-500 mt-1">Simulate your choices before you make them.</p>
          </div>
          <Link href="/history" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 whitespace-nowrap">
            View history →
          </Link>
        </div>

        {/* CRISIS STAGE — fully replaces all simulation/decision UI.
            No paths, toggles, timelines, or chat are rendered here. */}
        {stage === 'crisis' && <CrisisSupport onBack={resetToStart} />}

        {/* INPUT STAGE */}
        {stage === 'input' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">
              Describe your decision
            </label>
            <textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              rows={4}
              placeholder="e.g. Should I take a job offer abroad or stay close to family?"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4 text-sm text-red-700">{error}</div>
            )}
            <button
              onClick={handleScenarioSubmit}
              disabled={!scenario.trim()}
              className="mt-4 w-full bg-indigo-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
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
            onCrisisDetected={() => setStage('crisis')}
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
          <div className="space-y-6">

            {/* Summary */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">Summary</p>
              <p className="text-sm text-indigo-900">{analysis.summary}</p>
            </div>

            {/* WHAT-IF TOGGLES */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">What-If Scenario Toggles</p>
              <p className="text-xs text-gray-400 mb-4">Toggle conditions to see how they change each path's risks and outcomes</p>
              <div className="grid grid-cols-2 gap-3">
                {WHAT_IF_TOGGLES.map((toggle) => {
                  const active = activeToggles.includes(toggle.id);
                  return (
                    <button
                      key={toggle.id}
                      onClick={() => toggleWhatIf(toggle.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition ${
                        active
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-lg">{toggle.icon}</span>
                      <div>
                        <p className="text-xs font-semibold">{toggle.label}</p>
                        <p className="text-xs opacity-60">{toggle.description}</p>
                      </div>
                      <div className={`ml-auto w-4 h-4 rounded-full border-2 flex items-center justify-center ${active ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'}`}>
                        {active && <span className="text-white text-xs">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {whatIfLoading && <p className="text-xs text-indigo-500 mt-3 animate-pulse">Recalculating outcomes...</p>}
            </div>

            {/* TRADEOFF MATRIX */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Tradeoff & Opportunity Cost Matrix</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <td className="pb-3 text-xs text-gray-400 font-semibold w-32">Path</td>
                      <td className="pb-3 text-xs text-orange-500 font-semibold">What you sacrifice</td>
                      <td className="pb-3 text-xs text-green-600 font-semibold">What you gain</td>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {analysis.paths.map((path, i) => {
                      const color = PATH_COLORS[i % PATH_COLORS.length];
                      return (
                        <tr key={i} className="align-top">
                          <td className="py-3 pr-3">
                            <span className={`${color.badge} text-white text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap`}>
                              {path.title.split(':')[0]}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-orange-700 text-xs leading-relaxed">
                            {path.opportunityCost || `Forgoing the benefits of the other paths`}
                          </td>
                          <td className="py-3 text-green-700 text-xs leading-relaxed">
                            {path.bestFor}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* DECISION FLOWCHART */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Decision Flowchart</p>
                {profile?.email && (
                  <button
                    onClick={sendPlanByEmail}
                    disabled={emailStatus === 'sending'}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition disabled:opacity-50"
                  >
                    {emailStatus === 'sending' ? 'Sending...' : '✉️ Email me this plan'}
                  </button>
                )}
              </div>
              <div id="decision-flowchart-svg">
                <DecisionFlowchart
                  scenario={scenario}
                  paths={analysis.paths.map(p => ({ title: p.title, bestFor: p.bestFor }))}
                  recommendedTitle={
                    // Find whichever path is actually named inside the
                    // recommendation text, rather than assuming paths[0]
                    // is the recommended one — falls back to paths[0]
                    // only if no title match is found.
                    analysis.paths.find(p => analysis.recommendation.includes(p.title.split(':')[0].trim()))?.title
                      ?? analysis.paths[0]?.title
                      ?? ''
                  }
                />
              </div>
              {emailStatus === 'sent' && (
                <p className="text-xs text-emerald-600 mt-2">Sent! Check your inbox at {profile?.email}.</p>
              )}
              {emailStatus === 'unavailable' && (
                <p className="text-xs text-gray-400 mt-2">Email delivery isn't set up yet — ask your team to add a Resend API key.</p>
              )}
              {emailStatus === 'error' && (
                <p className="text-xs text-red-500 mt-2">Couldn't send the email. Please try again later.</p>
              )}
            </div>

            {/* FUTURE PATHS */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Simulated Future Paths</p>
              <div className="space-y-5">
                {analysis.paths.map((path, i) => {
                  const color = PATH_COLORS[i % PATH_COLORS.length];
                  const whatIf = whatIfResults[path.title];
                  return (
                    <div key={i} className={`${color.bg} border ${color.border} rounded-2xl p-5 shadow-sm ${color.glow}`}>

                      {/* Path header */}
                      <div className="flex items-center justify-between mb-4">
                        <span className={`${color.badge} text-white text-xs font-bold px-3 py-1 rounded-full`}>{path.title}</span>
                        <button
                          onClick={() => openChat(path, i)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${color.border} ${color.label} hover:opacity-80 transition`}
                        >
                          💬 Ask AI →
                        </button>
                      </div>

                      <p className={`text-sm font-medium ${color.text} mb-4`}>{path.choice}</p>

                      {/* Path details */}
                      <div className="grid grid-cols-1 gap-2 text-sm mb-4">
                        <div>
                          <span className={`font-semibold ${color.label}`}>Short term: </span>
                          <span className="text-gray-700">{path.shortTerm}</span>
                        </div>
                        <div>
                          <span className={`font-semibold ${color.label}`}>Long term: </span>
                          <span className="text-gray-700">
                            {whatIf ? (
                              <span className="text-amber-700">{whatIf.longTerm} <span className="text-xs bg-amber-100 px-1 rounded">updated</span></span>
                            ) : path.longTerm}
                          </span>
                        </div>
                        <div>
                          <span className={`font-semibold ${color.label}`}>Risks: </span>
                          <span className="text-gray-700">
                            {whatIf ? (
                              <span className="text-amber-700">{whatIf.risks} <span className="text-xs bg-amber-100 px-1 rounded">updated</span></span>
                            ) : path.risks}
                          </span>
                        </div>
                        <div>
                          <span className={`font-semibold ${color.label}`}>Best for: </span>
                          <span className="text-gray-700">{path.bestFor}</span>
                        </div>
                      </div>

                      {/* BLINDSPOT ALERT */}
                      {path.blindspot && (
                        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-3 mb-4 flex gap-2">
                          <span className="text-lg">⚠️</span>
                          <div>
                            <p className="text-xs font-bold text-yellow-700 mb-0.5">Blindspot Alert</p>
                            <p className="text-xs text-yellow-800">{path.blindspot}</p>
                          </div>
                        </div>
                      )}

                      {/* VISUAL TIMELINE */}
                      <div className="mt-3">
                        <p className={`text-xs font-semibold ${color.label} mb-2`}>Click a milestone to explore:</p>
                        <div className="flex items-center gap-1">
                          {['1 year', '3 years', '5 years'].map((year, yi) => {
                            const isActive = activeTimeline?.pathIndex === i && activeTimeline?.year === year;
                            return (
                              <div key={year} className="flex items-center gap-1 flex-1">
                                <button
                                  onClick={() => exploreTimeline(i, year, path)}
                                  className={`flex-1 text-xs py-2 px-2 rounded-lg border font-semibold transition ${
                                    isActive
                                      ? `${color.badge} text-white border-transparent`
                                      : `bg-white ${color.border} ${color.label} hover:opacity-80`
                                  }`}
                                >
                                  {year}
                                </button>
                                {yi < 2 && <div className={`h-px flex-1 max-w-4 ${color.border} border-t`} />}
                              </div>
                            );
                          })}
                        </div>
                        {activeTimeline?.pathIndex === i && (
                          <div className={`mt-3 p-3 bg-white border ${color.border} rounded-xl text-xs text-gray-700`}>
                            {timelineLoading && !timelineData[`${i}-${activeTimeline.year}`]
                              ? <span className="animate-pulse text-gray-400">Loading timeline...</span>
                              : timelineData[`${i}-${activeTimeline.year}`] || (
                                  activeTimeline.year === '1 year' ? path.shortTerm :
                                  activeTimeline.year === '3 years' ? (path.threeYear || path.longTerm) :
                                  (path.fiveYear || path.longTerm)
                                )
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recommendation */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-2">Recommendation</p>
              <p className="text-sm text-amber-900">{analysis.recommendation}</p>
            </div>

            {/* Decision Impact */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded-2xl p-5 bg-white">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Before deciding</p>
                <p className="text-sm text-gray-600">Facing uncertainty between paths, weighing short-term vs long-term tradeoffs without a clear framework.</p>
              </div>
              <div className="border border-blue-200 rounded-2xl p-5 bg-blue-50">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-2">After this simulation</p>
                <p className="text-sm text-blue-900">You now have a structured view of 3 paths, their risks, hidden tradeoffs, and what each looks like in 1–5 years.</p>
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-gray-400 text-center pb-6">
              ⚠️ This simulation is for reflection only — the final decision is always yours.
            </p>

          </div>
        )}
      </div>

      {/* CHAT MODAL */}
      {chatModal.open && chatModal.path && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col" style={{ height: '70vh' }}>

            {/* Modal header */}
            <div className={`p-4 border-b border-gray-100 flex items-center justify-between ${PATH_COLORS[chatModal.pathIndex % PATH_COLORS.length].bg} rounded-t-2xl`}>
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">Deep Dive</p>
                <p className="text-sm font-bold text-gray-800">{chatModal.path.title}</p>
              </div>
              <button onClick={() => setChatModal({ open: false, path: null, pathIndex: 0 })} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs text-sm rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-400 animate-pulse">Thinking...</div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="What if I hate it after 3 months?"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
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
