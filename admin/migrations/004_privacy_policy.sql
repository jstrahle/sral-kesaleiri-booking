-- Tietosuojaseloste vapaana tekstina. Tallennetaan settings-tauluun samaan
-- tapaan kuin muutkin asetukset. Julkiselle puolelle se kulkee outboxin kautta
-- (privacy.set), joten julkinen palvelu ei kysy sita hallinnalta.
INSERT INTO settings (key, value) VALUES ('privacy_policy', '""'::jsonb)
    ON CONFLICT (key) DO NOTHING;
