# CoachMate

GitHub Actions en uitrol: zie [de inrichting en resterende koppeling](docs/github-deployment.md). De workflows staan lokaal klaar; aansluiten op de bestaande repository en de Google Cloud-identiteit is nog niet uitgevoerd.

Een lokaal mobiel prototype met fictieve spelers. React + TypeScript + Vite, met een beschermde iPhone/Pixel-runtime.

## Huidige mogelijkheden

De deterministische wisselassistent is in fase 3 aangesloten op Live, de instellingen en het bestaande lokale journal, met herplanning na geregistreerde wissels. Zie [gebruik en registratie](docs/substitution-phase-3.md), [fase-3-testresultaten](docs/substitution-phase-3-tests.md) en [architectuur en zoeklimieten van de kern](docs/substitution-optimizer.md). Vertex AI hoort bij fase 4.

- Eén gegevensmodel voor dashboard, wedstrijd, beschikbaarheid en statistieken.
- Automatische browseropslag onder `coachmate:v1`, inclusief hervatten van een lopende klok.
- Opstelling van zes spelers, tik-om-te-wisselen, keeperperiodes, doelpunten en correcties.
- Via Teaminstellingen: 2 helften of 4 kwarten, met bijbehorende rustmomenten. Een correctie van de indeling of huidige periode pauzeert de klok en bewaart score en speelminuten; afgesloten wedstrijden houden hun indeling.
- Eigen doelpunt tegenstander via Goal voor; eigen doelpunt van een eigen speler via Tegengoal. Beide zijn herkenbaar in de registratie en kunnen worden teruggenomen. Eigen doelpunten tellen niet bij de goals van eigen spelers.
- Het dashboard telt eigen doelpunten van de tegenstander wel mee bij het teamtotaal. Dit aantal kan ook achteraf per wedstrijd worden gecorrigeerd bij Statistieken.
- Afsluiten verwerkt de wedstrijd één keer in de statistieken. Handmatige correcties laden de bestaande cijfers per wedstrijd.
- Beschikbaarheid per speler en bewaarde eerdere rondes.
- Export via Instellingen; zichtbare waarschuwingen bij opslagproblemen of wijzigingen vanuit een ander venster.

Opslag is gebonden aan dezelfde browser én hetzelfde adres/poortnummer. Browsergegevens wissen verwijdert de registratie. De lokale demo blijft gescheiden van de nieuwe Google-backend. Google-toegang moet lokaal worden geconfigureerd voordat echte gegevens geladen kunnen worden. De automatische klok stopt bij 120 minuten; speelminuten worden bij afsluiten afgerond op hele minuten.

Bestaande browseropslag wordt automatisch naar gegevensversie 2 omgezet onder dezelfde opslagsleutel. Oude tegengoals behouden hun aantal; omdat de vorige versie geen tijdstip vastlegde, staan deze als ‘tijd onbekend’ vermeld.

## Seizoenen en brongegevens

