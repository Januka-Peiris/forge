/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono Variable', 'ui-monospace', 'Cascadia Code', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
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
        forge: {
          bg: '#0a0b0e',
          surface: '#0f1117',
          card: '#141820',
          border: '#1c2030',
          'border-light': '#252d40',
          text: '#e8eaf2',
          // Secondary copy: lighter than before for readability on forge-surface / forge-card
          muted: '#9aa6c8',
          // Labels, placeholders, timestamps — still quieter than `muted`, but not near-black on dark UI
          dim: '#6f7b96',
          orange: '#f97316',
          'orange-dim': '#7c3a0f',
          blue: '#3b82f6',
          'blue-dim': '#1a3a7c',
          violet: '#8b5cf6',
          'violet-dim': '#3d2175',
          green: '#22c55e',
          red: '#ef4444',
          yellow: '#eab308',
          teal: '#14b8a6',
        },
      },
      boxShadow: {
        'forge-card': '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
        'forge-panel': '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        'forge-modal': '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)',
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
