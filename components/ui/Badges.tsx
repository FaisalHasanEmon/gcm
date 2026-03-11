import type { Severity, Confidence } from '@/lib/types';

export function ConfidenceBadge({ value }: { value: Confidence }) {
  return <span className={`badge ${value}`}>{value.charAt(0).toUpperCase() + value.slice(1)}</span>;
}

export function SeverityBadge({ value }: { value: Severity }) {
  const colors: Record<Severity, { bg: string; color: string }> = {
    critical: { bg: '#fee2e2', color: '#991b1b' },
    high:     { bg: '#ffedd5', color: '#9a3412' },
    medium:   { bg: '#fef3c7', color: '#92400e' },
    low:      { bg: '#dbeafe', color: '#1e40af' },
  };
  const c = colors[value];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 7px', borderRadius: '4px',
      fontSize: '11px', fontWeight: 600,
      background: c.bg, color: c.color, letterSpacing: '.02em',
    }}>
      <SevDot value={value} size={6} />
      {value.charAt(0).toUpperCase() + value.slice(1)}
    </span>
  );
}

export function SevDot({ value, size = 8 }: { value: Severity; size?: number }) {
  const COLORS: Record<Severity, string> = {
    critical: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#3B82F6',
  };
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: COLORS[value],
    }} />
  );
}

export function SourceChip({ name }: { name: string }) {
  return <span className="source-chip">{name}</span>;
}

export const SEV_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high:     '#F97316',
  medium:   '#F59E0B',
  low:      '#3B82F6',
  unconfirmed: '#94A3B8',
};

export const COUNTRY_FLAGS: Record<string, string> = {
  'Iran':          '🇮🇷',
  'Israel':        '🇮🇱',
  'Lebanon':       '🇱🇧',
  'Syria':         '🇸🇾',
  'Turkey':        '🇹🇷',
  'Iraq':          '🇮🇶',
  'Kuwait':        '🇰🇼',
  'United States': '🇺🇸',
  'USA':           '🇺🇸',
  'Persian Gulf':  '🌊',
  'Ukraine':       '🇺🇦',
  'Russia':        '🇷🇺',
  'Poland':        '🇵🇱',
  'Moldova':       '🇲🇩',
  'Bahrain':       '🇧🇭',
};

export function CountryFlag({ country }: { country: string }) {
  const flag = COUNTRY_FLAGS[country] ?? '🌐';
  return <span style={{ fontSize: '16px', lineHeight: 1 }}>{flag}</span>;
}

export function EventTypeIcon({ type }: { type: string }) {
  const MAP: Record<string, string> = {
    airstrike:            '✈',
    missile_launch:       '🚀',
    drone_attack:         '🛸',
    military_movement:    '⚔',
    naval_activity:       '⚓',
    official_statement:   '📢',
    warning_alert:        '⚠',
    explosion:            '💥',
    infrastructure_damage:'🏗',
    casualty_update:      '🏥',
    other:                '•',
  };
  return <span style={{ fontSize: '12px' }}>{MAP[type] ?? '•'}</span>;
}

export function DamageIcon({ asset }: { asset: string }) {
  const lower = asset.toLowerCase();
  if (lower.includes('embassy'))  return <span>🏛</span>;
  if (lower.includes('airport'))  return <span>✈</span>;
  if (lower.includes('oil') || lower.includes('refinery') || lower.includes('depot')) return <span>🛢</span>;
  if (lower.includes('power') || lower.includes('grid'))  return <span>⚡</span>;
  if (lower.includes('nuclear'))  return <span>☢</span>;
  if (lower.includes('port') || lower.includes('ship'))   return <span>🚢</span>;
  if (lower.includes('rail') || lower.includes('hub'))    return <span>🚂</span>;
  if (lower.includes('base') || lower.includes('military')) return <span>🎯</span>;
  return <span>🏗</span>;
}
