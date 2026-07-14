# Ylläpito

Alusta: Fedora 44, Podman, kontit ajossa root-käyttäjällä. SELinux on päällä, joten kaikki volyymikiinnitykset käyttävät `:Z`-lippua — älä poista niitä, tai kontit eivät saa kirjoitusoikeutta.

## Päivittäiset komennot

```bash
podman compose ps                 # tila
podman compose logs -f admin      # lokit
podman compose logs -f public
podman compose restart admin      # uudelleenkäynnistys
```

Terveystarkistukset: `https://$ADMIN_DOMAIN/healthz` ja `https://$PUBLIC_DOMAIN/healthz`.

## Varmuuskopiot

`backup`-kontti ajaa `pg_dump`-varmistuksen hallinnan tietokannasta tunnin välein `backups`-volyymille ja poistaa `BACKUP_RETENTION_DAYS`-päivää vanhemmat.

Julkista tietokantaa **ei tarvitse varmistaa**: se on johdannainen, ja se voidaan aina rakentaa uudelleen hallintapuolen aineistosta.

```bash
# Listaa varmuuskopiot
podman compose exec backup ls -lh /backups

# Kopioi varmuuskopio pois palvelimelta (tee tämä säännöllisesti!)
podman volume export kesaleiri_backups --output backups-$(date +%F).tar
```

Volyymi samalla koneella ei ole varmuuskopio. Vie kopiot pois palvelimelta.

## Palautus

```bash
podman compose stop admin
gunzip -c /polku/admin-20260714-120000.sql.gz \
  | podman compose exec -T admin-db psql -U "$ADMIN_DB_USER" -d "$ADMIN_DB_NAME"
podman compose start admin
```

Palautuksen jälkeen julkinen puoli voi olla jäljessä. Aja täysi uudelleenjulkaisu, joka lähettää koko julkaistavan aineiston outboxin kautta uudelleen:

```bash
podman compose exec admin node dist/resync.js    # (vaihe 3)
```

Tämä on turvallista milloin tahansa: versiointi estää duplikaatit ja vanhentuneiden tietojen palautumisen.

**Palautus on testattava ennen leiriä.** Palautus, jota ei ole kokeiltu, ei ole palautus.

## Päivitys

```bash
git pull
podman compose up -d --build
```

Migraatiot ajetaan automaattisesti käynnistyksessä. Ota varmuuskopio ennen päivitystä.

## Vianetsintä

**Sertifikaatit eivät nouse.** Tarkista että portit 80 ja 443 ovat auki ja DNS osoittaa palvelimeen. `podman compose logs caddy`. Let's Encryptin rajoitukset iskevät nopeasti — testaa tarvittaessa staging-ympäristöä vastaan.

**Julkinen puoli jäljessä.** Katso toimittamattomat outbox-rivit:

```bash
podman compose exec admin-db psql -U "$ADMIN_DB_USER" -d "$ADMIN_DB_NAME" \
  -c "SELECT seq, type, attempts, last_error FROM outbox WHERE delivered_at IS NULL ORDER BY seq LIMIT 20;"
```

Jos `last_error` viittaa allekirjoitukseen, `SYNC_SHARED_SECRET` eroaa palveluiden välillä. Työntö yrittää uudelleen automaattisesti; toimittamattomat rivit eivät katoa.

**Kirjautuminen ei onnistu.** Tili lukkiutuu epäonnistuneiden yritysten jälkeen. Avaus:

```bash
podman compose exec admin-db psql -U "$ADMIN_DB_USER" -d "$ADMIN_DB_NAME" \
  -c "UPDATE users SET failed_logins = 0, locked_until = NULL WHERE username = 'nimi';"
```

**Levy täyttyy.** Yleensä varmuuskopiot tai Caddyn lokit. Tarkista `podman system df`.
