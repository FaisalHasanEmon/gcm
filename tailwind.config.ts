import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // v5 §2 design tokens
        sev: {
          critical: '#EF4444',
          high:     '#F97316',
          medium:   '#F59E0B',
          low:      '#3B82F6',
          none:     '#94A3B8',
        },
        conf: {
          confirmed:   '#10B981',
          likely:      '#8B5CF6',
          unconfirmed: '#94A3B8',
        },
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / .08), 0 1px 2px -1px rgb(0 0 0 / .05)',
      },
    },
  },
  plugins: [],
};

export default config;
