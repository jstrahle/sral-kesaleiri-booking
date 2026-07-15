import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { audit } from './audit.ts';
import { checkOrigin } from './origin-guard.ts';
import { verifyPassword } from './password.ts';
import {
  findByUsername,
  isLocked,
  LOCKOUT_MINUTES,
  recordFailedLogin,
  recordSuccessfulLogin,
} from './users.ts';

/**
 * Vaatii kirjautumisen. Kaikki kayttooikeustarkastukset tehdaan palvelimella
 * (spec 15) - kayttoliittyman piilotetut napit eivat ole suojaus.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.session.user) {
    await reply.redirect('/login');
  }
}

/** Vaatii admin-roolin. Ilmoittautumispisteen kayttaja ei paase nailla reiteille. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = request.session.user;
  if (!user) {
    await reply.redirect('/login');
    return;
  }
  if (user.role !== 'admin') {
    await reply.code(403).view('error.njk', {
      title: 'Ei oikeuksia',
      message: 'Tama toiminto on vain paakayttajille.',
      user,
    });
  }
}

/**
 * CSRF-suojaus ilman ulkoista kirjastoa: istuntoevaste on SameSite=strict,
 * ja lisaksi jokaisen muuttavan pyynnon Origin/Referer tarkistetaan.
 * Varsinainen paatoslogiikka on origin-guard.ts:ssa (testattavissa).
 */
export function originGuard(allowedHost: string | undefined) {
  return async function guard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const decision = checkOrigin(
      request.method,
      request.headers.origin,
      request.headers.referer,
      request.headers.host,
      allowedHost,
    );

    if (decision === 'allow') return;

    request.log.warn(
      {
        decision,
        origin: request.headers.origin ?? request.headers.referer,
        host: request.headers.host,
        configured: allowedHost,
      },
      'Origin-tarkistus hylkasi pyynnon',
    );
    await reply.code(403).send('Pyynnon alkupera ei kelpaa (CSRF-suojaus).');
  };
}

interface LoginBody {
  username?: string;
  password?: string;
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get('/login', async (request, reply) => {
    if (request.session.user) return reply.redirect('/');
    return reply.view('login.njk', { error: null });
  });

  app.post<{ Body: LoginBody }>(
    '/login',
    {
      config: {
        // Kirjautumisyritysten rajoitus IP-kohtaisesti, tilikohtaisen lukituksen lisaksi
        rateLimit: { max: 10, timeWindow: '5 minutes' },
      },
    },
    async (request, reply) => {
      const username = (request.body.username ?? '').trim();
      const password = request.body.password ?? '';
      const ip = request.ip;

      const fail = async (reason: string, message: string): Promise<FastifyReply> => {
        await audit({ action: 'login.failed', username, details: { reason }, ip });
        return reply.code(401).view('login.njk', { error: message });
      };

      if (!username || !password) {
        return fail('missing_fields', 'Anna kayttajatunnus ja salasana.');
      }

      const user = await findByUsername(username);

      // Sama viesti kaikissa tapauksissa: ei paljasteta onko tunnus olemassa.
      const genericError = 'Kayttajatunnus tai salasana on vaarin.';

      if (!user || !user.is_active) {
        return fail(user ? 'inactive' : 'unknown_user', genericError);
      }

      if (isLocked(user)) {
        return fail(
          'locked',
          `Tili on lukittu liian monen epaonnistuneen yrityksen vuoksi. Yrita uudelleen ${LOCKOUT_MINUTES} minuutin kuluttua tai pyyda paakayttajaa avaamaan tili.`,
        );
      }

      if (!(await verifyPassword(password, user.password_hash))) {
        const { locked } = await recordFailedLogin(user);
        return fail(
          locked ? 'locked_now' : 'bad_password',
          locked
            ? `Tili lukittiin ${LOCKOUT_MINUTES} minuutiksi liian monen epaonnistuneen yrityksen vuoksi.`
            : genericError,
        );
      }

      await recordSuccessfulLogin(user.id);

      // Uusi istuntotunniste kirjautumisen yhteydessa (session fixation -suojaus)
      await request.session.regenerate();
      request.session.user = {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      };

      await audit({
        userId: user.id,
        username: user.username,
        action: 'login',
        ip,
      });

      return reply.redirect('/');
    },
  );

  app.post('/logout', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.session.user;

    if (user) {
      await audit({
        userId: user.id,
        username: user.username,
        action: 'logout',
        ip: request.ip,
      });
    }

    await request.session.destroy();
    return reply.redirect('/login');
  });
}
