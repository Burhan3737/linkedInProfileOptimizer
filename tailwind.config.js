/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './src/sidepanel/index.html',
  ],
  theme: {
    extend: {
      colors: {
        linkedin: {
          blue: '#0077B5',
          'blue-dark': '#005885',
          'blue-light': '#E8F4FD',
        },
      },
    },
  },
  plugins: [],
};
