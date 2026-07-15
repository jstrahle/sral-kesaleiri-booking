-- Istunnot tietokannassa, ei muistissa: kontin uudelleenkaynnistys ei saa
-- kirjata ilmoittautumispisteita ulos kesken paivan.
CREATE TABLE sessions (
    sid         text PRIMARY KEY,
    data        jsonb NOT NULL,
    expires_at  timestamptz NOT NULL
);

CREATE INDEX sessions_expires_idx ON sessions (expires_at);
