import { join } from 'node:path';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import session from '@fastify/session';
import fastifyStatic from '@fastify/static';
import view from '@fastify/view';
import Fastify from 'fastify';
import nunjucks from 'nunjucks';
import { originGuard, registerAuthRoutes } from './auth.ts';
import { bootstrapAdmin } from './bootstrap.ts';
import { config } from './config.ts';
import { pool } from './db.ts';
import { centsToInput, formatCents } from './money.ts';
import { registerParticipantTypeRoutes } from './routes/participant-types.ts';
import { registerImportRoutes } from './routes/import.ts';
import { registerPrivacyRoutes } from './routes/privacy.ts';
import { registerProfileRoutes } from './routes/profile.ts';
import { registerRegistrationRoutes } from './routes/registrations.ts';
import { registerStatisticsRoutes } from './routes/statistics.ts';
import { registerUserRoutes } from './routes/users.ts';
import { postgresSessionStore, purgeExpiredSessions } from './session-store.ts';
import { startSyncPusher } from './sync.ts';
import './types.ts';

const app = Fastify({
  logger: { level: config.logLevel },
  trustProxy: true,
});

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  // Referrer-Policy asetetaan Caddyssa (same-origin hallintapuolelle), joten
  // ei aseteta sita tassa - kaksi lahdetta samalle otsakkeelle aiheuttaisi
  // sekaannusta. Caddyn otsake yliajaa taalta tulevan joka tapauksessa.
  referrerPolicy: false,
});

await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
await app.register(formbody);
await app.register(cookie);

await app.register(session, {
  secret: config.sessionSecret,
  store: postgresSessionStore,
  saveUninitialized: false,
  cookie: {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 12 * 60 * 60 * 1000,
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
      // Aikaleimat tallennetaan UTC:na, naytetaan Suomen aikaa
      env.addFilter('pvm', (value: unknown) =>
        value instanceof Date ? dateFormat.format(value) : '\u2013',
      );
      env.addFilter('euro', (value: unknown) =>
        typeof value === 'number' ? formatCents(value) : '\u2013',
      );
      env.addFilter('euroinput', (value: unknown) =>
        typeof value === 'number' ? centsToInput(value) : '0,00',
      );
    },
  },
});

await app.register(fastifyStatic, {
  root: join(import.meta.dirname, 'static'),
  prefix: '/static/',
});

// CSRF: SameSite=strict + Origin-tarkistus jokaisessa muuttavassa pyynnossa
app.addHook('preHandler', originGuard(process.env.ADMIN_DOMAIN));

app.get('/healthz', async () => {
  await pool.query('SELECT 1');
  return { status: 'ok', service: 'admin' };
});

registerAuthRoutes(app);
registerProfileRoutes(app);
registerUserRoutes(app);
registerParticipantTypeRoutes(app);
registerPrivacyRoutes(app);
registerRegistrationRoutes(app);
registerImportRoutes(app);
registerStatisticsRoutes(app);

async function start(): Promise<void> {
  try {
    await bootstrapAdmin(app.log);

    setInterval(() => {
      void purgeExpiredSessions().catch((error: unknown) => app.log.error(error));
    }, 60 * 60 * 1000).unref();

    // Outbox-tyontaja: ainoa tie julkiselle puolelle
    startSyncPusher(app.log);

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
