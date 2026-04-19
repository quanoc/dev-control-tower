/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // zIndex 层级系统
      zIndex: {
        base: 0,
        dropdown: 10,
        sticky: 20,
        fixed: 30,
        drawer: 50,
        modal: 60,
        popover: 70,
        toast: 80,
      },
      // Surface 颜色（深色主题背景）
      colors: {
        surface: {
          DEFAULT: '#030712',   // gray-950 - 最底层
          raised: '#111827',    // gray-900 - 卡片/弹窗背景
          elevated: '#1f2937',  // gray-800 - 输入框/悬浮层
          overlay: '#374151',   // gray-700 - 最高层级背景
        }
      }
    },
  },
  plugins: [],
};
