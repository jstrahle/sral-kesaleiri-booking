import type { FastifyInstance } from 'fastify';
import { config } from '../config.ts';
import { broadcast } from '../events.ts';
import { verify } from '../hmac.ts';
import { totalCount } from '../registrations.ts';
import { applyEvents, currentCursor, type SyncEvent } from '../sync.ts';

/**
 * Ainoa reitti, jonka kautta tieto paatyy tanne. Caddy estaa /internal/*
 * -polut internetista; sisaverkossa paasyn ratkaisee allekirjoitus.
 */
export function registerInternalRoutes(app: FastifyInstance): void {
  app.post<{ Body: { events?: SyncEvent[] } }>('/internal/sync', async (request, reply) => {
    const result = verify(
      config.syncSecret,
      request.headers['x-sync-timestamp'] as string | undefined,
      request.headers['x-sync-signature'] as string | undefined,
      request.rawBody ?? '',
    );

    if (result !== 'ok') {
      request.log.warn({ result }, 'synkronointipyynto hylattiin');
      return reply.code(401).send({ error: result });
    }

    const events = request.body.events ?? [];
    const applied = await applyEvents(events);

    // Selaimet saavat paivityksen valittomasti - ei pollausta, ei refreshia.
    if (applied.total !== null || applied.upserted.length > 0 || applied.removed.length > 0) {
      broadcast('update', {
        total: applied.total ?? (await totalCount()),
        added: applied.upserted,
        removed: applied.removed,
      });
    }

    // Kursori kerrotaan vastauksessa: hallintapuoli tietaa mita lahettaa uudelleen,
    // eika tama palvelu koskaan avaa yhteytta sinne pain.
    return reply.send({ last_seq: await currentCursor() });
  });
}
