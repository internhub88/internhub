# InternHub — Siirtosuunnitelma oppilaitoksen palvelimille

**Päivämäärä:** 2026-05-04  
**Projekti:** InternHub – harjoittelupaikkojen hakusovellus  
**Nykyinen tilanne:** Staattinen HTML/CSS/JS-frontend + Supabase (tietokanta, autentikointi, tiedostotallennus)

---

## 1. Nykytilanne — Mitä Supabase tekee tällä hetkellä

Sovelluksemme käyttää Supabasea **kolmeen eri tarkoitukseen**, joista jokainen täytyy korvata erikseen:

### 1.1 Tietokanta (PostgreSQL)
Kaikki sovelluksen data tallennetaan Supabasen hallinnoimaan PostgreSQL-tietokantaan. Tauluja on **13 kappaletta**:

| Taulu | Sisältö |
|-------|---------|
| `Users` | Käyttäjätilit (sähköposti, salasana, rooli) |
| `student_profiles` | Opiskelijoiden profiilit |
| `student_categories` | Opiskelijan valitsemat työkategoriat |
| `Student_links` | Opiskelijan LinkedIn/GitHub-linkit |
| `Companies` | Yritysprofiilit |
| `company_team` | Yrityksen tiimin jäsenet |
| `positions` | Harjoittelupaikat |
| `applications` | Hakemukset |
| `favorites` | Opiskelijan tallennetut harjoittelupaikat |
| `feedbacks` | Opiskelijoiden kokemuskertomukset |
| `contact_messages` | Yhteydenottolomakkeen viestit |
| `job_categories` | Työkategoriat |
| `job_groups` | Kategoriaryhmät |

### 1.2 Autentikointi (Supabase Auth)
Supabase hoitaa kaiken käyttäjätunnistuksen:
- Sähköposti/salasana-kirjautuminen
- Rekisteröityminen + sähköpostin vahvistus
- Sosiaalinen kirjautuminen: **Google, GitHub, LinkedIn**
- Salasanan palautus sähköpostitse
- Salasanan päivitys
- JWT-tokenien hallinta ja RLS-suojauspolitiikat

### 1.3 Tiedostotallennus (Supabase Storage)
- CV/ansioluettelotiedostojen lataus (`resumes`-bucket)
- Tiedostojen julkiset URL-osoitteet

### 1.4 Automaattinen REST API
Tällä hetkellä **kaikki JS-tiedostot kommunikoivat suoraan tietokannan kanssa** Supabasen JavaScript-asiakkaan kautta (`supabaseClient.from(...)`). Erillistä backend-palvelinta ei ole. Tämä tarkoittaa, että siirrossa täytyy rakentaa oma API-palvelin, joka korvaa tämän toiminnallisuuden.

---

## 2. Tarkentavat kysymykset oppilaitokselle

Ennen kuin siirtotyö voidaan aloittaa, tarvitsemme seuraavat tiedot:

### 2.1 Palvelinympäristö (kriittinen)

```
❓ Mikä käyttöjärjestelmä palvelimella on?
   (Linux Ubuntu/Debian suositeltavin — Windows Server vaatii lisätyötä)

❓ Onko palvelimella SSH-pääsy sudo/root-oikeuksilla?
   (tarvitaan ohjelmistojen asennukseen)

❓ Onko Docker asennettuna tai voidaanko se asentaa?
   → Kyllä: voidaan käyttää self-hosted Supabasea (vähemmän työtä)
   → Ei: rakennetaan oma Node.js-backend (enemmän työtä, ~2–3 viikkoa)

❓ Paljonko RAM-muistia palvelimella on?
   (vaaditaan vähintään 2 GB — suositellaan 4 GB)

❓ Onko Node.js asennettuna? Jos on, mikä versio?
   (vaaditaan vähintään Node.js 18)

❓ Onko PostgreSQL asennettuna tai voidaanko se asentaa?
```

### 2.2 Verkko ja domain

