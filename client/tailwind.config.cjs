/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { wine: '#591b30', rose: '#b66a7b', blush: '#f6e6e7', cream: '#fbf7f1', ink: '#241d20', lavender: '#84748f' }, boxShadow: { glow: '0 18px 55px rgba(89, 27, 48, .14)' } } },
  plugins: [],
}
