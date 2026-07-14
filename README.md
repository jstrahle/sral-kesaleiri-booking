# Radioamatöörien kesäleirin rekisteröintijärjestelmä

Kaksiosainen rekisteröintijärjestelmä leiritapahtumille: suojattu hallintapuoli ilmoittautumispisteille ja siitä arkkitehtuurisesti erotettu julkinen verkkopalvelu, joka näyttää vain kutsumerkit ja rekisteröitymishetket sekä reaaliaikaisen kävijälaskurin.

**Tieto kulkee vain yhteen suuntaan.** Julkinen palvelu ei koskaan kysy mitään hallintajärjestelmältä, eikä sillä ole pääsyä hallinnan tietokantaan. Se vastaanottaa vain julkaistavaksi tarkoitetut tiedot. Ks. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tila

Toteutus etenee vaiheittain. **Vaihe 1 (tämä) on valmis:** repositorion runko, tietokantaskeemat, migraatiot, konttiympäristö, HTTPS, CI ja dokumentaatio.

- [x] Vaihe 1 — runko, skeema, kontit, HTTPS, CI
- [ ] Vaihe 2 — kirjautuminen, roolit, rekisteröintinäkymä, duplikaattitarkistus, osallistujatyypit, outbox
- [ ] Vaihe 3 — synkronointi, julkinen luettelo, laskuri, SSE, `/wall`-näkymä
- [ ] Vaihe 4 — massatuonti, vienti, tilastot, auditointinäkymä, varmistukset

## Teknologiat

Node.js 22 · TypeScript · Fastify · PostgreSQL 17 · Nunjucks + HTMX · Caddy · Podman (Alpine-kontit)

Palvelinrenderöity käyttöliittymä on tietoinen valinta: ilmoittautumispisteellä ratkaisee näppäimistönopeus, ei selainsovelluksen hienous.

## Käyttöönotto

Vaatimukset: Fedora 41+ (testattu Fedora 44), `podman`, `podman-compose`, kaksi verkkotunnusta jotka osoittavat palvelimeen.

```bash
git clone <repo> && cd kesaleiri
cp .env.example .env
$EDITOR .env          # domainit, salasanat, salaisuudet

# Salaisuudet:
openssl rand -hex 32  # SYNC_SHARED_SECRET
openssl rand -hex 32  # SESSION_SECRET

podman compose up -d --build
podman compose logs -f
```

Migraatiot ajetaan automaattisesti konttien käynnistyessä. Caddy hankkii HTTPS-sertifikaatit Let's Encryptiltä, kunhan portit 80 ja 443 ovat auki ja DNS osoittaa oikein.

Kirjaudu hallintapuolelle osoitteessa `https://$ADMIN_DOMAIN` ympäristömuuttujilla `BOOTSTRAP_ADMIN_*` luodulla tunnuksella ja **vaihda salasana heti**.

## Kehitys

```bash
cd admin && npm install && npm run dev     # http://localhost:3000
cd public && npm install && npm run dev
npm test        # yksikkötestit
npm run typecheck
```

Aja `npm install` kummassakin hakemistossa ja **commitoi syntyvät `package-lock.json`-tiedostot** — CI ja konttien rakennus käyttävät niitä.

Riippuvuudet pidetään ajan tasalla Dependabotilla, ja CI kaataa buildin, jos `npm audit` löytää vakavan haavoittuvuuden. Riippuvuuksia lisätään säästeliäästi: esimerkiksi salasanojen tiivistys käyttää Nodeen sisäänrakennettua scryptiä, ei ulkoista kirjastoa.

## Dokumentaatio

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — yksisuuntainen synkronointi, versiointi, tapahtumatyypit
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — varmistus, palautus, päivitys, vianetsintä
- [PRIVACY.md](PRIVACY.md) — mitä tietoja kerätään, mitä julkaistaan, säilytysajat
- [CONTRIBUTING.md](CONTRIBUTING.md)

## Lisenssi

MIT — ks. [LICENSE](LICENSE).