```
❓ Mikä domain tai alidomaini sivustolle tulee?
   Esimerkki: internhub.koulu.fi tai opiskelijat.koulu.fi/internhub
   (tarvitaan OAuth-sovelluksiin rekisteröitymistä varten)

❓ Onko HTTPS (SSL-sertifikaatti) käytössä tai mahdollinen?
   (PAKOLLINEN — Supabase Auth ja OAuth eivät toimi ilman HTTPS:ää)

❓ Ovatko portit 80, 443, 3000 ja 5432 auki?
```

### 2.3 Sähköposti

```
❓ Onko oppilaitoksella SMTP-palvelin?
   (tarvitaan: rekisteröintivahvistus, salasanan palautus)
   
   Jos ei ole:
   Voidaan käyttää ulkoista palvelua kuten:
   - Gmail SMTP (ilmainen, 500 viestiä/vrk)
   - SendGrid (ilmainen taso: 100 viestiä/vrk)
   
❓ Mitä sähköpostiosoitetta käytetään lähettämiseen?
   (esim. noreply@koulu.fi tai internhub@koulu.fi)
```

### 2.4 OAuth-kirjautuminen (Google, GitHub, LinkedIn)

```
❓ Onko Google Workspace / organisaation Google-tili käytössä?
   (OAuth-sovellus voidaan rekisteröidä Google Cloud Consoleen)

⚠️ TÄRKEÄÄ: Kaikki kolme OAuth-palveluntarjoajaa (Google, GitHub, LinkedIn)
   vaativat uudet callback-URL:t, kun domain vaihtuu.
   Vanhat Supabase-osoitteet lakkaavat toimimasta.
   
   Uudet osoitteet tulevat muotoon:
   https://[uusi-domain]/auth/callback
```

---

## 3. Työn laajuus — Mitä täytyy tehdä

### 3.1 Vaihtoehto A: Docker on käytössä → Self-hosted Supabase
**Työmäärä: ~1–3 päivää**

1. Asennetaan self-hosted Supabase Docker-compose-konfiguraatiolla
2. Muutetaan `supabase.js`-tiedostossa vain `SUPABASE_URL` uudelle palvelimelle
3. Siirretään tietokanta (SQL-dump Supabasesta → uusi palvelin)
4. Konfiguroidaan sähköposti SMTP-asetuksissa
5. Rekisteröidään OAuth-sovellukset uudella domainilla
6. Ladataan HTML/CSS/JS-tiedostot palvelimelle

➡️ **Koodiin ei tarvitse juurikaan koskea**

---

### 3.2 Vaihtoehto B: Ei Dockeria → Oma Node.js-backend
**Työmäärä: ~2–4 viikkoa**

Tämä vaihtoehto vaatii kokonaan uuden backend-palvelimen rakentamisen, joka korvaa kaiken sen, mitä Supabase teki automaattisesti.

#### Rakennettavat komponentit:

**a) REST API (Node.js + Express)**
Kaikki Supabase-kutsut korvataan omilla API-endpointeilla.

**b) Autentikointi**
Rakennetaan oma JWT-pohjainen tunnistautumisjärjestelmä.

**c) Sähköpostilähetys**
Nodemailer-kirjasto + SMTP-palvelin.

**d) Tiedostotallennus**
CV-tiedostojen lataus omalle palvelimelle (Multer-kirjasto).

**e) Tietokantayhteys**
PostgreSQL + pg-kirjasto (tai Prisma ORM).

---

## 4. Kaikki korvattavat Supabase-kutsut

Alla on täydellinen lista kaikista sovelluksen JavaScript-tiedostoissa olevista Supabase-operaatioista. Jokainen näistä täytyy korvata omalla API-kutsulla.

### 4.1 Autentikointi (10 operaatiota)

