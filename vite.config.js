import { defineConfig } from 'vite';
import { resolve } from 'path';
import { spawn } from 'child_process';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    {
      name: 'api-server',
      configureServer(server) {
        // Rewrite /admin to admin/index.html
        server.middlewares.use((req, res, next) => {
          if (req.url === '/admin' || req.url === '/admin/') {
            req.url = '/admin/index.html';
          }
          next();
        });
        const child = spawn('node', ['dev-server.js'], {
          stdio: 'inherit',
          cwd: __dirname,
        });
        server.httpServer?.on('close', () => {
          child.kill();
        });
      },
    },
  ],
});
