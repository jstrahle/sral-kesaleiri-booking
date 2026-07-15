import type { FastifyInstance } from 'fastify';
import { requireAdmin, requireAuth } from '../auth.ts';
import { isValidCallsign, normalizeCallsign } from '../callsign.ts';
import { listActiveTypes } from '../participant-types.ts';
import {
  counts,
  create,
  findById,
  remove,
  search,
  suggestGuestCallsign,
  update,
} from '../registrations.ts';

interface RegistrationBody {
  name?: string;
  callsign?: string;
  participantTypeId?: string;
  hidden?: string;
}

function parse(body: RegistrationBody): { name: string; callsign: string; typeId: string; hidden: boolean } {
  return {
    name: (body.name ?? '').trim(),
    callsign: normalizeCallsign(body.callsign ?? ''),
    typeId: (body.participantTypeId ?? '').trim(),
    hidden: body.hidden === 'on',
  };
}

export function registerRegistrationRoutes(app: FastifyInstance): void {
  app.register(async (scope) => {
    scope.addHook('preHandler', requireAuth);

    /** Ilmoittautumispisteen paanakyma: syottolomake ja laskurit. */
    scope.get<{ Querystring: { ok?: string } }>('/', async (request, reply) => {
      const [types, count, latest] = await Promise.all([listActiveTypes(), counts(), search('', 8)]);

      return reply.view('registrations/new.njk', {
        user: request.session.user,
        types,
        counts: count,
        latest,
        form: null,
        error: null,
        duplicate: null,
        saved: request.query.ok ?? null,
      });
    });

    /** Kavijalaskuri selaimen pollausta varten - kavijat kysyvat tata jatkuvasti. */
    scope.get('/api/counts', async () => counts());

    /** Ehdottaa seuraavaa vapaata vieraskutsua (VIERAS1, VIERAS2, ...). */
    scope.get('/api/guest-callsign', async () => ({ callsign: await suggestGuestCallsign() }));

    scope.post<{ Body: RegistrationBody }>('/registrations', async (request, reply) => {
      const sessionUser = request.session.user;
      if (!sessionUser) return reply.redirect('/login');

      const input = parse(request.body);

      const render = async (
        error: string | null,
        duplicate: Awaited<ReturnType<typeof findById>> | null = null,
        code = 400,
      ) => {
        const [types, count, latest] = await Promise.all([
          listActiveTypes(),
          counts(),
          search('', 8),
        ]);

        return reply.code(code).view('registrations/new.njk', {
          user: sessionUser,
          types,
          counts: count,
          latest,
          form: input,
          error,
          duplicate,
          saved: null,
        });
      };

      if (!input.name) return render('Nimi puuttuu.');
      if (!isValidCallsign(input.callsign)) {
        return render(
          'Kutsumerkki puuttuu tai on virheellinen. Jos osallistujalla ei ole kutsumerkkia, kayta Vieras-painiketta.',
        );
      }
      if (!input.typeId) return render('Valitse osallistujatyyppi.');

      const result = await create({
        name: input.name,
        callsign: input.callsign,
        participantTypeId: input.typeId,
        hidden: input.hidden,
        userId: sessionUser.id,
        username: sessionUser.username,
        ip: request.ip,
      });

      if (result.status === 'duplicate') {
        // Kaksoiskappale estetaan (spec 9). Alkuperainen rekisterointi tarjotaan
        // avattavaksi, jotta virhe on korjattavissa saman tien.
        return render(null, result.existing, 409);
      }

      return reply.redirect('/?ok=' + encodeURIComponent(result.registration.callsign));
    });

    scope.get<{ Querystring: { q?: string } }>('/registrations', async (request, reply) => {
      const query = request.query.q ?? '';

      return reply.view('registrations/list.njk', {
        user: request.session.user,
        query,
        results: await search(query),
        counts: await counts(),
      });
    });

    scope.get<{ Params: { id: string } }>('/registrations/:id', async (request, reply) => {
      const target = await findById(request.params.id);
      if (!target) return reply.callNotFound();

      return reply.view('registrations/edit.njk', {
        user: request.session.user,
        target,
        types: await listActiveTypes(),
        error: null,
      });
    });

    scope.post<{ Params: { id: string }; Body: RegistrationBody }>(
      '/registrations/:id',
      async (request, reply) => {
        const sessionUser = request.session.user;
        if (!sessionUser) return reply.redirect('/login');

        const target = await findById(request.params.id);
        if (!target) return reply.callNotFound();

        const input = parse(request.body);

        const renderError = async (error: string) =>
          reply.code(400).view('registrations/edit.njk', {
            user: sessionUser,
            target,
            types: await listActiveTypes(),
            error,
          });

        if (!input.name) return renderError('Nimi puuttuu.');
        if (!isValidCallsign(input.callsign)) return renderError('Kutsumerkki on virheellinen.');
        if (!input.typeId) return renderError('Valitse osallistujatyyppi.');

        const result = await update(target.id, {
          name: input.name,
          callsign: input.callsign,
          participantTypeId: input.typeId,
          hidden: input.hidden,
          userId: sessionUser.id,
          username: sessionUser.username,
          ip: request.ip,
        });

        if (result.status === 'duplicate') {
          return renderError(
            `Kutsumerkki ${input.callsign} on jo rekisteroity nimelle ${result.existing.name}.`,
          );
        }

        return reply.redirect('/registrations');
      },
    );

    /** Poisto on vain paakayttajalle (spec 4.2: kayttaja ei poista rekisterointeja). */
    scope.post<{ Params: { id: string } }>(
      '/registrations/:id/delete',
      { preHandler: requireAdmin },
      async (request, reply) => {
        const sessionUser = request.session.user;
        if (!sessionUser) return reply.redirect('/login');

        await remove(request.params.id, {
          userId: sessionUser.id,
          username: sessionUser.username,
          ip: request.ip,
        });

        return reply.redirect('/registrations');
      },
    );
  });
}
