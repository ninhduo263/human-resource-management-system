/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9f6',
          100: '#daf1e9',
          200: '#b8e2d5',
          500: '#1f7a68',
          600: '#12584b',
          700: '#0f473d',
          800: '#0c3830',
          900: '#092a24',
        },
      },
    },
  },
  plugins: [],
};
