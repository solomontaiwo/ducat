/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  future: { hoverOnlyWhenSupported: true },
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Figtree Variable", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Bricolage Grotesque Variable", "Figtree Variable", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        income: "hsl(var(--income) / <alpha-value>)",
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          strong: "hsl(var(--warning-strong) / <alpha-value>)",
        },
        hero: {
          DEFAULT: "hsl(var(--hero) / <alpha-value>)",
          foreground: "hsl(var(--hero-foreground) / <alpha-value>)",
          muted: "hsl(var(--hero-muted) / <alpha-value>)",
        },
        "chart-expense": "hsl(var(--chart-expense) / <alpha-value>)",
      },
      borderRadius: {
        xl: "calc(var(--radius) - 4px)",
        "2xl": "var(--radius)",
        "3xl": "calc(var(--radius) + 6px)",
        lg: "calc(var(--radius) - 6px)",
        md: "calc(var(--radius) - 8px)",
        sm: "calc(var(--radius) - 10px)",
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
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
import tailwindcssAnimate from "tailwindcss-animate";
