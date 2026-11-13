import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Vendor chunks: the landing page only needs `react`; the app pulls the rest on demand. */
const VENDOR_CHUNKS: [string, RegExp][] = [
  ['react', /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run|turbo-stream|cookie|set-cookie-parser)[\\/]/],
  ['supabase', /[\\/]node_modules[\\/]@supabase[\\/]/],
  ['pdf', /[\\/]node_modules[\\/](jspdf|jspdf-autotable|html2canvas|fflate|canvg|dompurify|stackblur-canvas|rgbcolor|svg-pathdata|css-line-break|text-segmentation|base64-arraybuffer|utrie)[\\/]/],
  ['calendar', /[\\/]node_modules[\\/](react-big-calendar|date-fns|dayjs|moment|luxon|react-overlays|@restart|dom-helpers|uncontrollable|memoize-one|lodash|lodash-es|clsx|invariant|prop-types|@popperjs)[\\/]/],
  ['scanner', /[\\/]node_modules[\\/](html5-qrcode|qrcode\.react)[\\/]/],
  ['ocr', /[\\/]node_modules[\\/](tesseract\.js|tesseract\.js-core|wasm-feature-detect|is-url|bmp-js|regenerator-runtime|zlibjs)[\\/]/],
  ['forms', /[\\/]node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/],
];

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 3010,
    host: true,
  },
  preview: {
    port: 4173,
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: isSsrBuild
      ? {}
      : {
          output: {
            manualChunks(id: string) {
              // Shared Rollup/Vite runtime helpers go with React (always loaded) so the landing page never pulls
              // a heavy vendor chunk just for a helper function.
              if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers') || id.includes('vite/modulepreload-polyfill')) return 'react';
              if (!id.includes('node_modules')) return undefined;
              for (const [name, re] of VENDOR_CHUNKS) if (re.test(id)) return name;
              return undefined;
            },
          },
        },
  },
}));
