import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        "surface-hover": "var(--color-surface-hover)",
        "surface-active": "var(--color-surface-active)",
        border: "var(--color-border)",
        "border-strong": "var(--color-border-strong)",
        "border-interactive": "var(--color-border-interactive)",
        gold: "var(--color-gold)",
        "gold-text": "var(--color-gold-text)",
        "gold-dim": "var(--color-gold-dim)",
        "on-gold": "var(--color-on-gold)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-tertiary": "var(--color-text-tertiary)",
        success: "var(--color-success)",
        "success-dim": "var(--color-success-dim)",
        warning: "var(--color-warning)",
        "warning-dim": "var(--color-warning-dim)",
        error: "var(--color-error)",
        "error-dim": "var(--color-error-dim)",
        info: "var(--color-info)",
        "info-dim": "var(--color-info-dim)",
        accent: "var(--color-accent)",
        "accent-dim": "var(--color-accent-dim)",
        orange: "var(--color-orange)",
        "orange-dim": "var(--color-orange-dim)",
        scrim: "var(--color-scrim)",
        overlay: "rgb(var(--overlay-tint) / <alpha-value>)",
      },
      fontSize: {
        "2xs": ["0.75rem", { lineHeight: "1.1rem", letterSpacing: "0.02em" }],
        xs: ["0.8125rem", { lineHeight: "1.2rem" }],
        sm: ["0.9375rem", { lineHeight: "1.45rem" }],
        base: ["1.0625rem", { lineHeight: "1.65rem" }],
        lg: ["1.1875rem", { lineHeight: "1.7rem" }],
        xl: ["1.375rem", { lineHeight: "1.85rem" }],
        "2xl": ["1.6875rem", { lineHeight: "2.1rem" }],
        "3xl": ["2.125rem", { lineHeight: "2.5rem" }],
        "4xl": ["2.625rem", { lineHeight: "3rem" }],
        "5xl": ["3.25rem", { lineHeight: "1.1" }],
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        heading: ["var(--font-league)", "League Spartan", "var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "12px",
        card: "1.25rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
