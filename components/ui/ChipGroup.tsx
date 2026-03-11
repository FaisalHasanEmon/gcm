'use client';

interface Chip { label: string; value: string; }

interface ChipGroupProps {
  chips:    Chip[];
  active:   string;
  onChange: (v: string) => void;
}

export default function ChipGroup({ chips, active, onChange }: ChipGroupProps) {
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {chips.map(c => (
        <button
          key={c.value}
          onClick={() => onChange(c.value)}
          className={`chip ${active === c.value ? 'active' : ''}`}
        >{c.label}</button>
      ))}
    </div>
  );
}

export const RANGE_CHIPS = [
  { label: '6h',  value: '6h'  },
  { label: '24h', value: '24h' },
  { label: '72h', value: '72h' },
  { label: '96h', value: '96h' },
  { label: '7d',  value: '7d'  },
];

export const CAS_CHIPS = [
  { label: '24h', value: '24h' },
  { label: '72h', value: '72h' },
  { label: '96h', value: '96h' },
  { label: '7d',  value: '7d'  },
];
