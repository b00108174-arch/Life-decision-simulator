// components/DecisionFlowchart.tsx
//
// Renders a visual flowchart of the scenario -> paths -> recommendation,
// matching the existing PATH_COLORS scheme from app/page.tsx so it feels
// native to the rest of the UI. This SVG is also what gets attached to
// the outbound email (see app/api/send-email/route.ts), so keep it
// self-contained (no external assets) and reasonably sized.

'use client';

interface FlowchartPath {
  title: string;
  bestFor: string;
}

interface DecisionFlowchartProps {
  scenario: string;
  paths: FlowchartPath[];
  recommendedTitle: string;
}

// Mirrors PATH_COLORS hex values from app/page.tsx so the flowchart
// visually matches the path cards above it.
const FLOW_COLORS = [
  { fill: '#EFF6FF', stroke: '#93C5FD', text: '#1E40AF' }, // blue
  { fill: '#F5F3FF', stroke: '#C4B5FD', text: '#5B21B6' }, // violet
  { fill: '#ECFDF5', stroke: '#6EE7B7', text: '#065F46' }, // emerald
];

export default function DecisionFlowchart({ scenario, paths, recommendedTitle }: DecisionFlowchartProps) {
  const width = 700;
  const nodeWidth = 200;
  const nodeHeight = 70;
  const topY = 30;
  const pathsY = 160;
  const gap = 30;
  const totalPathsWidth = paths.length * nodeWidth + (paths.length - 1) * gap;
  const startX = (width - totalPathsWidth) / 2;
  const recY = 290;

  const scenarioLabel = scenario.length > 60 ? scenario.slice(0, 57) + '...' : scenario;

  return (
    <svg
      viewBox={`0 0 ${width} 380`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Flowchart of decision paths and recommendation"
      className="w-full"
    >
      <title>Decision flowchart</title>
      <desc>A flowchart showing the scenario branching into possible paths, with the recommended path highlighted.</desc>

      {/* Scenario node */}
      <rect x={width / 2 - nodeWidth / 2} y={topY} width={nodeWidth} height={50} rx={12} fill="#F9FAFB" stroke="#D1D5DB" />
      <text x={width / 2} y={topY + 22} textAnchor="middle" fontSize="11" fontWeight="600" fill="#6B7280">
        YOUR SCENARIO
      </text>
      <text x={width / 2} y={topY + 38} textAnchor="middle" fontSize="11" fill="#374151">
        {scenarioLabel}
      </text>

      {/* Connector from scenario down to paths */}
      <line x1={width / 2} y1={topY + 50} x2={width / 2} y2={pathsY - 15} stroke="#D1D5DB" strokeWidth={1.5} />

      {paths.map((path, i) => {
        const x = startX + i * (nodeWidth + gap);
        const color = FLOW_COLORS[i % FLOW_COLORS.length];
        const isRecommended = path.title === recommendedTitle;
        const centerX = x + nodeWidth / 2;
        const label = path.title.length > 26 ? path.title.slice(0, 24) + '...' : path.title;
        const bestForLabel = path.bestFor.length > 40 ? path.bestFor.slice(0, 38) + '...' : path.bestFor;

        return (
          <g key={path.title}>
            {/* Branch connector from scenario to this path */}
            <line x1={width / 2} y1={pathsY - 15} x2={centerX} y2={pathsY} stroke="#D1D5DB" strokeWidth={1.5} />

            <rect
              x={x}
              y={pathsY}
              width={nodeWidth}
              height={nodeHeight}
              rx={12}
              fill={color.fill}
              stroke={isRecommended ? color.stroke : color.stroke}
              strokeWidth={isRecommended ? 2.5 : 1}
            />
            <text x={centerX} y={pathsY + 26} textAnchor="middle" fontSize="11" fontWeight="600" fill={color.text}>
              {label}
            </text>
            <text x={centerX} y={pathsY + 44} textAnchor="middle" fontSize="9.5" fill={color.text} opacity={0.85}>
              {bestForLabel}
            </text>
            {isRecommended && (
              <text x={centerX} y={pathsY + 60} textAnchor="middle" fontSize="9" fontWeight="700" fill={color.text}>
                ★ RECOMMENDED
              </text>
            )}

            {/* Connector from recommended path down to final recommendation node */}
            {isRecommended && (
              <line x1={centerX} y1={pathsY + nodeHeight} x2={width / 2} y2={recY - 5} stroke={color.stroke} strokeWidth={2} strokeDasharray="4 3" />
            )}
          </g>
        );
      })}

      {/* Recommendation node */}
      <rect x={width / 2 - 160} y={recY} width={320} height={50} rx={12} fill="#FFFBEB" stroke="#FCD34D" />
      <text x={width / 2} y={recY + 22} textAnchor="middle" fontSize="11" fontWeight="700" fill="#92400E">
        SUGGESTED STARTING POINT
      </text>
      <text x={width / 2} y={recY + 38} textAnchor="middle" fontSize="10.5" fill="#92400E">
        {recommendedTitle.length > 50 ? recommendedTitle.slice(0, 47) + '...' : recommendedTitle}
      </text>
    </svg>
  );
}
