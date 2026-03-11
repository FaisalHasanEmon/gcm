'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PageShell from '@/components/ui/PageShell';

const THEATERS = [
  { slug: 'me-iran-israel-us',  name: 'Middle East – Iran/Israel/US' },
  { slug: 'eu-ukraine-russia',  name: 'Eastern Europe – Ukraine/Russia' },
];

const EVENT_TYPES = [
  'airstrike','missile_launch','drone_attack','military_movement',
  'naval_activity','explosion','infrastructure_damage','casualty_update',
];

function SubscribePageInner() {
  const searchParams   = useSearchParams();
  const [channel,    setChannel]    = useState('email');
  const [address,    setAddress]    = useState('');
  const [theaters,   setTheaters]   = useState<string[]>(['me-iran-israel-us']);
  const [types,      setTypes]      = useState<string[]>([]);
  const [minSev,     setMinSev]     = useState('high');
  const [freq,       setFreq]       = useState('instant');
  const [submitted,  setSubmitted]  = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  // Last token used — needed to show the Telegram /start instruction
  const [lastToken,  setLastToken]  = useState('');

  // Handle redirects from /api/verify and /api/unsubscribe
  const urlVerified     = searchParams.get('verified')     === '1';
  const urlUnsubscribed = searchParams.get('unsubscribed') === '1';
  const urlError        = searchParams.get('error');

  const toggleSet = <T,>(set: T[], item: T, setter: (v: T[]) => void) => {
    setter(set.includes(item) ? set.filter(x => x !== item) : [...set, item]);
  };

  const handleSubmit = async () => {
    if (!address.trim()) { setError('Address is required.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, address: address.trim(), theaters, event_types: types.length ? types : undefined, min_severity: minSev, frequency: freq }),
      });
      if (res.ok) {
        const json = await res.json();
        // Extract token from Telegram instruction for display
        if (channel === 'telegram') {
          const m = (json.message as string)?.match(/\/start\s+([a-f0-9]+)/i);
          if (m) setLastToken(m[1]);
        }
        setSubmitted(true);
      }
      else { const j = await res.json(); setError(j.error ?? 'Something went wrong.'); }
    } catch { setError('Network error. Try again.'); }
    finally { setLoading(false); }
  };

  // ── Post-action feedback states ──────────────────────────────────────────────

  if (urlUnsubscribed) return (
    <PageShell>
      <div className="card" style={{ maxWidth: '480px', margin: '40px auto', textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>👋</div>
        <h2 style={{ fontWeight: 700, fontSize: '20px', marginBottom: '8px' }}>Unsubscribed</h2>
        <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6 }}>
          You have been successfully removed from GCM alerts. You won't receive any further notifications.
        </p>
      </div>
    </PageShell>
  );

  if (urlVerified) return (
    <PageShell>
      <div className="card" style={{ maxWidth: '480px', margin: '40px auto', textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>✅</div>
        <h2 style={{ fontWeight: 700, fontSize: '20px', marginBottom: '8px' }}>Subscription confirmed</h2>
        <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6 }}>
          Your email address is verified. You'll start receiving alerts for confirmed and likely events matching your preferences.
        </p>
      </div>
    </PageShell>
  );

  if (urlError) return (
    <PageShell>
      <div className="card" style={{ maxWidth: '480px', margin: '40px auto', textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>❌</div>
        <h2 style={{ fontWeight: 700, fontSize: '20px', marginBottom: '8px' }}>Verification failed</h2>
        <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6 }}>
          {urlError === 'expired'
            ? 'Your verification link has expired. Please subscribe again to receive a new link.'
            : urlError === 'invalid_token'
            ? 'This verification link is invalid or has already been used.'
            : 'Something went wrong. Please try subscribing again.'}
        </p>
      </div>
    </PageShell>
  );

  if (submitted) return (
    <PageShell>
      <div className="card" style={{ maxWidth: '480px', margin: '40px auto', textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>✅</div>
        <h2 style={{ fontWeight: 700, fontSize: '20px', marginBottom: '8px' }}>Subscription registered</h2>
        {channel === 'telegram' ? (
          <div style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6 }}>
            <p style={{ marginBottom: '12px' }}>Open Telegram and start a chat with the GCM bot, then send:</p>
            <code style={{ display: 'block', background: '#f1f5f9', borderRadius: '6px', padding: '10px 14px', fontSize: '13px', wordBreak: 'break-all' }}>
              /start {lastToken || '<your token>'}
            </code>
            <p style={{ marginTop: '12px' }}>The token expires in 24 hours.</p>
          </div>
        ) : (
          <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6 }}>
            Check your inbox for a verification link.
            You'll only receive alerts for confirmed and likely events meeting your severity threshold.
          </p>
        )}
      </div>
    </PageShell>
  );

  return (
    <PageShell>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ color: '#f8fafc', fontWeight: 800, fontSize: '22px', marginBottom: '4px' }}>Subscribe to Alerts</h1>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '13px' }}>
            Receive instant, hourly, or daily alerts for confirmed + likely events.
          </p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Channel */}
          <div>
            <FieldLabel>Channel</FieldLabel>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['email','telegram'].map(c => (
                <button key={c} onClick={() => setChannel(c)}
                  className={`chip ${channel === c ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center', padding: '8px' }}>
                  {c === 'email' ? '📧 Email' : '✈ Telegram'}
                </button>
              ))}
            </div>
          </div>

          {/* Address */}
          <div>
            <FieldLabel>{channel === 'email' ? 'Email Address' : 'Telegram Chat ID'}</FieldLabel>
            <input
              type={channel === 'email' ? 'email' : 'text'}
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder={channel === 'email' ? 'you@example.com' : '@yourusername'}
              style={{
                width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
                borderRadius: '8px', fontSize: '14px', fontFamily: 'var(--font-sans)',
              }}
            />
          </div>

          {/* Theaters */}
          <div>
            <FieldLabel>Theaters (select all that apply)</FieldLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {THEATERS.map(t => (
                <label key={t.slug} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={theaters.includes(t.slug)}
                    onChange={() => toggleSet(theaters, t.slug, setTheaters)} />
                  <span style={{ fontSize: '13.5px', color: '#334155' }}>{t.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Min severity */}
          <div>
            <FieldLabel>Minimum Severity</FieldLabel>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['critical','high','medium','low'].map(s => (
                <button key={s} onClick={() => setMinSev(s)}
                  className={`chip ${minSev === s ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center', textTransform: 'capitalize' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Frequency */}
          <div>
            <FieldLabel>Alert Frequency</FieldLabel>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['instant','hourly','daily'].map(f => (
                <button key={f} onClick={() => setFreq(f)}
                  className={`chip ${freq === f ? 'active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center', textTransform: 'capitalize' }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: '7px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              background: loading ? '#94a3b8' : '#3b82f6',
              color: '#fff', border: 'none', borderRadius: '8px',
              padding: '12px', fontSize: '14px', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)', transition: 'background .15s',
            }}>
            {loading ? 'Subscribing…' : 'Subscribe'}
          </button>

          <p style={{ fontSize: '11.5px', color: '#94a3b8', textAlign: 'center' }}>
            Only confirmed and likely events will be dispatched. You can unsubscribe at any time.
          </p>
        </div>
      </div>
    </PageShell>
  );
}

export default function SubscribePage() {
  return (
    <Suspense fallback={<PageShell><div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center' }}>Loading…</div></PageShell>}>
      <SubscribePageInner />
    </Suspense>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '8px' }}>{children}</div>;
}
