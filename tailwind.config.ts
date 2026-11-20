import type { Config } from 'tailwindcss';
export default {
  content: ['./src/renderer/**/*.{html,tsx}', './src/companion/**/*.{html,tsx}'],
  theme: {extend: {colors: {surface:'var(--surface)', primary:'var(--primary)', text:'var(--text)'}}},
} satisfies Config;
