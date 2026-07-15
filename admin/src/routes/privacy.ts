import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.ts';
import { requireAdmin } from '../auth.ts';
import { withTransaction } from '../db.ts';
import { emitPrivacyPolicy } from '../outbox.ts';
import { getPrivacyPolicy } from '../settings.ts';

const MAX_LENGTH = 50_000;

interface PolicyBody {
  content?: string;
}

export function registerPrivacyRoutes(app: FastifyInstance): void {
  app.register(async (scope) => {
    scope.addHook('preHandler', requireAdmin);

    scope.get<{ Querystring: { tallennettu?: string } }>(
      '/privacy',
      async (request, reply) => {
        return reply.view('privacy/edit.njk', {
          user: request.session.user,
          content: await getPrivacyPolicy(),
          saved: request.query.tallennettu === '1',
          error: null,
        });
      },
    );

    scope.post<{ Body: PolicyBody }>('/privacy', async (request, reply) => {
      const content = (request.body.content ?? '').trim();

      if (content.length > MAX_LENGTH) {
        return reply.code(400).view('privacy/edit.njk', {
          user: request.session.user,
          content,
          saved: false,
          error: `Teksti on liian pitka (yli ${MAX_LENGTH} merkkia).`,
        });
      }

      // Tallennus ja julkaisu samassa transaktiossa: joko molemmat tai ei kumpikaan.
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE settings SET value = $1::jsonb, updated_at = now() WHERE key = 'privacy_policy'`,
          [JSON.stringify(content)],
        );
        await emitPrivacyPolicy(client, content);
        await audit(
          {
            userId: request.session.user?.id,
            username: request.session.user?.username,
            action: 'privacy_policy.update',
            entity: 'settings',
            entityId: 'privacy_policy',
            details: { length: content.length },
            ip: request.ip,
          },
          client,
        );
      });

      return reply.redirect('/privacy?tallennettu=1');
    });
  });
}
