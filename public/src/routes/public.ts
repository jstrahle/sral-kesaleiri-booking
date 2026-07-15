import type { FastifyInstance } from 'fastify';
import { addClient, removeClient } from '../events.ts';
import { latest, list, privacyPolicy, totalCount, type SortKey } from '../registrations.ts';

const PER_PAGE = 50;

function parseSort(value: unknown): SortKey {
  return value === 'kutsu' ? 'kutsu' : 'aika';
}

export function registerPublicRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { q?: string; sivu?: string; jarjestys?: string } }>(
    '/',
    async (request, reply) => {
      const query = request.query.q ?? '';
      const sort = parseSort(request.query.jarjestys);
      const page = Number.parseInt(request.query.sivu ?? '1', 10);

      const [result, total] = await Promise.all([
        list({ query, sort, page: Number.isFinite(page) ? page : 1, perPage: PER_PAGE }),
        totalCount(),
      ]);

      // Lista paivittyy reaaliajassa vain oletusnakymassa (uusin ensin, ei hakua,
      // ensimmainen sivu). Muissa nakymissa uusi rivi menisi vaaraan kohtaan,
      // joten naytetaan sen sijaan hillitty "nayta uudet" -vihje.
      const live = query.trim() === '' && sort === 'aika' && result.page === 1;

      return reply.view('index.njk', {
        query,
        sort,
        result,
        total,
        live,
      });
    },
  );

  /** Tietosuojaseloste. Nakyy aina; tyhja teksti -> "ei viela julkaistu". */
  app.get('/tietosuoja', async (_request, reply) => {
    return reply.view('privacy.njk', { content: await privacyPolicy() });
  });

  /** Seinanaytto leirialueelle: iso laskuri ja uusimmat kutsumerkit. */
  app.get('/wall', async (_request, reply) => {
    return reply.view('wall.njk', {
      total: await totalCount(),
      latest: await latest(),
    });
  });

  app.get('/api/count', async () => ({ total: await totalCount() }));

  /** SSE: palvelin tyontaa paivitykset, selain ei kysele. */
  app.get('/events', (request, reply) => {
    // Fastify ei saa lahettaa vastausta puolestamme - hoidamme socketin itse.
    reply.hijack();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    reply.raw.write(': yhteys avattu\n\n');
    addClient(reply);

    request.raw.on('close', () => {
      removeClient(reply);
    });
  });
}
