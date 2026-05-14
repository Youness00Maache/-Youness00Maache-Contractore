import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router-dom/')) {
                return 'vendor-react';
              }
              if (id.includes('/jspdf/') || id.includes('/html2canvas/')) {
                return 'vendor-pdf';
              }
              if (id.includes('/@supabase/')) {
                return 'vendor-supabase';
              }
              if (id.includes('/lucide-react/')) {
                return 'vendor-ui';
              }
              if (id.includes('/tesseract.js/')) {
                return 'vendor-tesseract';
              }
              if (id.includes('/react-big-calendar/') || id.includes('/date-fns/')) {
                return 'vendor-calendar';
              }
              if (id.includes('/html5-qrcode/') || id.includes('/qrcode.react/')) {
                return 'vendor-qr';
              }
              // Not returning a catch-all 'vendor' prevents circular dependency issues
            }
          }
        }
      }
    }
  };
});
