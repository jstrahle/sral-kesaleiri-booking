import { withTransaction } from './db.ts';
import { emitPrivacyPolicy, emitTotalCount, emitUpsert, type PublishableRegistration } from './outbox.ts';
import { pool } from './db.ts';
import { getPrivacyPolicy } from './settings.ts';

/**
 * Taysi uudelleenjulkaisu: kirjoittaa outboxiin kaikki julkaistavat
 * rekisteroinnit ja laskurin nykyarvon.
 *
 * Kaytetaan tietokannan palautuksen jalkeen tai jos julkinen puoli on paassyt
 * ajautumaan pois tahdista. Turvallista ajaa milloin tahansa: julkinen puoli
 * soveltaa vain uudemmat versiot, joten duplikaatteja ei synny.
 *
 * Huom: tama ei poista julkiselta puolelta rivia, jota hallinnassa ei enaa ole.
 * Poistot ja piilotukset kulkevat omina remove-tapahtuminaan.
 */
export async function resync(): Promise<number> {
  return withTransaction(async (client) => {
    const result = await client.query<PublishableRegistration>(
      `SELECT id, callsign, callsign_normalized, registered_at, version::text AS version
       FROM registrations
       WHERE deleted_at IS NULL AND hidden = false
       ORDER BY registered_at`,
    );

    for (const row of result.rows) {
      await emitUpsert(client, row);
    }

    await emitPrivacyPolicy(client, await getPrivacyPolicy());
    await emitTotalCount(client);
    return result.rows.length;
  });
}

const isEntryPoint = process.argv[1]?.endsWith('resync.js') ?? false;

if (isEntryPoint) {
  resync()
    .then((count) => {
      console.log(`uudelleenjulkaisu: ${count} rekisterointia outboxiin`);
      return pool.end();
    })
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
