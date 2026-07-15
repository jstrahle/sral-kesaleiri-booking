import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.ts';
import { requireAuth } from '../auth.ts';
import { verifyPassword } from '../password.ts';
import { findById, setPassword } from '../users.ts';

const MIN_PASSWORD_LENGTH = 12;

interface PasswordBody {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

/** Oman salasanan vaihto - myos ilmoittautumispisteen kayttajalle. */
export function registerProfileRoutes(app: FastifyInstance): void {
  app.get('/profile', { preHandler: requireAuth }, async (request, reply) => {
    return reply.view('profile.njk', { user: request.session.user, error: null, done: false });
  });

  app.post<{ Body: PasswordBody }>(
    '/profile/password',
    { preHandler: requireAuth },
    async (request, reply) => {
      const sessionUser = request.session.user;
      if (!sessionUser) return reply.redirect('/login');

      const showError = (error: string) =>
        reply.code(400).view('profile.njk', { user: sessionUser, error, done: false });

      const user = await findById(sessionUser.id);
      if (!user) return reply.redirect('/login');

      const current = request.body.currentPassword ?? '';
      const next = request.body.newPassword ?? '';
      const confirm = request.body.confirmPassword ?? '';

      if (!(await verifyPassword(current, user.password_hash))) {
        return showError('Nykyinen salasana on vaarin.');
      }
      if (next.length < MIN_PASSWORD_LENGTH) {
        return showError(`Uuden salasanan on oltava vahintaan ${MIN_PASSWORD_LENGTH} merkkia.`);
      }
      if (next !== confirm) {
        return showError('Salasanat eivat tasmaa.');
      }

      await setPassword(user.id, next);

      await audit({
        userId: user.id,
        username: user.username,
        action: 'user.password_change',
        entity: 'user',
        entityId: user.id,
        ip: request.ip,
      });

      return reply.view('profile.njk', { user: sessionUser, error: null, done: true });
    },
  );
}
