// app/loading.tsx
// Shown by Next.js while the root page segment is streaming in.
// Mirrors the dark background of the app to avoid a white flash.

export default function Loading() {
  return (
    <div style={{
      minHeight:      '100vh',
      background:     '#0f172a',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
    }}>
      <div style={{
        display:   'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap:        '1rem',
        color:      '#475569',
        fontFamily: 'system-ui, sans-serif',
      }}>
        {/* Animated pulse ring */}
        <div style={{
          width:        '2.5rem',
          height:       '2.5rem',
          borderRadius: '50%',
          border:       '2px solid #334155',
          borderTopColor: '#3b82f6',
          animation:    'gcm-spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: '0.875rem', letterSpacing: '0.05em' }}>
          LOADING
        </span>
      </div>

      {/* Inline keyframe — no external CSS required */}
      <style>{`
        @keyframes gcm-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
