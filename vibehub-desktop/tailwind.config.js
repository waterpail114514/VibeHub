export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          bg: 'rgba(255,255,255,0.72)',
          card: 'rgba(255,255,255,0.55)',
          hover: 'rgba(255,255,255,0.80)',
          border: 'rgba(0,0,0,0.08)',
          accent: '#007AFF',
          'accent-hover': '#0062CC',
          text: '#1d1d1f',
          muted: '#86868b',
          success: '#34C759',
          warning: '#FF9500',
          danger: '#FF3B30',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
      animation: {
        'slide-up': 'slideUp 0.25s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};
