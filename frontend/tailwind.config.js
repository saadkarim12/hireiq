/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/pages/**/*.{js,ts,jsx,tsx,mdx}','./src/components/**/*.{js,ts,jsx,tsx,mdx}','./src/app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#0A3D2E', 'navy-mid': '#0F6E56',
          gold: '#C9A84C', 'gold-light': '#FDF6E3', 'gold-dark': '#7A5010',
          blue: '#0F6E56', 'blue-light': '#E8F5EE', 'blue-mid': '#1D9E75',
        },
      },
      boxShadow: { 'card': '0 1px 3px 0 rgba(0,0,0,0.08)', 'card-hover': '0 4px 6px -1px rgba(0,0,0,0.1)', 'sidebar': '2px 0 8px -2px rgba(0,0,0,0.15)', 'panel': '-4px 0 20px -4px rgba(0,0,0,0.15)' },
    },
  },
  plugins: [],
}
