import type { Config } from "tailwindcss";

/**
 * Brand blue palette derived from #214ADE.
 * Overrides Tailwind's default `indigo` scale so every `indigo-*` class in the
 * codebase automatically uses the brand colour without per-component changes.
 */
const brandBlue = {
  50:  '#EEF3FF',
  100: '#DCE8FF',
  200: '#BAD1FF',
  300: '#89AAFD',
  400: '#557FF7',
  500: '#3060EC',
  600: '#214ADE', // ← primary brand colour
  700: '#1A3DB8',
  800: '#152F90',
  900: '#102069',
  950: '#091447',
};

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic aliases (used via CSS var() in components)
        background:     "var(--background)",
        foreground:     "var(--foreground)",
        primary:        "var(--color-primary)",
        accent:         "var(--color-accent)",
        "accent-light": "var(--color-accent-light)",
        surface:        "var(--color-surface)",
        border:         "var(--color-border)",
        muted:          "var(--color-muted)",
        // Override Tailwind's indigo → brand blue (handles all inline `indigo-*` classes)
        indigo: brandBlue,
        // Also available as `brand-*` for new code
        brand: brandBlue,
      },
    },
  },
  plugins: [],
};

export default config;
