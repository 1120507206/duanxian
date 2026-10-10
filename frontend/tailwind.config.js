/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        rise: '#ef4444',
        fall: '#22c55e',
        flat: '#9ca3af',
        dark: {
          bg: '#0f172a',
          panel: '#1e293b',
          border: '#334155',
          hover: '#1e3a5f',
        },
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