```javascript
// 1. Sähköposti/salasana-kirjautuminen
supabaseClient.auth.signInWithPassword({ email, password })
→ POST /api/auth/login

// 2. Rekisteröityminen sähköpostivahvistuksella
supabaseClient.auth.signUp({ email, password, options: { data: metadata } })
→ POST /api/auth/register

// 3. Uloskirjautuminen
supabaseClient.auth.signOut()
→ POST /api/auth/logout  (tai vain JWT-tokenin poisto frontendissä)

// 4. Google OAuth
supabaseClient.auth.signInWithOAuth({ provider: 'google' })
→ GET /api/auth/google  (Passport.js Google Strategy)

// 5. GitHub OAuth
supabaseClient.auth.signInWithOAuth({ provider: 'github' })
→ GET /api/auth/github  (Passport.js GitHub Strategy)

// 6. LinkedIn OAuth
supabaseClient.auth.signInWithOAuth({ provider: 'linkedin_oidc' })
→ GET /api/auth/linkedin

// 7. OAuth-callback käsittely
supabaseClient.auth.onAuthStateChange(...)
→ GET /api/auth/callback/:provider

// 8. Salasanan palautussähköposti
supabaseClient.auth.resetPasswordForEmail(email, { redirectTo })
→ POST /api/auth/forgot-password

// 9. Salasanan päivitys
supabaseClient.auth.updateUser({ password: newPassword })
→ PUT /api/auth/update-password

// 10. Vahvistussähköpostin uudelleenlähetys
supabaseClient.auth.resend({ type: 'signup', email })
→ POST /api/auth/resend-confirmation
```

### 4.2 SELECT-kyselyt (25 operaatiota)

```javascript
// --- Users-taulu ---

// 1. Kirjautuminen: hae käyttäjä sähköpostilla
supabaseClient.from('Users')
  .select('user_id, user_password, role, preferred_lang')
  .eq('user_login', email).single()
→ GET /api/users?email=...

// 2. Duplikaattitarkistus rekisteröinnissä
supabaseClient.from('Users')
  .select('user_id').eq('user_login', email).maybeSingle()
→ GET /api/users/exists?email=...

// 3. Istunnon validointi (käyttäjä vielä olemassa?)
supabaseClient.from('Users')
  .select('user_id').eq('user_id', userId).single()
→ GET /api/users/:id/exists

// 4. OAuth: hae käyttäjä sähköpostilla
supabaseClient.from('Users')
  .select('user_id, role, preferred_lang').eq('user_login', email).maybeSingle()
→ GET /api/users?email=...  (sama endpoint kuin #1)

// 5. Admin: kaikkien käyttäjien lista
supabaseClient.from('Users')
  .select('user_id, user_login, role, created_at')
  .order('created_at', { ascending: false })
→ GET /api/admin/users

// --- student_profiles-taulu ---

// 6. Lataa opiskelijan profiili user_id:llä
supabaseClient.from('student_profiles')
  .select('*').eq('user_id', userId).single()
→ GET /api/students/profile

// 7. Hae opiskelijan id (hakemusten ja kokemusten käyttöön)
supabaseClient.from('student_profiles')
  .select('id').eq('user_id', userId).maybeSingle()
→ GET /api/students/profile/id

// 8. Hae nimi + id kokemusmodaliin
supabaseClient.from('student_profiles')
  .select('id, first_name, last_name').eq('user_id', userId).single()
→ GET /api/students/profile  (sama endpoint, laajennetaan)

// --- student_categories-taulu ---

// 9. Opiskelijan valitsemat kategoriat
supabaseClient.from('student_categories')
  .select('category_id').eq('student_id', profileId)
→ GET /api/students/:id/categories

// --- job_categories + job_groups ---

// 10. Kaikki työkategoriat ryhmineen
supabaseClient.from('job_categories')
  .select('category_id, title, group_id, job_groups(title)')
  .order('group_id')
→ GET /api/categories

// --- Companies-taulu ---

// 11. Duplikaatti business_id -tarkistus
supabaseClient.from('Companies')
  .select('company_id').eq('business_id', bid).eq('country', country).maybeSingle()
→ GET /api/companies/exists?business_id=...&country=...

// 12. Yritysten nimet ja kaupungit (suosikkien näyttöä varten)
supabaseClient.from('Companies')
  .select('company_id, company_name, city').in('company_id', ids)
→ GET /api/companies?ids=1,2,3

// --- positions-taulu ---

// 13. Harjoittelupaikkojen lista suodatuksilla
supabaseClient.from('positions').select('*')...
→ GET /api/positions?city=...&category=...&open=true

// 14. Yksittäinen harjoittelupaikka
supabaseClient.from('positions')
  .select('*, Companies(*)').eq('position_id', id).single()
→ GET /api/positions/:id

// 15. Harjoittelupaikkojen tiedot suosikkeihin
supabaseClient.from('positions')
  .select('position_id, title, company_id, period_start, period_end, is_open_ended')
  .in('position_id', ids)
→ GET /api/positions?ids=1,2,3

// --- applications-taulu ---

// 16. Opiskelijan kaikki hakemukset
supabaseClient.from('applications')
  .select('*, positions(title)').eq('student_id', profileId)
→ GET /api/students/:id/applications

// 17. Hyväksytyt hakemukset kokemusmodaliin
supabaseClient.from('applications')
  .select('application_id, positions(title, Companies(company_name))')
  .eq('student_id', profileId).eq('status', 'accepted')
→ GET /api/students/:id/applications?status=accepted

// 18. Tarkista onko hakemuksilla jo kokemus
supabaseClient.from('feedbacks')
  .select('application_id').in('application_id', appIds)
→ GET /api/feedbacks/exists?application_ids=1,2,3

// --- favorites-taulu ---

// 19. Käyttäjän kaikki suosikit
supabaseClient.from('favorites')
  .select('id, internship_id, saved_at')
  .eq('user_id', userId).order('saved_at', { ascending: false })
→ GET /api/favorites

// 20. Suosikkien ID:t (sydämikonien korostus)
supabaseClient.from('favorites')
  .select('internship_id').eq('user_id', userId)
→ GET /api/favorites/ids

// --- feedbacks-taulu ---

// 21. Kaikki kokemukset JOIN 4 taulun kanssa (etusivu)
supabaseClient.from('feedbacks')
  .select(`
    id, question1, question2,
    applications(
      application_id,
      student_profiles(first_name, last_name),
      positions(title, Companies(company_name))
    )
  `).order('created_at', { ascending: false })
→ GET /api/feedbacks

// --- Student_links-taulu ---

// 22. Opiskelijan linkit
supabaseClient.from('Student_links')
  .select('*').eq('student_id', profileId).order('created_at')
→ GET /api/students/:id/links

// --- Admin-kyselyt ---

// 23. Admin: tilastot (laskurit)
supabaseClient.from('positions').select('position_id', { count: 'exact' })
supabaseClient.from('applications').select('application_id', { count: 'exact' })
supabaseClient.from('contact_messages').select('id', { count: 'exact' })
supabaseClient.from('feedbacks').select('id', { count: 'exact' })
→ GET /api/admin/stats

// 24. Admin: hakemukset
supabaseClient.from('applications').select('*')
→ GET /api/admin/applications

// 25. Admin: viestit
supabaseClient.from('contact_messages').select('*')
→ GET /api/admin/messages
```

