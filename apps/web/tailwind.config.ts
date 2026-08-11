import type { Config } from 'tailwindcss';

/**
 * All colors resolve to CSS variables from src/style.css — see docs/DESIGN-SYSTEM.md.
 * RGB-triplet tokens keep Tailwind alpha modifiers working (bg-accent/15).
 * Do NOT add literal colors here; add a token in style.css first.
 */
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: [
    './index.html',
    './src/**/*.{vue,ts}',
    // Plugin Vue shipped via exports["./web"] (ADR-0016)
    '../../plugins/*/src/web/**/*.{vue,ts}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          base: rgb('--surface-base'),
          panel: rgb('--surface-panel'),
          elevated: rgb('--surface-elevated'),
          hover: rgb('--surface-hover'),
          input: rgb('--surface-input'),
          raise: 'var(--surface-raise)',
          raise2: 'var(--surface-raise2)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        text: {
          primary: rgb('--text-primary'),
          secondary: rgb('--text-secondary'),
          muted: rgb('--text-muted'),
          ghost: rgb('--text-ghost'),
        },
        accent: {
          DEFAULT: rgb('--accent'),
          hover: rgb('--accent-hover'),
          ink: rgb('--accent-ink'),
          subtle: 'rgb(var(--accent) / 0.15)',
        },
        success: rgb('--success'),
        warning: rgb('--warning'),
        danger: rgb('--danger'),
        info: rgb('--info'),
        stage: {
          blue: rgb('--stage-blue'),
          amber: rgb('--stage-amber'),
          orange: rgb('--stage-orange'),
          green: rgb('--stage-green'),
          red: rgb('--stage-red'),
          purple: rgb('--stage-purple'),
          gray: rgb('--stage-gray'),
        },
      },
      fontFamily: {
        sans: ['Geist Variable', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['Geist Mono Variable', 'Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
