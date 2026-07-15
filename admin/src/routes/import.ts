import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../auth.ts';
import { commit, preview } from '../import.ts';

interface ImportBody {
  data?: string;
}

export function registerImportRoutes(app: FastifyInstance): void {
  app.register(async (scope) => {
    scope.addHook('preHandler', requireAdmin);

    scope.get('/import', async (request, reply) => {
      return reply.view('import/paste.njk', {
        user: request.session.user,
        error: null,
      });
    });

    /** Esikatselu: nayttaa mita tapahtuisi, ei tallenna mitaan. */
    scope.post<{ Body: ImportBody }>('/import/preview', async (request, reply) => {
      const data = request.body.data ?? '';

      if (data.trim() === '') {
        return reply.code(400).view('import/paste.njk', {
          user: request.session.user,
          error: 'Liitä ensin Excelistä kopioitu data.',
        });
      }

      const result = await preview(data);

      return reply.view('import/preview.njk', {
        user: request.session.user,
        preview: result,
        // Data kulkee piilokenttana tallennukseen, jotta esikatseltu ja
        // tallennettava aineisto on varmasti sama.
        data,
      });
    });

    /** Tallennus: tuo vain uudet rivit, idempotentisti. */
    scope.post<{ Body: ImportBody }>('/import/commit', async (request, reply) => {
      const sessionUser = request.session.user;
      if (!sessionUser) return reply.redirect('/login');

      const data = request.body.data ?? '';
      if (data.trim() === '') return reply.redirect('/import');

      const result = await commit(data, {
        userId: sessionUser.id,
        username: sessionUser.username,
        ip: request.ip,
      });

      return reply.view('import/done.njk', {
        user: sessionUser,
        result,
      });
    });
  });
}
