/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './src/sidepanel/index.html',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // ── Primary navy palette ──────────────────────────────
        brand: {
          50:  '#F0F4F8',
          100: '#D9E2EC',
          200: '#BCCCDC',
          300: '#9FB3C8',
          400: '#7B8DB1',
          500: '#547399',
          600: '#3E5C81',
          700: '#1E3A5F',
          800: '#162F4D',
          900: '#0F2137',
        },
        // ── Accent teal (sparingly) ───────────────────────────
        accent: {
          50:  '#F0FAFB',
          100: '#D3EDF0',
          200: '#A7DBE0',
          300: '#6BBFC8',
          400: '#4A9BA5',
          500: '#3B8C96',
          600: '#2D7A83',
          700: '#1F5F66',
        },
        // ── Surfaces ─────────────────────────────────────────
        surface: {
          DEFAULT: '#FFFFFF',
          warm:    '#FAFAF8',
          muted:   '#F3F4F2',
        },
        // ── Semantic ─────────────────────────────────────────
        success: {
          50:  '#F0FDF4',
          100: '#DCFCE7',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
        },
        danger: {
          50:  '#FEF2F2',
          100: '#FEE2E2',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
        warning: {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        // ── Neutrals (warm grays) ────────────────────────────
        neutral: {
          50:  '#FAFAF9',
          100: '#F5F5F3',
          200: '#E8E8E6',
          300: '#D4D4D1',
          400: '#A3A3A0',
          500: '#737370',
          600: '#525250',
          700: '#3F3F3D',
          800: '#262625',
          900: '#171716',
        },
        // Keep linkedin color for any non-UI references
        linkedin: {
          blue: '#0077B5',
        },
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '8px',
        xl: '12px',
      },
      boxShadow: {
        'soft': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.04)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'ease',
      },
      animation: {
        'spin-slow': 'spin 1.2s linear infinite',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
        'fade-in': 'fade-in 200ms ease',
        'slide-up': 'slide-up 200ms ease',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
