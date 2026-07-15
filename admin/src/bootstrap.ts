import { config } from './config.ts';
import { audit } from './audit.ts';
import { countUsers, createUser } from './users.ts';

/**
 * Luo ensimmaisen adminin ymparistomuuttujista, jos kayttajia ei ole yhtaan.
 * Ajetaan vain kerran: kun yksikin kayttaja on olemassa, tata ei tehda.
 */
export async function bootstrapAdmin(log: { info: (msg: string) => void; warn: (msg: string) => void }): Promise<void> {
  if ((await countUsers()) > 0) return;

  const { username, password } = config.bootstrap;
  if (!username || !password) {
    log.warn('Kayttajia ei ole eika BOOTSTRAP_ADMIN_* ole asetettu - kirjautuminen ei onnistu');
    return;
  }

  const user = await createUser({
    username,
    displayName: 'Paakayttaja',
    password,
    role: 'admin',
  });

  await audit({
    userId: user.id,
    username: user.username,
    action: 'user.bootstrap',
    entity: 'user',
    entityId: user.id,
  });

  log.info(`Ensimmainen admin luotu: ${username} - vaihda salasana heti kirjautumisen jalkeen`);
}
