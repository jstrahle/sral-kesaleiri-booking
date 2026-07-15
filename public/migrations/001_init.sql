-- Julkisen palvelun skeema.
--
-- Tama tietokanta sisaltaa VAIN julkaistavaksi tarkoitetut tiedot:
-- kutsumerkin ja rekisterointihetken. Ei nimia, ei osallistujatyyppeja,
-- ei maksuja, ei kayttajia, ei piilotettuja osallistujia.
--
-- Rivit saapuvat ainoastaan hallintapuolen tyontamina (POST /internal/sync).
-- Tama palvelu ei koskaan avaa yhteytta hallintapuolelle.

CREATE TABLE registrations (
    id                   uuid PRIMARY KEY,
    callsign             text NOT NULL,
    callsign_normalized  text NOT NULL,
    registered_at        timestamptz NOT NULL,
    version              bigint NOT NULL
);

CREATE INDEX registrations_search_idx ON registrations (callsign_normalized);
CREATE INDEX registrations_registered_at_idx ON registrations (registered_at DESC);

-- Hautakivet: estavat poistetun rivin heraamisen henkiin, jos vanha
-- upsert-tapahtuma saapuu uudelleenlahetyksena poiston jalkeen.
CREATE TABLE tombstones (
    id       uuid PRIMARY KEY,
    version  bigint NOT NULL,
    at       timestamptz NOT NULL DEFAULT now()
);

-- Tilastot, esim. total_count. Sisaltaa MYOS piilotetut osallistujat:
-- luku vastaa kysymykseen "kuinka monta kavijaa leirilla on".
CREATE TABLE stats (
    key      text PRIMARY KEY,
    value    bigint NOT NULL,
    version  bigint NOT NULL
);

INSERT INTO stats (key, value, version) VALUES ('total_count', 0, 0);

-- Viimeksi kasitelty outbox-sekvenssi. Palautetaan hallintapuolelle
-- synkronointipyynnon VASTAUKSESSA - ei erillisena kyselyna.
CREATE TABLE sync_cursor (
    id        integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_seq  bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sync_cursor (id, last_seq) VALUES (1, 0);
