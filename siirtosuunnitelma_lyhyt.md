# InternHub — Siirto oppilaitoksen palvelimille (lyhyt kuvaus)

**Päivämäärä:** 2026-05-04

---

## Mikä on tilanne nyt

InternHub on staattinen verkkosivusto (HTML/CSS/JavaScript), joka käyttää **Supabasea** kolmeen asiaan:

- **Tietokanta** — kaikki sovelluksen tieto (käyttäjät, yritykset, harjoittelupaikat, hakemukset, suosikit jne.) tallennetaan Supabasen hallinnoimaan PostgreSQL-tietokantaan. Tauluja on 13.
- **Autentikointi** — kirjautuminen, rekisteröityminen, salasanan palautus sähköpostitse ja sosiaalinen kirjautuminen (Google, GitHub, LinkedIn) ovat täysin Supabasen vastuulla.
- **Tiedostotallennus** — opiskelijoiden CV-tiedostot tallennetaan Supabasen pilvitallennukseen.

Tällä hetkellä sovelluksessa **ei ole omaa palvelinta ollenkaan**. Selain kommunikoi suoraan Supabasen kanssa. Siirto tarkoittaa, että kaikki tämä toiminnallisuus täytyy rakentaa uudelleen oppilaitoksen palvelimelle.

---

## Miksi siirto on iso työ

Supabase tarjoaa automaattisesti asiat, joiden rakentaminen käsin vaatii merkittävästi aikaa:

- **Tietokannan REST API** — sovelluksessa on yli 50 tietokantakutsua (haut, lisäykset, päivitykset, poistot), jotka kaikki menevät tällä hetkellä suoraan Supabaseen. Nämä täytyy korvata omilla API-rajapinnoilla.
- **Autentikointi** — JWT-tokenien hallinta, salasanojen suojaus, sähköpostivahvistukset ja kolmen OAuth-palvelun integraatiot täytyy toteuttaa itse.
- **Sähköpostilähetys** — rekisteröintivahvistus ja salasanan palautus vaativat oman sähköpostipalvelun konfiguroinnin.
- **Tiedostojen tallennus** — CV-tiedostojen lataus ja hallinta täytyy toteuttaa palvelinpuolella.

---

## Mitä oppilaitokselta täytyy selvittää

```
1. Mikä käyttöjärjestelmä palvelimella on? (Linux suositeltavin)

2. Onko SSH-pääsy sudo/root-oikeuksilla mahdollinen?

3. Onko Docker asennettuna tai asennettavissa?
   → Tämä on tärkein kysymys — katso alla.

4. Paljonko RAM-muistia palvelimella on? (vähintään 2 GB)

5. Onko Node.js asennettuna? (vähintään versio 18)

6. Mikä domain tai alidomaini sivustolle tulee?
   (tarvitaan OAuth-kirjautumiseen)

7. Onko HTTPS (SSL) käytössä tai mahdollinen?
   (pakollinen — kirjautuminen ei toimi ilman sitä)

8. Onko oppilaitoksella SMTP-sähköpostipalvelin?
   (tarvitaan rekisteröintivahvistuksiin ja salasanan palautukseen)
```

---

## Kaksi mahdollista polkua

### Polku A — Docker on saatavilla → **1–3 päivää**
Voidaan asentaa Supabase oppilaitoksen omalle palvelimelle (se on avoimen lähdekoodin ohjelmisto). Koodiin ei tarvitse juurikaan koskea — muutetaan vain palvelimen osoite asetuksissa.

### Polku B — Docker ei ole saatavilla → **2–4 viikkoa**
Rakennetaan kokonaan oma backend Node.js-teknologialla: API-palvelin, autentikointi, sähköpostilähetys ja tiedostotallennus. Lisäksi kaikki frontendin Supabase-kutsut korvataan uusilla API-kutsuilla.

---

**Tärkein seuraava askel: selvitä onko Docker mahdollinen.**  
Se ratkaisee kaiken muun.
