import { appendFileSync, mkdirSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Recebe o relatório do medidor de desempenho (?perf) mandado pelo celular e grava em
 * reports/perf.jsonl. Só existe no servidor de desenvolvimento.
 */
function perfReceiver(): Plugin {
  return {
    name: 'perf-receiver',
    configureServer(server) {
      server.middlewares.use('/__perf', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        let body = '';
        req.on('data', (c: Buffer) => {
          body += c.toString('utf8');
          if (body.length > 20000) req.destroy();
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            mkdirSync('reports', { recursive: true });
            appendFileSync('reports/perf.jsonl', JSON.stringify({ at: new Date().toISOString(), ua: req.headers['user-agent'], ...data }) + '\n');
            console.log(`[perf] ${data.label ?? ''} ${data.fps?.toFixed?.(1)} fps, p95 ${data.p95?.toFixed?.(1)} ms, ${data.calls} chamadas, ${data.triangles} triângulos`);
          } catch {
            // corpo inválido: ignora
          }
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [perfReceiver()],
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
});
