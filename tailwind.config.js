/** @type {import('tailwindcss').Config} */

// Generic default brand tokens — swap these for your own product's colors.
// Keep this file (plus the component classes that use these token names)
// as the one place that changes if you re-skin the tutor for a different
// product; the rest of the app just references brand-* / gradient-brand-*.
//
// Plain .js (not .ts): a tailwind.config.ts here can silently fail to
// load depending on your toolchain — theme.extend gets ignored with no
// error, falling back to stock Tailwind defaults, while arbitrary-value
// classes (e.g. ring-[#6366F1]) keep working. That mismatch (stock
// classes work, custom ones silently don't) is the tell if you ever port
// this back to .ts and colors stop applying.
module.exports = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          ink: "#0F172A", // dark section background
          soft: "#F1F5F9", // light section background
          slate: "#1E293B", // body text
        },
      },
      backgroundImage: {
        "gradient-brand-primary": "linear-gradient(135deg, #6366F1, #8B5CF6)",
        "gradient-brand-soft": "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.12))",
        "gradient-brand-dark": "linear-gradient(135deg, #0F172A, #1E1B4B 50%, #312E81)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
