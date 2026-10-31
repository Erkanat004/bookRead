import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  plugins: [{
    name: 'lumi-local-dev-csp',
    transformIndexHtml(html, context) {
      // Only the development page may connect to local HMR sockets. APK CSP stays offline.
      return context.server ? html.replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:* ws://localhost:*") : html;
    }
  }]
});
