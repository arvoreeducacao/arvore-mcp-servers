/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0a0a0f",
          raised: "#131320",
          overlay: "#1a1a2e",
        },
        border: {
          DEFAULT: "#1e1e3a",
          normal: "#2a2a4a",
          hover: "#3a3a5a",
        },
        text: {
          DEFAULT: "#e2e2f0",
          muted: "#8888aa",
          dim: "#555577",
        },
        accent: {
          DEFAULT: "#5e6ad2",
          hover: "#6e7ae2",
        },
        priority: {
          urgent: "#ef4444",
          high: "#f97316",
          medium: "#eab308",
          low: "#3b82f6",
          none: "#6b7280",
        },
        session: {
          active: "#22c55e",
          review: "#a78bfa",
          paused: "#eab308",
          failed: "#ef4444",
          completed: "#22c55e",
          abandoned: "#6b7280",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-out-right": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(100%)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "slide-in-right": "slide-in-right 0.2s ease-out",
        "slide-out-right": "slide-out-right 0.2s ease-in",
        "fade-in": "fade-in 0.15s ease-out",
      },
    },
  },
  plugins: [],
};
