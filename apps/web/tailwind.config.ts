import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: 'var(--bg)',
        'bg-card': 'var(--bg-card)',
        'bg-sub': 'var(--bg-sub)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-mute': 'var(--ink-mute)',
        line: 'var(--line)',
        violet: 'var(--violet)',
        'violet-deep': 'var(--violet-deep)',
        'violet-soft': 'var(--violet-soft)',
        lime: 'var(--lime)',
        'lime-deep': 'var(--lime-deep)',
        danger: 'var(--danger)',
        warn: 'var(--warn)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
      },
    },
  },
  plugins: [],
}

export default config
