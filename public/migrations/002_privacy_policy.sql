-- Julkiselle puolelle tyonnetty tietosuojaseloste. Vain yksi rivi.
CREATE TABLE privacy_policy (
    id       integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    content  text NOT NULL DEFAULT '',
    version  bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO privacy_policy (id, content, version) VALUES (1, '', 0);
