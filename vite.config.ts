import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { artStyleThumbnailPlugin } from './vite-plugins/artStyleThumbnailPlugin';

const json5RawPlugin = () => ({
  name: 'json5-raw-loader',
  transform(code: string, id: string) {
    if (id.endsWith('.json5')) {
      return {
        code: `export default ${JSON.stringify(code)};`,
        map: null,
      };
    }
    return null;
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // Prefer process.env (set by Playwright via webServer.env) over loadEnv (from .env files)
    const e2eApiKey = process.env.E2E_OPENROUTER_API_KEY || env.E2E_OPENROUTER_API_KEY || '';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        open: true,
      },
      plugins: [json5RawPlugin(), react(), artStyleThumbnailPlugin()],
      define: {
        // Only expose the E2E test key - regular OPENROUTER_API_KEY is not exposed to prevent
        // accidental usage of env keys in development. Users should connect via OAuth or manual key entry.
        'process.env.E2E_OPENROUTER_API_KEY': JSON.stringify(e2eApiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'demo-dist',
      }
    };
});