### 4.3 INSERT-kyselyt (8 operaatiota)

```javascript
// 1. Uusi käyttäjä
supabaseClient.from('Users')
  .insert({ user_login, user_password, role, preferred_lang })
→ POST /api/users  (kutsutaan rekisteröinnissä)

// 2. Uusi opiskelija-profiili
supabaseClient.from('student_profiles')
  .insert({ user_id, first_name, last_name, type_education })
→ POST /api/students/profile

// 3. Uusi yritys
supabaseClient.from('Companies')
  .insert({ user_id, company_name, website, country, business_id })
→ POST /api/companies

// 4. Yrityksen tiimin jäsen
supabaseClient.from('company_team')
  .insert({ company_id, name, job_title, email })
→ POST /api/companies/:id/team

// 5. Suosikki (upsert — lisää tai ohita duplikaatti)
supabaseClient.from('favorites')
  .upsert({ user_id, internship_id }, { onConflict: 'user_id,internship_id' })
→ POST /api/favorites

// 6. Uusi hakemus
supabaseClient.from('applications')
  .insert({ student_id, position_id, cv_url, ... })
→ POST /api/applications

// 7. Kokemuskertomus (JOIN-palautus insert-kutsun jälkeen)
supabaseClient.from('feedbacks')
  .insert({ application_id, question1, question2 })
  .select(`id, question1, question2, applications(...)`)
→ POST /api/feedbacks

// 8. Yhteydenottolomake
supabaseClient.from('contact_messages')
  .insert([{ name, email, subject, message }])
→ POST /api/contact
```

