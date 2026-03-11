import Link from 'next/link';

interface Props { theater: string; }

export default function MapPreview({ theater }: Props) {
  return (
    <div style={{
      background: '#0f172a',
      borderRadius: '12px',
      overflow: 'hidden',
      position: 'relative',
      minHeight: '260px',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'flex-end',
    }}>
      {/* Stylized map background */}
      <svg viewBox="0 0 500 260" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: .35 }} preserveAspectRatio="xMidYMid slice">
        {/* Grid lines */}
        {[...Array(8)].map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 37} x2="500" y2={i * 37} stroke="#334155" strokeWidth="0.5" />
        ))}
        {[...Array(12)].map((_, i) => (
          <line key={`v${i}`} x1={i * 44} y1="0" x2={i * 44} y2="260" stroke="#334155" strokeWidth="0.5" />
        ))}
        {/* Landmass approximations (Middle East) */}
        <path d="M200,80 Q240,60 280,70 Q320,65 350,90 Q370,110 360,140 Q340,160 300,165 Q260,170 240,150 Q210,130 200,100 Z" fill="#1e3a8a" opacity="0.5" />
        <path d="M280,80 Q310,60 340,65 Q360,75 365,100 Q355,120 340,125 Q310,115 290,100 Z" fill="#1e3a8a" opacity="0.4" />
      </svg>

      {/* Event markers */}
      {[
        { x: '35%', y: '38%', sev: '#ef4444', label: 'Isfahan' },
        { x: '48%', y: '42%', sev: '#ef4444', label: 'Haifa' },
        { x: '55%', y: '55%', sev: '#f97316', label: 'Damascus' },
        { x: '42%', y: '62%', sev: '#f59e0b', label: 'Beirut' },
        { x: '62%', y: '48%', sev: '#3b82f6', label: 'Hormuz' },
        { x: '28%', y: '45%', sev: '#f97316', label: 'Baghdad' },
      ].map((m, i) => (
        <div key={i} style={{
          position: 'absolute', left: m.x, top: m.y,
          width: '12px', height: '12px',
          background: m.sev,
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,.3)',
          boxShadow: `0 0 10px ${m.sev}99`,
          transform: 'translate(-50%,-50%)',
          animation: 'pulse 2s infinite',
          animationDelay: `${i * 0.3}s`,
        }} />
      ))}

      {/* View Full Map button */}
      <div style={{ position: 'relative', padding: '16px', textAlign: 'right' }}>
        <Link href={`/map?theater=${theater}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'rgba(59,130,246,.9)', color: '#fff',
          padding: '8px 16px', borderRadius: '7px',
          fontSize: '13px', fontWeight: 600, textDecoration: 'none',
          backdropFilter: 'blur(4px)',
        }}>
          View Full Map →
        </Link>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: translate(-50%,-50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%,-50%) scale(1.4); opacity: .7; }
        }
      `}</style>
    </div>
  );
}
