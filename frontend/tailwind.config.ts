import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#211a13',
        muted: '#8a7d70',
        cream: '#fbf6ef',
        paper: '#ffffff',
        line: '#efe5d8',
        blush: {
          50: '#fff9f7',
          100: '#fdf0ed',
          200: '#f8dcd7',
          300: '#f1c4be',
          400: '#e7a6a2',
          500: '#d77f87',
          600: '#bd626e',
          700: '#9e4f5b',
          800: '#823f4a',
          900: '#653238'
        },
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12'
        },
        moss: '#5f7d58',
        gold: '#d9a441',
        berry: '#b4556b',
        sky: '#5c86a8'
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif']
      },
      boxShadow: {
        soft: '0 1px 2px rgba(48,32,18,.04), 0 12px 32px -12px rgba(48,32,18,.12)',
        lift: '0 18px 44px -18px rgba(249,115,22,.45)'
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' }
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' }
        }
      },
      animation: {
        'fade-up': 'fade-up .5s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .35s ease both',
        'pop-in': 'pop-in .25s cubic-bezier(.22,1,.36,1) both',
        'slide-up': 'slide-up .3s cubic-bezier(.22,1,.36,1) both',
        float: 'float 5s ease-in-out infinite',
        marquee: 'marquee 30s linear infinite'
      }
    }
  },
  plugins: []
};

export default config;