### 4.4 UPDATE-kyselyt (5 operaatiota)

```javascript
// 1. Kieliasetuksen tallennus
supabaseClient.from('Users')
  .update({ preferred_lang: lang }).eq('user_id', userId)
→ PUT /api/users/language

// 2. Opiskelijan profiilin muokkaus
supabaseClient.from('student_profiles').update({...}).eq('id', profileId)
→ PUT /api/students/profile

// 3. Yrityksen profiilin muokkaus
supabaseClient.from('Companies').update({...}).eq('company_id', id)
→ PUT /api/companies/:id

// 4. Hakemuksen tilan muutos (admin/yritys)
supabaseClient.from('applications')
  .update({ status }).eq('application_id', id)
→ PUT /api/applications/:id/status

// 5. Harjoittelupaikan muokkaus (yritys)
supabaseClient.from('positions').update({...}).eq('position_id', id)
→ PUT /api/positions/:id
```

### 4.5 DELETE-kyselyt (4 operaatiota)

```javascript
// 1. Poista suosikki ID:llä
supabaseClient.from('favorites').delete().eq('id', favId)
→ DELETE /api/favorites/:id

// 2. Poista suosikki internship_id:llä (hakemuksen yhteydessä)
supabaseClient.from('favorites')
  .delete().eq('user_id', userId).eq('internship_id', internshipId)
→ DELETE /api/favorites?internship_id=...

// 3. Poista käyttäjä (admin)
supabaseClient.from('Users').delete().eq('user_id', id)
→ DELETE /api/admin/users/:id

// 4. Poista harjoittelupaikka (yritys/admin)
supabaseClient.from('positions').delete().eq('position_id', id)
→ DELETE /api/positions/:id
```

### 4.6 Tiedostotallennus (2 operaatiota)

```javascript
// 1. CV-tiedoston lataus
supabaseClient.storage.from('resumes').upload(fileName, cvFile)
→ POST /api/upload/cv  (Multer-middleware palvelimella)

// 2. CV-tiedoston julkinen URL
supabaseClient.storage.from('resumes').getPublicUrl(fileName)
→ palvelin palauttaa URL:n insert-vastauksen yhteydessä
   tai: GET /api/files/cv/:filename
```

---

## 5. Yhteenveto työmäärästä

| Osa-alue | Vaihtoehto A (Docker) | Vaihtoehto B (Node.js) |
|----------|----------------------|------------------------|
| Tietokannan siirto | SQL-dump + import | SQL-dump + import |
| Backend API | ei tarvita | **~38 endpointtia** |
| Autentikointi | Supabase hoitaa | **JWT + Passport.js** |
| OAuth | uudet callback-URL:t | **uudet callback-URL:t + toteutus** |
| Sähköpostilähetys | SMTP-asetukset | **Nodemailer** |
| Tiedostotallennus | Supabase Storage | **Multer + levytilatallennus** |
| Frontend-koodimuutokset | vain SUPABASE_URL | **kaikki supabaseClient-kutsut** |
| **Arvioitu aika** | **1–3 päivää** | **2–4 viikkoa** |

---

## 6. Seuraavat askeleet

1. **Toimita tämä dokumentti oppilaitokselle** ja pyydä vastaukset kaikkiin kohdassa 2 oleviin kysymyksiin
2. Selvitä onko **Docker saatavilla** — tämä on tärkein yksittäinen päätöspiste
3. Kun palvelinympäristö on tiedossa, voidaan tehdä tarkka projektisuunnitelma aikatauluineen
4. Testausympäristö (staging) on suositeltava ennen tuotantoon siirtymistä

---

*Tämä dokumentti on laadittu InternHub-projektitiimin sisäiseen käyttöön siirtoneuvotteluja varten.*
