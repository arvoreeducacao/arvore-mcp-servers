/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        glass: {
          bg: "rgba(255, 255, 255, 0.03)",
          border: "rgba(255, 255, 255, 0.08)",
          "border-hover": "rgba(255, 255, 255, 0.15)",
          surface: "rgba(255, 255, 255, 0.05)",
          "surface-hover": "rgba(255, 255, 255, 0.08)",
          muted: "rgba(255, 255, 255, 0.4)",
          text: "rgba(255, 255, 255, 0.88)",
          "text-secondary": "rgba(255, 255, 255, 0.55)",
          "text-dim": "rgba(255, 255, 255, 0.3)",
        },
        accent: {
          teal: "#40CAB6",
          "teal-glow": "rgba(64, 202, 182, 0.15)",
          blue: "#4F81F1",
          "blue-glow": "rgba(79, 129, 241, 0.15)",
          purple: "#8764D8",
          "purple-glow": "rgba(135, 100, 216, 0.15)",
          amber: "#FDC200",
          "amber-glow": "rgba(253, 194, 0, 0.12)",
          red: "#FA163E",
          "red-glow": "rgba(250, 22, 62, 0.12)",
          green: "#3DA169",
          "green-glow": "rgba(61, 161, 105, 0.12)",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backdropBlur: {
        glass: "20px",
        "glass-heavy": "40px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        glow: {
          "0%": { opacity: "0.5" },
          "100%": { opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
