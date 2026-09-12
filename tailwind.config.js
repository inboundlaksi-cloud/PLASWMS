/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './script.js',
    './features-v3.js',
    './features-v4.js',
    './intern-system.js',
    './role-system.js',
    './notewall-v47-last-hardfix.js',
    './fzone-module.js',
    './fzone-bridge.js',
    './fzone-topup-integration.js'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Sarabun Local"', 'Tahoma', 'sans-serif'],
        display: ['"Nunito Local"', '"Sarabun Local"', 'sans-serif']
      },
      colors: {
        slate: {
          300:'#8393a4',
          400:'#66788b',
          500:'#52657a',
          600:'#40566c'
        },
        brand: { 50:'#eff6ff', 100:'#dbeafe', 500:'#3b82f6', 600:'#2563eb', 700:'#1d4ed8', 900:'#1e3a8a' },
        topup: { 50:'#f0fdfa', 100:'#ccfbf1', 500:'#14b8a6', 600:'#0d9488', 700:'#0f766e' },
        move: { 50:'#f5f3ff', 100:'#ede9fe', 500:'#8b5cf6', 600:'#7c3aed', 700:'#6d28d9' },
        written: { 50:'#f0f9ff', 100:'#e0f2fe', 500:'#0ea5e9', 600:'#0284c7', 700:'#0369a1' },
        surface: '#f8fafc',
        reject: { 50:'#fef2f2', 100:'#fee2e2', 500:'#ef4444', 600:'#dc2626', 700:'#b91c1c' },
        supervisor: {
          900:'#4c1d95',
          800:'#5b21b6',
          700:'#6d28d9',
          600:'#7c3aed',
          500:'#8b5cf6',
          gold:'#f59e0b',
          goldLight:'#fcd34d'
        }
      },
      boxShadow: {
        soft: '0 8px 24px rgba(29, 49, 61, 0.08)'
      },
      animation: {
        'fade-in-up': 'fadeInUp 180ms ease-out both'
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: []
};
