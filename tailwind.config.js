/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          white: "#FFFFFF",
          "deep-blue": "#163A5F",
          "royal-blue": "#2563EB",
          "light-blue": "#EFF6FF",
          "off-white": "#F8FAFC",
          "dark-navy": "#172B4D",
          slate: "#64748B",
          border: "#E2E8F0",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

