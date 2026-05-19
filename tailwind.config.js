/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0056b3',
        secondary: '#6c757d',
        success: '#28a745',
        danger: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8',
        accent: '#ec4899',
        // foreground helpers
        'success-foreground': '#ffffff',
        'primary-foreground': '#ffffff',
        'info-foreground': '#ffffff',
        'danger-foreground': '#ffffff',
        'warning-foreground': '#111827',
        // muted text
        'muted-foreground': '#6b7280',
      },
    },
  },
  plugins: [],
}