import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { WEB_API_VERSION } from './src/version.js';

const { name, version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const target = process.env.CF_API_TARGET || 'http://127.0.0.1:8102';
const proxy = Object.fromEntries(['/api', '/healthz'].map(path => [path, {
  target,
  changeOrigin: false,
  timeout: 300_000,
  proxyTimeout: 300_000,
}]));

export default defineConfig({
  define: { __WEBUI_VERSION__: JSON.stringify(version) },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  plugins: [{
    name: 'courseflow-release',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ name, version, web_api_version: WEB_API_VERSION }) + '\n' });
    },
  }],
});
