# Osallistuminen kehitykseen

Kiitos kiinnostuksesta. Muutamia pelisääntöjä.

## Perusperiaatteet, joita ei rikota

1. **Julkinen palvelu ei koskaan avaa yhteyttä hallintapuolelle.** Jos muutos vaatisi julkiselta puolelta kyselyn hallintaan, se on väärä ratkaisu — mieti uudelleen.
2. **Julkiseen tietokantaan ei viedä muuta kuin kutsumerkki ja rekisteröintihetki.** Ei nimiä, ei osallistujatyyppejä, ei maksuja, ei piilotettuja osallistujia.
3. **Kaikki julkaisuun vaikuttavat muutokset kirjoitetaan outboxiin samassa transaktiossa** kuin itse muutos.
4. **Auditointilokia ei muuteta** — tietokanta estää sen triggerillä, älä kierrä sitä.
5. **Ei riippuvuuksia, joissa on tunnettuja haavoittuvuuksia.** CI ajaa `npm audit --audit-level=high`. Uusia riippuvuuksia lisätään vain, jos ne todella säästävät työtä.

## Käytännöt

- TypeScript, `strict`-tila päällä. Ei `any`-tyyppiä ilman perustelua.
- Uusi liiketoimintalogiikka tarvitsee yksikkötestin (Vitest).
- Tietokantamuutokset tehdään uutena migraatiotiedostona (`migrations/00N_kuvaus.sql`). Vanhoja migraatioita ei muokata.
- Commit-viestit suomeksi tai englanniksi, kunhan ne kertovat *miksi*.
- Ennen PR:ää: `npm run typecheck && npm test` kummassakin sovelluksessa.
