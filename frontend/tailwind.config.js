/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7F4EE",
        ink: "#1C1B1A",
        editorred: "#8B2E2E",
        sage: "#5C6B57",
        pencil: "#D8D2C4",
      },
      fontFamily: {
        display: ["Newsreader", "serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
}