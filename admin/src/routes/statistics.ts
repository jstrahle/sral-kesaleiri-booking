import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../auth.ts';
import { byRange, byType, byUser, totals } from '../statistics.ts';

/** Palauttaa paivamaaran muodossa YYYY-MM-DD Suomen aikaa. */
function isoDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Europe/Helsinki' });
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface RangeQuery {
  alku?: string;
  loppu?: string;
}

export function registerStatisticsRoutes(app: FastifyInstance): void {
  app.register(async (scope) => {
    scope.addHook('preHandler', requireAdmin);

    scope.get<{ Querystring: RangeQuery }>('/stats', async (request, reply) => {
      const today = isoDate(new Date());

      // Oletusaikavali: kuluva paiva. Kayttaja voi valita toisen.
      const from = DATE_PATTERN.test(request.query.alku ?? '') ? request.query.alku! : today;
      const to = DATE_PATTERN.test(request.query.loppu ?? '') ? request.query.loppu! : today;

      const [total, types, users, range] = await Promise.all([
        totals(),
        byType(),
        byUser(),
        byRange(from, to),
      ]);

      return reply.view('statistics.njk', {
        user: request.session.user,
        total,
        types,
        users,
        range,
        from,
        to,
      });
    });
  });
}
