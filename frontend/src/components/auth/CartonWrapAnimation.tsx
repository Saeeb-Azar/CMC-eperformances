/**
 * Animated illustration of a CMC CartonWrap CW1000 line for the login page.
 * Pure SVG + CSS keyframes — no external images or libraries.
 *
 * Layout (left → right):
 *   Scanner ▸ Induction ▸ 3D Sensor ▸ Wrapper ▸ Labeler ▸ Exit
 * Packages glide along the conveyor, blink at each station, and exit.
 */
export default function CartonWrapAnimation() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-10">
      <svg
        viewBox="0 0 600 460"
        className="w-full max-w-[520px] h-auto"
        role="img"
        aria-label="CartonWrap CW1000 conveyor animation"
      >
        {/* Subtle floor grid */}
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          </pattern>
          <linearGradient id="conveyorGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="50%" stopColor="#334155" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="boxGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="stationGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="600" height="460" fill="url(#grid)" />

        {/* Conveyor frame */}
        <rect x="30" y="280" width="540" height="36" rx="4" fill="url(#conveyorGrad)" />
        {/* Conveyor belt rollers (static) */}
        {Array.from({ length: 18 }).map((_, i) => (
          <circle key={i} cx={48 + i * 30} cy={298} r="4" fill="#0f172a" />
        ))}
        {/* Moving belt dashes */}
        <g className="cw-belt">
          {Array.from({ length: 30 }).map((_, i) => (
            <rect
              key={i}
              x={30 + i * 22}
              y={308}
              width={10}
              height={2}
              fill="rgba(255,255,255,0.2)"
              rx="1"
            />
          ))}
        </g>

        {/* Stations (from left to right) */}
        {[
          { x: 80, label: 'ENQ', sub: 'Scan' },
          { x: 180, label: 'IND', sub: 'Induct' },
          { x: 280, label: 'ACK', sub: '3D' },
          { x: 380, label: 'LAB', sub: 'Label' },
          { x: 480, label: 'END', sub: 'Exit' },
        ].map((s, i) => (
          <g key={s.label} style={{ transform: `translateX(${s.x - 40}px)` }}>
            {/* Gantry */}
            <rect x="0" y="150" width="80" height="130" rx="6" fill="url(#stationGrad)" />
            <rect x="0" y="150" width="80" height="14" rx="3" fill="#0f172a" />
            {/* Indicator lamp */}
            <circle
              cx="40"
              cy="170"
              r="5"
              fill="#22c55e"
              className="cw-lamp"
              style={{ animationDelay: `${i * 0.7}s` }}
            />
            {/* Label */}
            <text
              x="40"
              y="230"
              textAnchor="middle"
              fontSize="13"
              fontWeight="600"
              fill="#f1f5f9"
              fontFamily="monospace"
            >
              {s.label}
            </text>
            <text
              x="40"
              y="250"
              textAnchor="middle"
              fontSize="10"
              fill="#94a3b8"
            >
              {s.sub}
            </text>
          </g>
        ))}

        {/* Floating packages — each has a different start delay so they
            cascade through the line continuously. */}
        {[0, 3.6, 7.2].map((delay, idx) => (
          <g key={idx} className="cw-package" style={{ animationDelay: `${delay}s` }}>
            {/* Package shadow */}
            <ellipse cx="0" cy="286" rx="18" ry="3" fill="rgba(0,0,0,0.35)" />
            {/* Package body */}
            <g filter="url(#glow)">
              <rect x="-16" y="252" width="32" height="30" rx="3" fill="url(#boxGrad)" />
              <rect x="-16" y="252" width="32" height="4" fill="rgba(255,255,255,0.25)" />
              <line x1="0" y1="252" x2="0" y2="282" stroke="rgba(0,0,0,0.2)" strokeWidth="1" />
              {/* Tiny barcode */}
              <g transform="translate(-9,264)">
                {Array.from({ length: 7 }).map((_, i) => (
                  <rect
                    key={i}
                    x={i * 2.5}
                    y={0}
                    width={i % 2 === 0 ? 1 : 1.8}
                    height={10}
                    fill="#0f172a"
                  />
                ))}
              </g>
            </g>
          </g>
        ))}

        {/* Soft scan line sweeping at the scanner station */}
        <line
          x1="80"
          y1="260"
          x2="80"
          y2="280"
          stroke="#22d3ee"
          strokeWidth="2"
          className="cw-scan"
          opacity="0.8"
        />

        {/* Measurement rays at the 3D station */}
        <g className="cw-measure">
          <line x1="280" y1="180" x2="270" y2="272" stroke="#8b5cf6" strokeWidth="1" opacity="0.6" />
          <line x1="280" y1="180" x2="290" y2="272" stroke="#8b5cf6" strokeWidth="1" opacity="0.6" />
          <line x1="280" y1="180" x2="280" y2="272" stroke="#8b5cf6" strokeWidth="1" opacity="0.8" />
        </g>

        {/* Label printer burst */}
        <g className="cw-print">
          <rect x="370" y="195" width="20" height="14" rx="1.5" fill="#f8fafc" opacity="0.9" />
          <rect x="372" y="198" width="16" height="1" fill="#1e293b" />
          <rect x="372" y="201" width="10" height="1" fill="#1e293b" />
          <rect x="372" y="204" width="14" height="1" fill="#1e293b" />
        </g>

        {/* Running status pill (top-right) */}
        <g transform="translate(430,40)">
          <rect width="140" height="30" rx="15" fill="rgba(34,197,94,0.12)" stroke="rgba(34,197,94,0.4)" />
          <circle cx="16" cy="15" r="4" fill="#22c55e" className="cw-pulse" />
          <text x="30" y="19" fontSize="11" fill="#a7f3d0" fontFamily="monospace">
            CW1000 RUNNING
          </text>
        </g>
      </svg>

      <style>{`
        /* Belt scroll */
        .cw-belt { animation: cw-belt-move 1.6s linear infinite; }
        @keyframes cw-belt-move {
          from { transform: translateX(0); }
          to   { transform: translateX(-22px); }
        }

        /* Package glide (left to right, then reset) */
        .cw-package {
          animation: cw-package-glide 10.8s linear infinite;
          transform: translateX(-60px);
        }
        @keyframes cw-package-glide {
          0%   { transform: translateX(-40px); opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { transform: translateX(620px); opacity: 0; }
        }

        /* Station lamps pulse in sequence */
        .cw-lamp { animation: cw-lamp-blink 4s ease-in-out infinite; }
        @keyframes cw-lamp-blink {
          0%, 100% { fill: #22c55e; filter: drop-shadow(0 0 2px #22c55e); }
          50%      { fill: #16a34a; filter: drop-shadow(0 0 6px #22c55e); }
        }

        /* Scanner beam */
        .cw-scan { animation: cw-scan-move 2.4s ease-in-out infinite; }
        @keyframes cw-scan-move {
          0%, 100% { transform: translateX(-12px); opacity: 0.2; }
          50%      { transform: translateX(12px); opacity: 0.9; }
        }

        /* 3D measurement rays flicker */
        .cw-measure { animation: cw-measure-blink 2s ease-in-out infinite; }
        @keyframes cw-measure-blink {
          0%, 100% { opacity: 0.25; }
          50%      { opacity: 0.9; }
        }

        /* Label printer paper feed */
        .cw-print { animation: cw-print-feed 3s ease-in-out infinite; transform-origin: 380px 200px; }
        @keyframes cw-print-feed {
          0%, 60%, 100% { opacity: 0; transform: translateY(0); }
          70%           { opacity: 1; transform: translateY(4px); }
          90%           { opacity: 1; transform: translateY(20px); }
        }

        /* Status pill pulse */
        .cw-pulse { animation: cw-pulse-blink 1.6s ease-in-out infinite; }
        @keyframes cw-pulse-blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
