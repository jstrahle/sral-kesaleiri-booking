import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.ts';
import { requireAdmin } from '../auth.ts';
import {
  createUser,
  findById,
  listUsers,
  setPassword,
  unlockUser,
  updateUser,
  type UserRole,
} from '../users.ts';

const MIN_PASSWORD_LENGTH = 12;

function parseRole(value: unknown): UserRole {
  return value === 'admin' ? 'admin' : 'staff';
}

interface UserBody {
  username?: string;
  displayName?: string;
  password?: string;
  role?: string;
  isActive?: string;
}

export function registerUserRoutes(app: FastifyInstance): void {
  app.register(async (scope) => {
    scope.addHook('preHandler', requireAdmin);

    scope.get('/users', async (request, reply) => {
      return reply.view('users/list.njk', {
        users: await listUsers(),
        user: request.session.user,
        message: null,
      });
    });

    scope.get('/users/new', async (request, reply) => {
      return reply.view('users/form.njk', {
        target: null,
        user: request.session.user,
        error: null,
      });
    });

    scope.post<{ Body: UserBody }>('/users', async (request, reply) => {
      const username = (request.body.username ?? '').trim();
      const displayName = (request.body.displayName ?? '').trim() || username;
      const password = request.body.password ?? '';
      const role = parseRole(request.body.role);

      const showError = (error: string) =>
        reply.code(400).view('users/form.njk', {
          target: null,
          user: request.session.user,
          error,
        });

      if (!username) return showError('Kayttajatunnus puuttuu.');
      if (password.length < MIN_PASSWORD_LENGTH) {
        return showError(`Salasanan on oltava vahintaan ${MIN_PASSWORD_LENGTH} merkkia.`);
      }

      try {
        const created = await createUser({ username, displayName, password, role });

        await audit({
          userId: request.session.user?.id,
          username: request.session.user?.username,
          action: 'user.create',
          entity: 'user',
          entityId: created.id,
          details: { username: created.username, role: created.role },
          ip: request.ip,
        });

        return reply.redirect('/users');
      } catch (error) {
        // 23505 = uniikkirajoite: kayttajatunnus on jo varattu
        if ((error as { code?: string }).code === '23505') {
          return showError('Kayttajatunnus on jo kaytossa.');
        }
        throw error;
      }
    });

    scope.get<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
      const target = await findById(request.params.id);
      if (!target) return reply.callNotFound();

      return reply.view('users/form.njk', {
        target,
        user: request.session.user,
        error: null,
      });
    });

    scope.post<{ Params: { id: string }; Body: UserBody }>('/users/:id', async (request, reply) => {
      const target = await findById(request.params.id);
      if (!target) return reply.callNotFound();

      const isActive = request.body.isActive === 'on';
      const role = parseRole(request.body.role);
      const displayName = (request.body.displayName ?? '').trim() || target.username;

      // Admin ei voi vahingossa poistaa omia oikeuksiaan tai sulkea omaa tiliaan.
      const isSelf = target.id === request.session.user?.id;
      if (isSelf && (role !== 'admin' || !isActive)) {
        return reply.code(400).view('users/form.njk', {
          target,
          user: request.session.user,
          error: 'Et voi poistaa omia paakayttajaoikeuksiasi tai sulkea omaa tiliasi.',
        });
      }

      await updateUser(target.id, { displayName, role, isActive });

      await audit({
        userId: request.session.user?.id,
        username: request.session.user?.username,
        action: 'user.update',
        entity: 'user',
        entityId: target.id,
        details: { displayName, role, isActive },
        ip: request.ip,
      });

      return reply.redirect('/users');
    });

    scope.post<{ Params: { id: string }; Body: UserBody }>(
      '/users/:id/password',
      async (request, reply) => {
        const target = await findById(request.params.id);
        if (!target) return reply.callNotFound();

        const password = request.body.password ?? '';
        if (password.length < MIN_PASSWORD_LENGTH) {
          return reply.code(400).view('users/form.njk', {
            target,
            user: request.session.user,
            error: `Salasanan on oltava vahintaan ${MIN_PASSWORD_LENGTH} merkkia.`,
          });
        }

        await setPassword(target.id, password);

        // Salasanaa ei kirjata lokiin missaan muodossa.
        await audit({
          userId: request.session.user?.id,
          username: request.session.user?.username,
          action: 'user.password_reset',
          entity: 'user',
          entityId: target.id,
          ip: request.ip,
        });

        return reply.redirect('/users');
      },
    );

    scope.post<{ Params: { id: string } }>('/users/:id/unlock', async (request, reply) => {
      const target = await findById(request.params.id);
      if (!target) return reply.callNotFound();

      await unlockUser(target.id);

      await audit({
        userId: request.session.user?.id,
        username: request.session.user?.username,
        action: 'user.unlock',
        entity: 'user',
        entityId: target.id,
        ip: request.ip,
      });

      return reply.redirect('/users');
    });
  });
}
