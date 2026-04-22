/**
 * Animated illustration of a CMC CartonWrap CW1000 line for the login page.
 *
 * Pure SVG + CSS keyframes, no external assets. Stylised but visually
 * detailed enough to evoke a real industrial packaging line:
 *   – metallic gantries with vents and bolts
 *   – orange cardboard boxes gliding over a dark conveyor
 *   – laser scanner fan at the ENQ station
 *   – violet 3D measurement volume at the ACK station
 *   – labelled packages emerging from the LAB printer
 *   – ambient soft lights + grid floor for depth
 */
export default function CartonWrapAnimation() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(120% 80% at 30% 0%, #1e293b 0%, #0b1220 55%, #05080f 100%)',
      }}
    >
      {/* Ambient floor glow */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3"
        style={{
          background:
            'radial-gradient(60% 80% at 50% 100%, rgba(99,102,241,0.18), transparent 60%)',
        }}
      />

      {/* Subtle noise / scanlines overlay */}
      <div
        className="absolute inset-0 opacity-[0.07] mix-blend-screen pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 3px)',
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center p-8 lg:p-16">
        <svg
          viewBox="0 0 960 720"
          className="w-full h-full max-w-[980px]"
          role="img"
          aria-label="CartonWrap CW1000 conveyor animation"
        >
          <defs>
            {/* Floor perspective grid */}
            <pattern id="floorGrid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path
                d="M 48 0 L 0 0 0 48"
                fill="none"
                stroke="rgba(99,102,241,0.08)"
                strokeWidth="1"
              />
            </pattern>

            {/* Conveyor metal */}
            <linearGradient id="conveyorBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="50%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#020617" />
            </linearGradient>
            <linearGradient id="conveyorTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#475569" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>

            {/* Gantry steel */}
            <linearGradient id="gantry" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="45%" stopColor="#94a3b8" />
              <stop offset="55%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>
            <linearGradient id="gantrySide" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="50%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>

            {/* Carton brown */}
            <linearGradient id="carton" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="55%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#92400e" />
            </linearGradient>
            <linearGradient id="cartonTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>

            {/* Scanner beam */}
            <radialGradient id="scanBeam" cx="50%" cy="0%" r="100%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </radialGradient>

            {/* 3D measurement cone */}
            <radialGradient id="measureBeam" cx="50%" cy="0%" r="100%">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
            </radialGradient>

            {/* Label paper glow */}
            <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fafafa" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>

            {/* Soft drop shadow */}
            <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="160%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
              <feOffset dy="8" result="offsetblur" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.35" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* LED glow */}
            <filter id="ledGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Floor grid with perspective (simulated via transform) */}
          <g transform="matrix(1,0,0,0.55,0,390)" opacity="0.7">
            <rect width="960" height="560" fill="url(#floorGrid)" />
          </g>

          {/* Conveyor belt — main horizontal platform */}
          <g filter="url(#dropShadow)">
            {/* Base */}
            <rect x="40" y="470" width="880" height="48" rx="8" fill="url(#conveyorBody)" />
            {/* Top surface */}
            <rect x="40" y="464" width="880" height="14" rx="3" fill="url(#conveyorTop)" />
            {/* Side stripe */}
            <rect x="40" y="510" width="880" height="4" rx="2" fill="rgba(99,102,241,0.3)" />
            {/* Side vents */}
            {Array.from({ length: 20 }).map((_, i) => (
              <rect
                key={i}
                x={60 + i * 44}
                y={490}
                width={26}
                height={12}
                rx={2}
                fill="rgba(0,0,0,0.55)"
              />
            ))}
            {/* Rollers on top surface */}
            {Array.from({ length: 30 }).map((_, i) => (
              <circle
                key={i}
                cx={52 + i * 30}
                cy={471}
                r={3}
                fill="#0f172a"
                stroke="#1e293b"
              />
            ))}
          </g>

          {/* Moving belt highlight */}
          <g className="cw-belt">
            {Array.from({ length: 36 }).map((_, i) => (
              <rect
                key={i}
                x={40 + i * 26}
                y={476}
                width={12}
                height={2}
                fill="rgba(255,255,255,0.25)"
                rx={1}
              />
            ))}
          </g>

          {/* ────── 5 Stations ────── */}
          {[
            { x: 130, type: 'scanner' },
            { x: 300, type: 'induct' },
            { x: 470, type: 'sensor' },
            { x: 640, type: 'labeler' },
            { x: 810, type: 'exit' },
          ].map((s, idx) => (
            <g key={idx} style={{ transform: `translateX(${s.x - 80}px)` }} filter="url(#dropShadow)">
              {/* Vertical left pillar */}
              <rect x="0" y="210" width="18" height="260" rx="2" fill="url(#gantrySide)" />
              {/* Vertical right pillar */}
              <rect x="142" y="210" width="18" height="260" rx="2" fill="url(#gantrySide)" />
              {/* Top crossbar */}
              <rect x="0" y="210" width="160" height="28" rx="4" fill="url(#gantry)" />
              {/* Crossbar highlight */}
              <rect x="2" y="212" width="156" height="3" fill="rgba(255,255,255,0.35)" />
              {/* Brand plate */}
              <rect x="58" y="220" width="44" height="10" rx="2" fill="#020617" />
              <rect x="60" y="222" width="40" height="2" fill="rgba(255,255,255,0.1)" />
              {/* Bolts */}
              {[6, 152].map((bx, bi) =>
                [216, 225, 460].map((by, byi) => (
                  <circle
                    key={`${bi}-${byi}`}
                    cx={bx}
                    cy={by}
                    r={1.8}
                    fill="#cbd5e1"
                    stroke="#1e293b"
                    strokeWidth="0.5"
                  />
                )),
              )}
              {/* Status LED */}
              <circle
                cx="80"
                cy="250"
                r="4"
                fill="#22c55e"
                className="cw-lamp"
                style={{ animationDelay: `${idx * 0.5}s` }}
                filter="url(#ledGlow)"
              />

              {/* Station-specific gear */}
              {s.type === 'scanner' && (
                <>
                  {/* Handheld scanner head */}
                  <rect x="58" y="260" width="44" height="26" rx="4" fill="#1e293b" stroke="#334155" />
                  <rect x="64" y="266" width="32" height="8" rx="1" fill="#0f172a" />
                  {/* Laser fan */}
                  <path
                    d="M 80 286 L 52 460 L 108 460 Z"
                    fill="url(#scanBeam)"
                    className="cw-scanBeam"
                  />
                </>
              )}

              {s.type === 'induct' && (
                <>
                  {/* Photo gate */}
                  <rect x="30" y="330" width="8" height="120" rx="1" fill="#fbbf24" />
                  <rect x="122" y="330" width="8" height="120" rx="1" fill="#fbbf24" />
                  <circle cx="34" cy="390" r="4" fill="#ef4444" className="cw-pulse" />
                  <circle cx="126" cy="390" r="4" fill="#ef4444" className="cw-pulse" />
                </>
              )}

              {s.type === 'sensor' && (
                <>
                  {/* 3D sensor camera */}
                  <rect x="55" y="260" width="50" height="30" rx="4" fill="#1e293b" stroke="#475569" />
                  <circle cx="70" cy="275" r="5" fill="#0f172a" stroke="#60a5fa" />
                  <circle cx="90" cy="275" r="5" fill="#0f172a" stroke="#60a5fa" />
                  {/* Measurement cone */}
                  <path
                    d="M 80 290 L 50 460 L 110 460 Z"
                    fill="url(#measureBeam)"
                    className="cw-measureBeam"
                  />
                  {/* Laser crosshair */}
                  <line
                    x1="80"
                    y1="290"
                    x2="80"
                    y2="460"
                    stroke="#a78bfa"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                    opacity="0.85"
                    className="cw-measureBeam"
                  />
                </>
              )}

              {s.type === 'labeler' && (
                <>
                  {/* Printer housing */}
                  <rect x="48" y="258" width="64" height="50" rx="6" fill="#1e293b" stroke="#475569" />
                  <rect x="52" y="262" width="56" height="4" fill="rgba(255,255,255,0.2)" />
                  {/* Digital display */}
                  <rect x="58" y="275" width="44" height="14" rx="2" fill="#0f172a" />
                  <rect x="60" y="278" width="40" height="2" fill="#22d3ee" opacity="0.6" />
                  <rect x="60" y="283" width="28" height="2" fill="#22d3ee" opacity="0.6" />
                  {/* Label paper feeding out */}
                  <rect
                    x="68"
                    y="308"
                    width="24"
                    height="16"
                    fill="url(#paper)"
                    className="cw-print"
                  />
                </>
              )}

              {s.type === 'exit' && (
                <>
                  {/* Exit verifier camera */}
                  <rect x="60" y="260" width="40" height="26" rx="3" fill="#1e293b" stroke="#475569" />
                  <circle cx="80" cy="273" r="6" fill="#0f172a" stroke="#22c55e" />
                  <circle cx="80" cy="273" r="2" fill="#22c55e" />
                  {/* Green sweep */}
                  <line
                    x1="80"
                    y1="286"
                    x2="80"
                    y2="460"
                    stroke="#22c55e"
                    strokeWidth="1.5"
                    opacity="0.6"
                    strokeDasharray="3 4"
                    className="cw-measureBeam"
                  />
                </>
              )}
            </g>
          ))}

          {/* ────── Packages moving on the belt ────── */}
          {[0, 3.0, 6.0, 9.0].map((delay, idx) => (
            <g
              key={idx}
              className="cw-package"
              style={{ animationDelay: `${delay}s` }}
            >
              {/* Shadow */}
              <ellipse cx="0" cy="478" rx="38" ry="5" fill="rgba(0,0,0,0.5)" />
              {/* Carton body */}
              <g filter="url(#dropShadow)">
                <rect x="-34" y="410" width="68" height="58" rx="4" fill="url(#carton)" />
                {/* Top flap */}
                <rect x="-34" y="410" width="68" height="10" fill="url(#cartonTop)" />
                {/* Seam */}
                <line x1="0" y1="410" x2="0" y2="468" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
                {/* Tape */}
                <rect x="-34" y="434" width="68" height="4" fill="rgba(255,255,255,0.25)" />
                <rect x="-34" y="436" width="68" height="1" fill="rgba(0,0,0,0.15)" />
                {/* Label on the side (after labeler) */}
                <g opacity="0.92" transform="translate(-18,442)">
                  <rect width="36" height="18" rx="1.5" fill="#f8fafc" />
                  <rect x="3" y="3" width="16" height="2" fill="#0f172a" />
                  <rect x="3" y="7" width="26" height="1" fill="#0f172a" />
                  {/* Barcode */}
                  <g transform="translate(3,10)">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <rect
                        key={i}
                        x={i * 2.2}
                        y={0}
                        width={i % 2 === 0 ? 0.8 : 1.6}
                        height={6}
                        fill="#0f172a"
                      />
                    ))}
                  </g>
                </g>
              </g>
            </g>
          ))}

          {/* Subtle lens-flare accent top-left */}
          <circle cx="120" cy="140" r="6" fill="#22d3ee" opacity="0.25" filter="url(#ledGlow)" />
          <circle cx="820" cy="110" r="5" fill="#f59e0b" opacity="0.25" filter="url(#ledGlow)" />
        </svg>
      </div>

      <style>{`
        /* Belt scroll */
        .cw-belt { animation: cw-belt-move 1.8s linear infinite; }
        @keyframes cw-belt-move {
          from { transform: translateX(0); }
          to   { transform: translateX(-26px); }
        }

        /* Packages travel the full length of the belt */
        .cw-package {
          animation: cw-package-glide 13s linear infinite;
          transform: translateX(40px);
        }
        @keyframes cw-package-glide {
          0%   { transform: translateX(20px); opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { transform: translateX(940px); opacity: 0; }
        }

        /* Station indicator LEDs */
        .cw-lamp { animation: cw-lamp 4.5s ease-in-out infinite; transform-origin: center; }
        @keyframes cw-lamp {
          0%, 100% { opacity: 1;   transform: scale(1);    fill: #22c55e; }
          50%      { opacity: 0.5; transform: scale(1.15); fill: #16a34a; }
        }

        /* Scanner laser fan sweep */
        .cw-scanBeam {
          transform-origin: 80px 286px;
          animation: cw-scan 3.2s ease-in-out infinite;
        }
        @keyframes cw-scan {
          0%, 100% { transform: rotate(-8deg); opacity: 0.55; }
          50%      { transform: rotate( 8deg); opacity: 0.95; }
        }

        /* 3D measurement pulse */
        .cw-measureBeam { animation: cw-measure 2.4s ease-in-out infinite; }
        @keyframes cw-measure {
          0%, 100% { opacity: 0.3; }
          50%      { opacity: 0.9; }
        }

        /* Label printer feed */
        .cw-print {
          transform-origin: 80px 316px;
          animation: cw-printer 3.6s ease-in-out infinite;
        }
        @keyframes cw-printer {
          0%, 55%, 100% { opacity: 0; transform: translateY(-8px) scaleY(0.3); }
          70%           { opacity: 1; transform: translateY(0)    scaleY(1); }
          90%           { opacity: 1; transform: translateY(10px) scaleY(1); }
        }

        /* Photo-eye pulse (induction station) */
        .cw-pulse { animation: cw-pulse 1.8s ease-in-out infinite; }
        @keyframes cw-pulse {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 1;  filter: drop-shadow(0 0 4px #ef4444); }
        }
      `}</style>
    </div>
  );
}
