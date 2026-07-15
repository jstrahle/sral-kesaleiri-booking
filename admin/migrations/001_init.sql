-- Hallintapuolen skeema.
-- Tama on rekisterin ainoa totuuden lahde. Julkinen palvelu ei kosketa tahan.

CREATE EXTENSION IF NOT EXISTS citext;

-- Globaali versiolaskuri. Jokainen julkaistava muutos saa kasvavan version,
-- jonka avulla julkinen puoli osaa hylata myohastyneet tai uudelleenlahetetyt
-- tapahtumat (ks. docs/ARCHITECTURE.md).
CREATE SEQUENCE version_seq;

-- --------------------------------------------------------------------------
-- Kayttajat
-- --------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('admin', 'staff');

CREATE TABLE users (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username         citext NOT NULL UNIQUE,
    display_name     text NOT NULL,
    password_hash    text NOT NULL,
    role             user_role NOT NULL DEFAULT 'staff',
    totp_secret      text,
    is_active        boolean NOT NULL DEFAULT true,
    failed_logins    integer NOT NULL DEFAULT 0,
    locked_until     timestamptz,
    last_login_at    timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Osallistujatyypit
-- --------------------------------------------------------------------------
CREATE TABLE participant_types (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL,
    description  text,
    fee_cents    integer NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
    is_active    boolean NOT NULL DEFAULT true,
    sort_order   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX participant_types_name_uniq ON participant_types (lower(name));

-- --------------------------------------------------------------------------
-- Rekisteroinnit
-- --------------------------------------------------------------------------
-- Osallistujatyyppia ei koskaan poisteta kovalla poistolla (spec 7):
-- ON DELETE RESTRICT + is_active-lippu pitaa vanhat rekisteroinnit ehjina.
CREATE TABLE registrations (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 text NOT NULL,
    callsign             text NOT NULL,
    callsign_normalized  text NOT NULL,
    participant_type_id  uuid NOT NULL REFERENCES participant_types(id) ON DELETE RESTRICT,
    hidden               boolean NOT NULL DEFAULT false,
    registered_by        uuid REFERENCES users(id) ON DELETE SET NULL,
    registered_at        timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    deleted_at           timestamptz,
    -- Massatuonnin idempotenssiavain (spec 11): sama rivi samasta aineistosta
    -- ei luo toista rekisterointia.
    import_key           text,
    version              bigint NOT NULL DEFAULT nextval('version_seq')
);

-- Kutsumerkin yksilollisyys (spec 9). Vain elavat rivit lasketaan mukaan,
-- jotta poistetun kutsumerkin voi rekisteroida uudelleen.
CREATE UNIQUE INDEX registrations_callsign_uniq
    ON registrations (callsign_normalized)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX registrations_import_key_uniq
    ON registrations (import_key)
    WHERE import_key IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX registrations_registered_at_idx ON registrations (registered_at DESC);
CREATE INDEX registrations_type_idx ON registrations (participant_type_id);

-- Jokainen kirjoitus nostaa version automaattisesti.
CREATE FUNCTION bump_version() RETURNS trigger AS $$
BEGIN
    NEW.version := nextval('version_seq');
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER registrations_bump_version
    BEFORE INSERT OR UPDATE ON registrations
    FOR EACH ROW EXECUTE FUNCTION bump_version();

-- --------------------------------------------------------------------------
-- Asetukset
-- --------------------------------------------------------------------------
CREATE TABLE settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
    -- Estetaanko duplikaatti kokonaan (true) vai sallitaanko adminin ohitus (false)
    ('duplicate_hard_block', 'true'::jsonb),
    ('event_name', '"Radioamatoorien kesaleiri"'::jsonb),
    -- Vieraskutsujen etuliite silloin kun osallistujalla ei ole omaa kutsua
    ('guest_callsign_prefix', '"VIERAS"'::jsonb);

-- --------------------------------------------------------------------------
-- Auditointiloki (spec 14) - lisayksia vain, ei muutoksia kayttoliittymasta
-- --------------------------------------------------------------------------
CREATE TABLE audit_log (
    id          bigserial PRIMARY KEY,
    at          timestamptz NOT NULL DEFAULT now(),
    user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
    username    text,
    action      text NOT NULL,
    entity      text,
    entity_id   text,
    details     jsonb,
    ip          inet
);

CREATE INDEX audit_log_at_idx ON audit_log (at DESC);

CREATE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Auditointilokia ei voi muuttaa eika poistaa';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- --------------------------------------------------------------------------
-- Outbox: ainoa tie julkiselle puolelle
-- --------------------------------------------------------------------------
-- Kirjoitetaan samassa transaktiossa kuin itse muutos. Erillinen tyontaja
-- lahettaa rivit julkiselle palvelulle ja merkitsee ne toimitetuiksi.
CREATE TABLE outbox (
    seq           bigserial PRIMARY KEY,
    event_id      uuid NOT NULL DEFAULT gen_random_uuid(),
    type          text NOT NULL,
    payload       jsonb NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    delivered_at  timestamptz,
    attempts      integer NOT NULL DEFAULT 0,
    last_error    text
);

CREATE INDEX outbox_undelivered_idx ON outbox (seq) WHERE delivered_at IS NULL;
