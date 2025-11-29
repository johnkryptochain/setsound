/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          300: '#a8acef',
          500: '#8286ef',
          700: '#6b6fdb',
        },
        neutral: {
          950: '#0A0A0A',
          900: '#141414',
          800: '#272727',
          700: '#3A3A3A',
          400: '#A3A3A3',
          100: '#E4E4E7',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}