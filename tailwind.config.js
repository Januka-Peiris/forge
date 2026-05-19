/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono Variable', 'ui-monospace', 'Cascadia Code', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        panel: 'var(--radius-panel)',
        btn: 'var(--radius-button)',
        input: 'var(--radius-input)',
        chat: 'var(--radius-chat)',
      },
      fontSize: {
        'ui-tiny': '9px',
        'ui-caption': '10px',
        'ui-label': '11px',
        'ui-body': '13px',
        'ui-subhead': '15px',
        'ui-headline': '17px',
        'ui-title': '22px',
        'ui-display': '28px',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        tertiary: {
          DEFAULT: 'hsl(var(--tertiary))',
          foreground: 'hsl(var(--tertiary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        mn: {
          bg: '#0a0c10',
          surface: '#111419',
          card: '#161a22',
          'surface-overlay': 'rgba(255, 255, 255, 0.03)',
          'surface-overlay-high': 'rgba(255, 255, 255, 0.08)',
          border: '#1a1e28',
          'border-light': '#242a34',
          text: '#f0f0f0',
          muted: '#7a8494',
          dim: '#4a5060',
          cyan: '#00D4FF',
          'cyan-high': '#66E5FF',
          'cyan-dim': '#0a3044',
          orange: '#F97316',
          'orange-dim': '#7c2d12',
          blue: '#3b82f6',
          'blue-dim': '#1e3a8a',
          violet: '#7C3AED',
          'violet-dim': '#3b1578',
          magenta: '#D946EF',
          green: '#22C55E',
          'green-dim': '#064e3b',
          red: '#DC2626',
          yellow: '#EAB308',
        },
      },
      boxShadow: {
        'mn-card': '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02)',
        'mn-panel': '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02)',
        'mn-modal': '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
        'cyan-glow': '0 0 12px rgba(0, 212, 255, 0.2)',
        'electric-glow': '0 0 16px rgba(0, 212, 255, 0.35)',
        'amber-glow': '0 0 12px rgba(249, 115, 22, 0.25)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
