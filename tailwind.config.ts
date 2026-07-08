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
        background: "#0B0B0C",
        surface: "rgba(255,255,255,0.04)",
        "surface-hover": "rgba(255,255,255,0.06)",
        "surface-active": "rgba(255,255,255,0.08)",
        border: "rgba(255,255,255,0.08)",
        "border-strong": "rgba(255,255,255,0.12)",
        gold: "#FFC501",
        "gold-dim": "rgba(255,197,1,0.15)",
        "text-primary": "#FFFFFF",
        "text-secondary": "rgba(255,255,255,0.50)",
        "text-tertiary": "rgba(255,255,255,0.30)",
        success: "#00a884",
        warning: "#FFC501",
        error: "#EF4444",
        info: "#53BDEB",
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
