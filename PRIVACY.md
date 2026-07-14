# Tietosuoja

Tämä on kehittäjien tarkistuslista ja pohja tapahtuman järjestäjän tietosuojaselosteelle. Se ei ole oikeudellinen neuvo — järjestävä yhdistys vastaa selosteen sisällöstä.

## Mitä tietoja kerätään

| Tieto | Missä | Julkaistaanko |
|---|---|---|
| Nimi | vain hallintapuoli | **ei koskaan** |
| Kutsumerkki | hallintapuoli + julkinen palvelu | kyllä, ellei osallistuja ole merkitty piilotetuksi |
| Osallistujatyyppi ja maksu | vain hallintapuoli | ei |
| Rekisteröintihetki | hallintapuoli + julkinen palvelu | kyllä, samoin ehdoin kuin kutsumerkki |
| Rekisteröinnin tehnyt käyttäjä | vain hallintapuoli (auditointi) | ei |

Julkinen kävijälaskuri sisältää myös piilotetut osallistujat, mutta se on pelkkä lukumäärä, ei henkilötietoa.

## Käsittelyperuste ja huomiot

Kutsumerkki on tunniste, jonka Traficom yhdistää julkisessa rekisterissään henkilön nimeen. Vaikka tämä järjestelmä ei julkaise nimiä, kutsumerkin julkaisu on siis henkilötiedon käsittelyä. Käsittelyperusteena on tapahtuman järjestäminen ja osallistujaluettelon julkaiseminen (oikeutettu etu); osallistuja voi aina valita "ei näytetä julkisesti".

## Osallistujan oikeudet

- **Julkaisematta jättäminen:** rekisteröinnin yhteydessä valittava "Ei näytetä julkisesti". Voidaan asettaa myös jälkikäteen, jolloin rivi poistetaan julkiselta palvelulta automaattisesti.
- **Oikaisu:** virheellinen tieto korjataan hallintapuolelta; korjaus välittyy julkiselle palvelulle.
- **Poisto:** admin poistaa rekisteröinnin, jolloin se katoaa myös julkiselta puolelta.

## Säilytysajat

Täytettävä ennen tapahtumaa:

- Rekisteröintitiedot: säilytetään `___` kuukautta tapahtuman jälkeen, minkä jälkeen poistetaan.
- Varmuuskopiot: `BACKUP_RETENTION_DAYS` (oletus 14 vrk).
- Auditointiloki: säilytetään `___` kuukautta.

## Rekisterinpitäjä

Täytettävä: yhdistyksen nimi, yhteyshenkilö, sähköpostiosoite.
