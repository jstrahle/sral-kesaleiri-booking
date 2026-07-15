-- Jarjestelmatyyppi "Ei kohdistettu". Kaytetaan massatuonnissa riveille, joiden
-- summaa ei voida yksikasitteisesti kohdistaa nakyvaan osallistujatyyppiin
-- (tuntematon hinta TAI useampi samanhintainen tyyppi).
--
-- is_system = true tarkoittaa: ei nay tyyppien hallinnassa eika
-- rekisterointilomakkeella, ei muokattavissa eika poistettavissa. Listauksissa
-- ja raporteissa se kasitellaan kuin normaali tyyppi. Hinta 0, jotta tuntematon
-- summa ei vaarista maksukertymaa.
ALTER TABLE participant_types
    ADD COLUMN is_system boolean NOT NULL DEFAULT false;

INSERT INTO participant_types (name, description, fee_cents, is_active, sort_order, is_system)
VALUES ('Ei kohdistettu', 'Massatuonnin rivi, jonka maksua ei voitu kohdistaa tyyppiin', 0, true, 1000, true);
