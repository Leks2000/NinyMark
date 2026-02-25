/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0F0F0F",
          card: "#1A1A1A",
          hover: "#252525",
          input: "#222222",
        },
        accent: {
          DEFAULT: "#FF424D",
          hover: "#FF5A63",
          indigo: "#6366F1",
        },
        text: {
          primary: "#FFFFFF",
          secondary: "#A1A1AA",
          muted: "#71717A",
        },
      },
      borderRadius: {
        xl: "12px",
      },
    },
  },
  plugins: [],
};