De Google-bron staat in [CoachMate – seizoenen en teams](https://docs.google.com/spreadsheets/d/1nmvI_t5GP6WR1LhBwYjeUVXcnXV-QY-InxjJASwStlQ/edit).

- `Seasons`: seizoen-ID, naam en archiefstatus.
- `TeamSeasons`: teamselectie per seizoen, 2 helften/4 kwarten en actieve wedstrijd.
- `Players` en `Matches`: bronregels met `teamSeasonId`. IDs mogen over seizoenen terugkomen, maar moeten binnen een teamseizoen uniek zijn.
- `State`: appopslag in genummerde JSON-delen, met revisie voor conflictcontrole. Bevat ook afgesloten wedstrijdregistraties.
- `Availability` en `MatchStats`: leesbare uitvoer van de app. Bewerk cijfers via de app.
- `Forms`, `FormInvites` en `FormResponses`: rondebinding, persoonlijke codes en idempotente importregistratie. Deel deze tabs niet met ouders.

Een nieuw seizoen krijgt een nieuwe `teamSeasonId`; de vorige selectie en resultaten blijven bewaard. Gearchiveerde seizoenen zijn alleen leesbaar. Nieuwe spelers en wedstrijden kunnen worden toegevoegd. Verwijder geen gebruikte IDs. Voor een volgende livewedstrijd: sluit de vorige eerst af en wijzig daarna `liveMatchId` in de bron. Herlaad de gegevens via Instellingen.

## Google-backend instellen

De backend is een afzonderlijk lokaal Node-proces; de beschermde mobiele runtime en statische Worker blijven intact. Google Drive-toegang in Codex is geen OAuth-toegang voor de app.

1. Maak in Google Cloud een project voor CoachMate. Schakel Google Sheets API en Google Forms API in.
2. Configureer Google Auth Platform: externe app, teststatus, je coachaccount als testgebruiker. Maak een OAuth-client van type **Web application**.
3. Registreer de redirect URI `http://127.0.0.1:4175/auth/callback` exact.
4. Kopieer `.env.example` naar `.env`. Vul `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` en `COACH_EMAILS` in. De bron-ID is al ingevuld. Bewaar secrets alleen lokaal, nooit in chat of `VITE_*`.
5. Start de backend met 
pm run backend`. De frontend draait op poort 4173. Kies Instellingen → Inloggen met Google → Seizoen en team.

De server gebruikt de officiële Google-auth-library, OAuth state + PKCE + nonce, een coachallowlist en HttpOnly-sessiecookies. Tokens blijven alleen in servergeheugen. Een herstart of sessieverloop vereist opnieuw inloggen. Alle toegestane coaches hebben toegang tot de volledige bron, mits hun Google-account zelf toegang heeft tot de Sheet en betreffende Forms. Deel Forms-bewerking met andere bevoegde coaches als zij reacties moeten importeren. Er zijn nog geen verschillende rollen per team.

Forms worden per wedstrijd en ronde aangemaakt via **Formulier voorbereiden**. Controleer en publiceer het formulier in Google Forms; de app verzendt geen berichten. Ouders gebruiken een persoonlijke code, zodat het formulier geen openbare spelerslijst toont. Kies **Reacties ophalen** om antwoorden te verwerken. Dubbele en oudere antwoorden worden genegeerd. Handmatige correcties blijven leidend tot een nieuwe ronde. Er is nog geen automatische achtergrondimport of herinneringsmail.

Gebruik één backendproces. Het proces serialiseert wijzigingen en controleert revisies plus bronwijzigingen. Sheets biedt geen transactionele compare-and-swap; gelijktijdig rechtstreeks bewerken van de bron tijdens appwrites kan nog conflicteren. Bewerk bronregels daarom wanneer coaches niet registreren. De app schrijft meerdere tabbladen in één atomische Sheets-batch. Na een onduidelijke netwerkfout: vernieuw eerst; acties worden niet automatisch herhaald. Het aanmaken van een Form en opslaan van de binding zijn twee Google-verzoeken; bij een fout kan een ongekoppeld formulier achterblijven in Drive. Controleer dat voordat je opnieuw aanmaakt.

De backend luistert alleen op localhost. Hosting, permanente sessieopslag en productie-OAuth-verificatie zijn nog niet ingericht. De statische Sites-build bevat geen backend. Live OAuth/Forms-verificatie vereist de nog te configureren Google Cloud-client.

## Ontwikkeling en controle

Gebruik npm; `package-lock.json` is de enige lockfile. Node 22.19 of nieuwer binnen een ondersteunde Node-release is nodig voor systeemcertificaten.

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
npm run build
npm run test:state
npm run test:backend
npm run test:runtime
npm run test:sites
npm run audit:security
```

Voor een eerste browsertestrun: 
px playwright install chromium`.

## npm-certificaatfout op Windows

In deze omgeving mislukte npm met `unable to verify the first certificate`. Met de vertrouwde Windows-certificaten werkte dezelfde audit wel. De exacte uitgevende proxy of beveiligingssoftware is niet vastgesteld.

Voor de huidige PowerShell-sessie:

```powershell
$env:NODE_USE_SYSTEM_CA = '1'
npm audit
```

Om dit voor je eigen Windows-account te bewaren, voer je desgewenst uit:

```powershell
[Environment]::SetEnvironmentVariable('NODE_USE_SYSTEM_CA', '1', 'User')
```

Start daarna je terminal en Codex opnieuw, zodat ze de nieuwe omgeving overnemen. Dit project heeft daarnaast 
pm run audit:security`, dat systeemcertificaten voor die audit gebruikt zonder een globale instelling te wijzigen.

Als het bedrijfs-CA-certificaat niet in Windows wordt vertrouwd, vraag dan het officiële PEM-certificaat aan je beheerder en stel `NODE_EXTRA_CA_CERTS` in op het bestand. Vertrouw geen willekeurig certificaat. Laat `strict-ssl=true` staan en zet `NODE_TLS_REJECT_UNAUTHORIZED` niet op `0`.

Bronnen: [Node: systeemcertificaten](https://nodejs.org/api/cli.html#--use-system-ca), [npm: cafile en strict-ssl](https://docs.npmjs.com/using-npm/config/).

## Volgende productstap

Rond Google OAuth af, vul de echte selectie en planning in, en test één complete beschikbaarheidsronde met een proefspeler. Controleer daarna gedeelde coachtoegang en herstel vanuit een reservekopie. De mobiele runtime mag daarbij niet zonder expliciete opdracht worden aangepast; zie `AGENTS.md`.

### Club en team

Via Teaminstellingen → Club en team stel je de club- en teamnaam in. TeamSeasons bevat daarvoor `clubId` en `clubName` (kolommen F/G). De eerste clubtoewijzing zet alle verwijzingen en de opgeslagen State in één batch om naar `clubcode-team-seizoen`, bijvoorbeeld `hfc-edo-jo10-2-2026-2027`. Latere naamcorrecties behouden deze sleutel. Wijzig bestaande IDs niet handmatig. Oude vijfkolomsbronnen blijven leesbaar totdat de app ze bijwerkt. Nieuwe beschikbaarheidsformulieren tonen de clubnaam; bestaande formuliertitels blijven behouden.

### Invoerhulp in Google Sheets

Het gebonden Apps Script `scripts/google-sheets/CoachMate.gs` is geïnstalleerd in de bron. Bij openen stelt het dropdowns in: Matches/Players.teamSeasonId uit TeamSeasons, TeamSeasons.seasonId uit Seasons, periods 2/4, venue Thuis/Uit, archived als checkbox en liveMatchId met wedstrijden van hetzelfde team. Rugnummers moeten hele getallen van 0–99 zijn.

Kies bij een nieuwe wedstrijd/speler eerst een teamseizoen: onEdit vult een ontbrekende matchId/playerId één keer met een UUID. Bestaande IDs blijven staan, ook na datumwijzigingen. Plak geen bestaande codes mee naar nieuwe records en sorteer steeds hele rijen. Een lege nieuwe rij krijgt pas een ID bij invoer. Handmatige datumwijzigingen (echte Sheet-datum, YYYY-MM-DD of DD-MM-YYYY) vullen shortDate; onleesbare tekst blijft ongewijzigd. Open de Sheet opnieuw als na een import keuzelijsten moeten worden hersteld. API-imports activeren onEdit niet; een importer moet zelf vaste IDs aanleveren.

De backend weigert dubbele IDs, ontbrekende seizoenen/teams en een liveMatchId van een ander team. Vul begonnen regels af voordat je ze in CoachMate laadt. App-beheerde tabbladen hebben waarschuwingsnotities, maar zijn niet tegen alle handmatige wijzigingen beschermd.

### Historische Sheet-statistieken

Gebruik Teaminstellingen → Historische wedstrijden uit Sheet importeren. Matches bevat Stand (thuisploeg eerst), Doelpuntenmakers (Naam 3x of Naam *3), Keepers (kwarten van 12,5 minuut; zonder aantal één kwart) en afwezig (voornamen of - voor iedereen aanwezig). Alleen regels met een stand worden geïmporteerd. Namen moeten uniek in de selectie voorkomen; goals moeten aansluiten op de stand en ingevulde keeperkwarten optellen tot vier. Fouten blokkeren de hele import. Bestaande cijfers worden nooit overschreven; ongewijzigde imports worden overgeslagen. liveMatchId blijft voor livewedstrijden.

Ontbrekende speelminuten blijven onbekend; MatchStats gebruikt lege minutenvelden en minutesKnown/keeperMinutesKnown. De app toont ? of een bekend subtotaal +?. State bewaart dezelfde betekenis met expliciete vlaggen. Correcties kunnen daarna via Historie in de app.

### iPhone en Google Cloud

De webapp bevat een manifest en iPhone-icoon. Op echte telefoons gebruikt hij het volledige scherm en het echte toetsenbord. Bekijk lokaal met ?device=real. De Dockerfile serveert frontend en backend samen; zie deploy/README.md voor hosting, OAuth en beperkingen. Publicatie wacht op Google Cloud-facturering en is nog niet uitgevoerd.

