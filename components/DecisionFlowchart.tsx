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

const NODE_X = [90, 330, 570];
const NODE_Y = 164;
const NODE_WIDTH = 184;
const NODE_HEIGHT = 82;

function trimLabel(text: string, limit: number) {
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

export default function DecisionFlowchart({ scenario, paths, recommendedTitle }: DecisionFlowchartProps) {
  const scenarioLabel = trimLabel(scenario, 64);

  return (
    <svg
      viewBox="0 0 760 390"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Warm flowchart of decision paths and recommendation"
      className="w-full"
    >
      <title>Decision flowchart</title>
      <desc>A branching flowchart showing a scenario, three possible paths, and the suggested starting point.</desc>

      <defs>
        <marker id="soft-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
          <path d="M 0 0 L 8 4 L 0 8 z" className="fill-[#B094FF]" />
        </marker>
      </defs>

      <rect x="240" y="24" width="280" height="68" rx="18" className="fill-[#FAF9F6] stroke-[#EEEEEE]" />
      <text x="380" y="50" textAnchor="middle" className="fill-[#666666] text-[11px] font-semibold uppercase tracking-wide">
        Your scenario
      </text>
      <text x="380" y="72" textAnchor="middle" className="fill-[#333333] text-[12px]">
        {scenarioLabel}
      </text>

      {paths.map((path, index) => {
        const x = NODE_X[index] ?? NODE_X[0];
        const centerX = x + NODE_WIDTH / 2;
        const isRecommended = path.title === recommendedTitle;
        const curve = `M 380 92 C 380 124, ${centerX} 122, ${centerX} ${NODE_Y - 8}`;

        return (
          <g key={path.title} className={isRecommended ? 'opacity-100' : 'opacity-55'}>
            <path
              d={curve}
              className={isRecommended ? 'fill-none stroke-[#B094FF]' : 'fill-none stroke-[#D8D0C8]'}
              strokeDasharray="7 7"
              strokeWidth={isRecommended ? '2.5' : '1.5'}
              markerEnd={isRecommended ? 'url(#soft-arrow)' : undefined}
            />
            <rect
              x={x}
              y={NODE_Y}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx="18"
              className={isRecommended ? 'fill-[#E6E1F9] stroke-[#B094FF]' : 'fill-white stroke-[#EEEEEE]'}
              strokeWidth={isRecommended ? '2' : '1'}
            />
            <text x={centerX} y={NODE_Y + 28} textAnchor="middle" className="fill-[#333333] text-[12px] font-semibold">
              {trimLabel(path.title, 26)}
            </text>
            <text x={centerX} y={NODE_Y + 49} textAnchor="middle" className="fill-[#666666] text-[10px]">
              {trimLabel(path.bestFor, 36)}
            </text>
            {isRecommended && (
              <text x={centerX} y={NODE_Y + 68} textAnchor="middle" className="fill-[#333333] text-[10px] font-bold">
                Human review recommended
              </text>
            )}
          </g>
        );
      })}

      <path
        d="M 380 246 C 382 272, 382 284, 380 306"
        className="fill-none stroke-[#99BC8C]"
        strokeDasharray="7 7"
        strokeWidth="2.5"
        markerEnd="url(#soft-arrow)"
      />
      <rect x="220" y="306" width="320" height="56" rx="18" className="fill-[#E7F1E3] stroke-[#99BC8C]" />
      <text x="380" y="329" textAnchor="middle" className="fill-[#333333] text-[11px] font-semibold uppercase tracking-wide">
        Suggested starting point
      </text>
      <text x="380" y="348" textAnchor="middle" className="fill-[#333333] text-[11px]">
        {trimLabel(recommendedTitle, 48)}
      </text>
    </svg>
  );
}
