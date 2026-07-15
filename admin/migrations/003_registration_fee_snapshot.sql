-- Osallistumismaksu tallennetaan rekisteroinnille sellaisena kuin se oli
-- rekisterointihetkella. Jos tyypin hintaa muutetaan kesken leirin, jo kirjattujen
-- osallistujien maksut eivat muutu takautuvasti - maksukertyma vastaa sita, mita
-- kassaan on oikeasti tullut.
ALTER TABLE registrations
    ADD COLUMN fee_cents integer NOT NULL DEFAULT 0 CHECK (fee_cents >= 0);

-- Nimihaku ilmoittautumispisteella
CREATE INDEX registrations_name_idx ON registrations (lower(name));
