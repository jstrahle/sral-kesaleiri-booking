import { join } from 'node:path';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import view from '@fastify/view';
import Fastify from 'fastify';
import nunjucks from 'nunjucks';
import { config } from './config.ts';
import { pool } from './db.ts';
import { startHeartbeat } from './events.ts';
import { registerInternalRoutes } from './routes/internal.ts';
import { registerPublicRoutes } from './routes/public.ts';
import './types.ts';

const app = Fastify({
  logger: { level: config.logLevel },
  trustProxy: true,
});

/**
 * Runko talteen raakana: HMAC lasketaan tasmalleen siita merkkijonosta, joka
 * saapui - uudelleensarjallistettu JSON ei valttamatta ole tavulleen sama.
 */
app.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (request, body: string, done) => {
    request.rawBody = body;
    try {
      done(null, body === '' ? {} : JSON.parse(body));
    } catch (error) {
      done(error as Error, undefined);
    }
  },
);

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
});

const dateFormat = new Intl.DateTimeFormat('fi-FI', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Helsinki',
});

await app.register(view, {
  engine: { nunjucks },
  root: join(import.meta.dirname, 'views'),
  viewExt: 'njk',
  options: {
    onConfigure: (env: nunjucks.Environment) => {
      env.addFilter('pvm', (value: unknown) =>
        value instanceof Date ? dateFormat.format(value) : '\u2013',
      );
    },
  },
});

await app.register(fastifyStatic, {
  root: join(import.meta.dirname, 'static'),
  prefix: '/static/',
});

app.get('/healthz', async () => {
  await pool.query('SELECT 1');
  return { status: 'ok', service: 'public' };
});

registerInternalRoutes(app);
registerPublicRoutes(app);

async function start(): Promise<void> {
  try {
    startHeartbeat();
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
