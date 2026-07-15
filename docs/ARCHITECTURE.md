# Arkkitehtuuri

## Periaate: tieto kulkee vain yhteen suuntaan

Järjestelmä koostuu kahdesta erillisestä palvelusta, joilla on omat tietokantansa:

| | Hallintapuoli | Julkinen palvelu |
|---|---|---|
| Verkkotunnus | `ADMIN_DOMAIN` | `PUBLIC_DOMAIN` |
| Tietokanta | `admin-db` | `public-db` |
| Verkko | `admin-net` + `edge-net` | `public-net` + `edge-net` |
| Sisältö | koko rekisteri | vain kutsumerkki + rekisteröintihetki |

Julkinen palvelu **ei koskaan avaa yhteyttä hallintapuolelle**. Se ei tiedä hallinnan tietokannan olemassaolosta, eikä sillä ole verkkoreittiä sinne (`admin-net` on `internal: true` eikä julkinen palvelu ole siinä). Kaikki tieto tulee hallintapuolen työntämänä.

Käytännön seuraus: julkisen palvelun täydellinenkään murto ei paljasta osallistujien nimiä, osallistujatyyppejä, maksuja, käyttäjiä eikä piilotettuja osallistujia. Niitä ei yksinkertaisesti ole siellä.

## Synkronointi

### 1. Outbox

Jokainen julkaisuun vaikuttava muutos kirjoitetaan **samassa tietokantatransaktiossa** kuin itse muutos:

```
BEGIN;
  INSERT INTO registrations (...);
  INSERT INTO outbox (type, payload) VALUES ('registration.upsert', ...);
  INSERT INTO outbox (type, payload) VALUES ('stats.set', ...);
COMMIT;
```

Näin ei voi syntyä tilannetta, jossa rekisteröinti tallentuu mutta julkaisutapahtuma katoaa — tai päinvastoin.

### 2. Työntö

Taustaprosessi hallintapuolella lukee toimittamattomat outbox-rivit ja lähettää ne:

```
POST http://public:3000/internal/sync
X-Sync-Timestamp: <unix-aika>
X-Sync-Signature: HMAC-SHA256(SYNC_SHARED_SECRET, timestamp + "." + body)

{ "events": [ { "seq": 42, "type": "registration.upsert", "payload": { ... } } ] }
```

Vastaus:

```
{ "last_seq": 42 }
```

Julkinen palvelu kertoo vastauksessa, mihin asti se on ehtinyt. Näin hallintapuoli tietää, mitä pitää lähettää uudelleen — **ilman että julkisen palvelun tarvitsee kysyä mitään**. Kuittaus kulkee HTTP-vastauksessa, ei uutena yhteytenä.

Vanhentuneet allekirjoitukset (yli 5 min) hylätään, joten kaapattua pyyntöä ei voi toistaa myöhemmin.

### 3. Versiointi: uudelleenlähetys ei riko mitään

Toimitus on *vähintään kerran* (at-least-once), joten sama tapahtuma voi saapua kahdesti, ja verkkovirheiden jälkeen tapahtumat voivat saapua eri järjestyksessä kuin ne syntyivät.

Ratkaisu: jokainen rekisteröinti kantaa `version`-numeroa, joka nousee globaalista `version_seq`-sekvenssistä joka kerta kun riviä muutetaan. Julkinen palvelu soveltaa tapahtuman **vain jos sen versio on uudempi** kuin tallennettu:

```sql
INSERT INTO registrations (...) VALUES (...)
ON CONFLICT (id) DO UPDATE SET ... WHERE registrations.version < EXCLUDED.version;
```

Poistot kirjataan `tombstones`-tauluun versioineen, jotta myöhässä saapuva vanha `upsert` ei herätä poistettua riviä henkiin.

Tämä tekee koko putkesta idempotentin: sama aineisto voidaan lähettää uudelleen vaikka sata kertaa, lopputulos on sama.

### Tapahtumatyypit

| Tyyppi | Milloin | Vaikutus julkisella puolella |
|---|---|---|
| `registration.upsert` | luonti tai muokkaus, kun `hidden = false` | rivi lisätään tai päivitetään |
| `registration.remove` | poisto **tai** kun `hidden` vaihtuu todeksi | rivi poistetaan, hautakivi kirjataan |
| `stats.set` | jokaisen rekisteröinnin muutoksen yhteydessä | laskurin arvo päivittyy |

Nimen korjaus ei tuota julkiselle puolelle mitään — nimeä ei siellä ole. Kutsumerkin korjaus tuottaa `registration.upsert`-tapahtuman samalla `id`:llä, joten julkinen rivi korjaantuu paikallaan.

## Laskuri ja piilotetut osallistujat

`stats.set` sisältää **kaikkien** rekisteröityneiden lukumäärän, myös piilotettujen. Luku vastaa kysymykseen "kuinka monta kävijää leirillä on", eikä se ole henkilötietoa. Piilotettu osallistuja ei silti ilmesty luetteloon, hakuun eikä mihinkään muuhun näkymään.

Sama luku näytetään ilmoittautumispisteiden käyttäjille hallintapuolella, joten henkilökunnan ja seinänäytön luvut täsmäävät aina.

## Reaaliaikaisuus

Julkinen palvelu lähettää selaimille Server-Sent Events -kanavaa (`GET /events`) pitkin päivitykset laskurista ja uusista kutsumerkeistä. SSE on yksisuuntainen (palvelin → selain), toimii tavallisen HTTPS:n yli ja selviää käänteisproxyn läpi, kun puskurointi kytketään pois (`flush_interval -1` Caddyfilessa).

Huomaa suunta: selain ei kysele, palvelin työntää. Sama periaate kuin hallintapuolen ja julkisen palvelun välillä.

## Miksi ei jaettua tietokantaa tai lukureplikaa

Lukureplika olisi yksinkertaisempi, mutta se rikkoisi vaatimuksen: replikaan valuisi koko rekisteri, myös nimet ja piilotetut osallistujat. Suodatus tapahtuisi vasta sovelluskerroksessa, eli yksi virheellinen SQL-kysely riittäisi vuotoon. Nyt vuoto ei ole mahdollinen, koska tietoa ei ole olemassa julkisella puolella.

## Myöhempi siirto omalle palvelimelle

Julkinen palvelu voidaan siirtää eri koneelle tai DMZ-verkkoon muuttamatta koodia: hallintapuolen `PUBLIC_SYNC_URL` osoittamaan uuteen osoitteeseen ja palomuuri sallimaan vain lähtevä yhteys hallinnasta julkiselle. Mitään paluuyhteyttä ei tarvitse avata. Jaettu salaisuus kannattaa silloin korvata mTLS:llä.
