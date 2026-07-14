import Fastify from 'fastify';
import { config } from './config.ts';
import { pool } from './db.ts';

const app = Fastify({
  logger: { level: config.logLevel },
  trustProxy: true,
});

app.get('/healthz', async () => {
  await pool.query('SELECT 1');
  return { status: 'ok', service: 'admin' };
});

// Vaihe 2 tuo tahan: kirjautuminen, roolit, rekisterointinakyma,
// duplikaattitarkistus, osallistujatyypit ja outbox-tyontaja.

async function start(): Promise<void> {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => pool.end()).then(() => process.exit(0));
  });
}

void start();
