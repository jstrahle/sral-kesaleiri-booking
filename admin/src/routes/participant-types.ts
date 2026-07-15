import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.ts';
import { requireAdmin } from '../auth.ts';
import { parseFeeToCents } from '../money.ts';
import {
  createType,
  deleteType,
  findType,
  listTypes,
  setActive,
  updateType,
  type TypeInput,
} from '../participant-types.ts';

interface TypeBody {
  name?: string;
  description?: string;
  fee?: string;
  isActive?: string;
  sortOrder?: string;
}

type ParsedInput = { ok: true; value: TypeInput } | { ok: false; error: string };

function parseBody(body: TypeBody): ParsedInput {
  const name = (body.name ?? '').trim();
  if (!name) return { ok: false, error: 'Nimi puuttuu.' };

  const feeCents = parseFeeToCents(body.fee ?? '');
  if (feeCents === null) {
    return { ok: false, error: 'Osallistumismaksu on virheellinen. Esimerkiksi: 25 tai 12,50' };
  }

  const description = (body.description ?? '').trim();
  const sortOrder = Number.parseInt(body.sortOrder ?? '0', 10);

  return {
    ok: true,
    value: {
      name,
      description: description === '' ? null : description,
      feeCents,
      isActive: body.isActive === 'on',
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    },
  };
}

export function registerParticipantTypeRoutes(app: FastifyInstance): void {
  app.register(async (scope) => {
    scope.addHook('preHandler', requireAdmin);

    scope.get<{ Querystring: { viesti?: string } }>('/types', async (request, reply) => {
      return reply.view('types/list.njk', {
        types: await listTypes(),
        user: request.session.user,
        message: request.query.viesti ?? null,
      });
    });

    scope.get('/types/new', async (request, reply) => {
      return reply.view('types/form.njk', {
        target: null,
        user: request.session.user,
        error: null,
      });
    });

    scope.post<{ Body: TypeBody }>('/types', async (request, reply) => {
      const parsed = parseBody(request.body);

      if (!parsed.ok) {
        return reply.code(400).view('types/form.njk', {
          target: null,
          user: request.session.user,
          error: parsed.error,
        });
      }

      try {
        const created = await createType(parsed.value);

        await audit({
          userId: request.session.user?.id,
          username: request.session.user?.username,
          action: 'participant_type.create',
          entity: 'participant_type',
          entityId: created.id,
          details: { name: created.name, feeCents: created.fee_cents },
          ip: request.ip,
        });

        return reply.redirect('/types');
      } catch (error) {
        // 23505 = uniikkirajoite nimelle
        if ((error as { code?: string }).code === '23505') {
          return reply.code(400).view('types/form.njk', {
            target: null,
            user: request.session.user,
            error: 'Samanniminen osallistujatyyppi on jo olemassa.',
          });
        }
        throw error;
      }
    });

    scope.get<{ Params: { id: string } }>('/types/:id', async (request, reply) => {
      const target = await findType(request.params.id);
      if (!target) return reply.callNotFound();

      return reply.view('types/form.njk', {
        target,
        user: request.session.user,
        error: null,
      });
    });

    scope.post<{ Params: { id: string }; Body: TypeBody }>('/types/:id', async (request, reply) => {
      const target = await findType(request.params.id);
      if (!target) return reply.callNotFound();

      const parsed = parseBody(request.body);
      if (!parsed.ok) {
        return reply.code(400).view('types/form.njk', {
          target,
          user: request.session.user,
          error: parsed.error,
        });
      }

      await updateType(target.id, parsed.value);

      // Hinnan muutos ei muuta aiempien rekisterointien maksuja takautuvasti:
      // ne on jo peritty leirilla. Kirjataan silti lokiin, jotta muutos nakyy.
      await audit({
        userId: request.session.user?.id,
        username: request.session.user?.username,
        action: 'participant_type.update',
        entity: 'participant_type',
        entityId: target.id,
        details: {
          name: parsed.value.name,
          feeCentsBefore: target.fee_cents,
          feeCentsAfter: parsed.value.feeCents,
          isActive: parsed.value.isActive,
        },
        ip: request.ip,
      });

      return reply.redirect('/types');
    });

    scope.post<{ Params: { id: string }; Body: { isActive?: string } }>(
      '/types/:id/active',
      async (request, reply) => {
        const target = await findType(request.params.id);
        if (!target) return reply.callNotFound();

        const isActive = request.body.isActive === 'on';
        await setActive(target.id, isActive);

        await audit({
          userId: request.session.user?.id,
          username: request.session.user?.username,
          action: isActive ? 'participant_type.activate' : 'participant_type.deactivate',
          entity: 'participant_type',
          entityId: target.id,
          details: { name: target.name },
          ip: request.ip,
        });

        return reply.redirect('/types');
      },
    );

    scope.post<{ Params: { id: string } }>('/types/:id/delete', async (request, reply) => {
      const target = await findType(request.params.id);
      if (!target) return reply.callNotFound();

      const result = await deleteType(target.id);

      if (result === 'in_use') {
        // Tietokanta esti poiston: tyyppiin viittaa rekisterointeja.
        return reply.redirect(
          '/types?viesti=' +
            encodeURIComponent(
              'Tyyppia ei voi poistaa, koska siihen on rekisteroity osallistujia. Merkitse se sen sijaan ei-aktiiviseksi.',
            ),
        );
      }

      await audit({
        userId: request.session.user?.id,
        username: request.session.user?.username,
        action: 'participant_type.delete',
        entity: 'participant_type',
        entityId: target.id,
        details: { name: target.name },
        ip: request.ip,
      });

      return reply.redirect('/types');
    });
  });
}
