# CoachMate op Google Cloud Run

## Uploadpakket v41 (4 november 2026)

`outputs/deploy/coachmate-v41.tar.gz` corrigeert de validatie van uit milliseconden afgeleide streeftijden en biedt gerichte diagnose/export en veilig lokaal herstel bij een geblokkeerd team. Originele bytes, batch-ID en tijdstippen blijven behouden; geen impliciete upload. Zie `docs/load-recovery-v41.md`. Geen Apps Script-update. Niet uitgerold; de werkelijke iPhone-opslag is niet onderzocht of gewijzigd.

## Uploadpakket v40 (30 oktober 2026)

`outputs/deploy/coachmate-v40.tar.gz` herstelt touch-pointeroverdracht voor de
volledige naamblokwissel. Behoudt zijwaarts wisselen, verticaal scrollen en de
subtiele lift uit v39. 233 tests, build en runtimecontrole slagen. Fysieke iPhone
nog niet gecontroleerd. Zie `docs/roster-touch-v40.md`. Geen Apps Script-update.
Nog niet uitgerold.

## Uploadpakket v38 (30 oktober 2026)

`outputs/deploy/coachmate-v38.tar.gz` vereenvoudigt Goal en Tegengoal, ondersteunt
een expliciete uitzondering voor bank-/afwezig geregistreerde doelpuntenmakers,
bewaart de minuut bij openen en biedt correctie via Wedstrijdverloop. Onbekende
makers blijven onbekend en tellen wel in de teamscore. Alle v37-wijzigingen zijn
inbegrepen. 230 tests, build en runtimecontrole slagen; browserdemo gecontroleerd.
Zie `docs/goal-registration-v38.md`. Geen Apps Script-update nodig. Nog niet live.

## Uploadpakket v37 (25 oktober 2026)

`outputs/deploy/coachmate-v37.tar.gz` scheidt rondevoorbereiding, uitnodigen en
reacties. Eén kanaalonafhankelijke spelerslijst met afzonderlijke verzend- en
antwoordstatus, expliciete WhatsApp-registratie en veilige afhandeling van oude
concepten. Reacties bijwerken opent nooit voorbereiding. 225 unit-/backendtests,
build en runtimecontrole slagen. Zie `docs/availability-v37.md`. Geen nieuwe
Apps Script-update nodig; nog niet uitgerold.

## Uploadpakket v36 (25 oktober 2026)

`outputs/deploy/coachmate-v36.tar.gz` herstelt ontbrekende Live-eindstanden in de
historie, deelt een chronologisch cumulatief WhatsApp-verslag in thuis/uitvolgorde
en vergroot de sleepgrepen naar 44×64px met stabieler autoscrollgedrag. EDO krijgt
het rood/zwarte icoon, de tegenstander het blauwe. Alle v35-correcties blijven
inbegrepen. 220 unit-/backendtests, build en runtime-integriteit slagen; de
interacties zijn in een aparte browserdemo gecontroleerd. Geen Apps Script-update
nodig ten opzichte van het v3-mailscript. Nog niet uitgerold.

## Uploadpakket v35 (25 oktober 2026)

`outputs/deploy/coachmate-v35.tar.gz` maakt FormResponses herleidbaar naar speler,
teamseizoen en ronde, met een gecontroleerde koppeling naar het andere Apps
Script-antwoord-ID. De eerste Reacties bijwerken na uitrol vult oude logregels
aan zonder antwoorden opnieuw toe te passen of handmatige correcties te wissen.
Geen nieuwe Apps Script-update nodig. 216 unit-/backendtests en de build slagen.
Zie `docs/response-audit.md`. Nog niet uitgerold.

## Uploadpakket v34 (24 oktober 2026)

`outputs/deploy/coachmate-v34.tar.gz` verduidelijkt waarom een onvolledige
startopstelling niet kan worden bevestigd. De vaste footer toont de bezetting en
de ontbrekende positie; lege plekken zijn herkenbaar. De oorspronkelijke keuzes
blijven staan. 211 unit-/backendtests, build en runtime-integriteit slagen;
de knop is handmatig met een lege en een ingevulde plek gecontroleerd. Nog niet uitgerold.

## Uploadpakket v33 (24 oktober 2026)

`outputs/deploy/coachmate-v33.tar.gz` bevat de vierstapsvoorbereiding: spelersgroep,
verplichte keeper per kwart, berekend advies en coachopstelling. Alleen definitief
bevestigen maakt één lokale journalactie; de klok start niet. Overzicht toont pas
dan banknamen en Live biedt het geplande wisselpatroon met namen. 210 unit-/backendtests
slagen en de flow is in de in-app browser gecontroleerd. Nog niet uitgerold.
Zie `docs/preparation-flow.md` voor de precieze verificatie en compatibiliteit.

## Uploadpakket v32 (23 oktober 2026)

`outputs/deploy/coachmate-v32.tar.gz` voegt de registratiegrens per teamseizoen toe:
ronde 1 telt voor doelpunten en 50 wedstrijdminuten; individuele cijfers tellen vanaf
ronde 2. Het overzicht telt wedstrijdduur één keer, met werkelijke live duur vanaf
ronde 2. Wisseladvies benoemt wie langer op de bank blijft. 193 unit-/backendtests,
39 gerichte browsertests, build en runtime-integriteit slagen. Nog niet uitgerold.

## Uploadpakket v31 (23 oktober 2026)

`outputs/deploy/coachmate-v31.tar.gz` voorkomt dat de uitnodigingsheader door
browserfocus achter de camera schuift. Terug en Sluiten werken ook met open
toetsenbord. 14/14 gerichte browsertests en de build slagen; de 28 beschermde
runtimebestanden zijn intact. Lokaal klaargezet, nog niet uitgerold.

## Uploadpakket v30 (23 oktober 2026)

`outputs/deploy/coachmate-v30.tar.gz` bevat daarnaast de correcte persoonlijke
aanhef in het demo-uitnodigingsvoorbeeld en de cursorcorrectie in beschikbaarheidsportalen.
9/9 gerichte uitnodigingstests, build en runtime-integriteit slagen.
Het pakket is lokaal klaargezet; nog niet uitgerold.

## Uploadpakket v29 (23 oktober 2026)

`outputs/deploy/coachmate-v29.tar.gz` bevat de lokale correcties voor opslagherstel,
statusoverlays, opstarten/onthouden van login, laden en persoonlijke uitnodigingen.
Frontend/backend en de bestaande AvailabilityMail.gs/Distribution.gs horen bij elkaar.
De nieuwe worker heet worker-invitations-v3. Nog niet uitgerold; zie
[de uploadinstructies](UPLOAD-LEESMIJ.md) en [het wijzigingsrapport](../docs/reliability-2026-10-23.md).

## Uploadpakket v28 (22 oktober 2026)

Het nieuwe pakket staat in `outputs/deploy/coachmate-v28.tar.gz`, met het
gecorrigeerde deployscript en de laatste beschikbaarheids-/uitnodigingswijzigingen.
178/178 unit/backendtests, 32/32 gerichte browsertests na de laatste UI-wijziging,
zeven offline deployscenario’s en de pakket-productiesmoketest slagen.
Dit pakket is alleen lokaal klaargezet; nog niet uitgerold.
Volg [de uploadinstructies](UPLOAD-LEESMIJ.md), inclusief de afzonderlijke
Apps Script-update voor aangepaste uitnodigingstekst en korte persoonlijke links.

## Eerdere release v26 (22 oktober 2026)

Het gecontroleerde pakket staat in `outputs/deploy/coachmate-v26.tar.gz`.
Upload dit zelf naar Cloud Shell en volg [de uploadinstructies](UPLOAD-LEESMIJ.md).
Het inbegrepen `deploy-cloud-shell.sh` bouwt en werkt uitsluitend de bestaande
service bij, met behoud van Google-configuratie en een concrete terugzetopdracht.
Dit pakket is op 22 oktober 2026 gedeployd: revisie `coachmate-00010-qdq`
ontvangt 100% verkeer. Cloud Build, Google-login, team laden en Beschikbaarheid
zijn gecontroleerd. De vorige revisie `coachmate-00009-tfv` blijft beschikbaar.

Pakketcontrole: 168/168 unit/backendtests vanuit het uitgepakte archief,
zes offline deploymentscenario's, 26 backendmodules en 152 bestandshashes.
TypeScript, productiebuild en 28 beschermde runtimebestanden slagen.
De Linux-containerbouw en ingelogde productiecontrole zijn inmiddels geslaagd.

Het oorspronkelijke archief blijft ongewijzigd voor herleidbaarheid. Het inbegrepen
v26-script stopte veilig vóór omschakelen doordat een revisie zonder verkeer nog
niet als latestReady werd gemeld. De uitrol is afgerond na afzonderlijke activering
via een tijdelijke tag en bevestigde Ready/Active/ContainerHealthy-statussen.
De gecorrigeerde bron `deploy/deploy-cloud-shell.sh` leest latestCreated afzonderlijk
uit en controleert de actieve, gezonde revisie vóór omschakeling. Zeven offline
scriptgevallen slagen, inclusief lege update-uitvoer en een ongezonde revisie.
Gebruik dit gecorrigeerde script bij een volgende uitrol; voer het oude archiefscript
niet opnieuw uit voor deze al voltooide release.

Doelproject: `coachmate-f4c7a`. Deploy frontend en Node-backend samen; alleen `dist/client` wordt publiek geserveerd. OAuth-geheimen, brondata, exports en `.env` mogen nooit in het image of de upload terechtkomen.

## Instellingen

- Regio: europe-west1. Request-based billing, minimum 0, maximum 1 instance; concurrency 1.
- Eén actieve revisie met 100% verkeer. Geen traffic split. Schrijven wordt binnen het proces geserialiseerd; voor meerdere instanties is eerst gedeelde vergrendeling nodig.
- Eén HTTPS-serviceadres voor `APP_ORIGIN` én `API_ORIGIN`, zonder afsluitende slash.
- `GOOGLE_SPREADSHEET_ID`, `GOOGLE_CLIENT_ID`, `COACH_EMAILS` als configuratie; `GOOGLE_CLIENT_SECRET` via Secret Manager, uitsluitend leesbaar door de runtime-serviceaccount.
- Google OAuth-client: exact `<serviceadres>/auth/callback` toevoegen aan toegestane redirect-URI's. Het lokale adres mag blijven staan.
- De aanmeldpagina is publiek bereikbaar; iedere gegevensaanvraag vereist een sessie en een toegestaan Google-account. Sheets-rechten blijven ook vereist.

Billing, vereiste APIs en de Secret Manager-toegang moeten vóór publicatie zijn ingesteld. Maak geen API-sleutels of serviceaccount-privatekeys. Publiceer pas nadat de gebruiker kosten en toegang heeft beoordeeld. Het maximum aantal instanties is geen hard uitgavenplafond; ook builds, imageopslag en netwerk kunnen kosten veroorzaken.

## Beperkingen eerste versie

Vanaf de wijziging van 23 oktober staan sessies versleuteld in een HttpOnly/Secure-cookie, met Google offline vernieuwing tot 30 dagen zolang Google toestemming geldig blijft. Een herstart of afschalen wist de login niet. Na deze eerste uitrol is eenmaal opnieuw inloggen nodig. Optioneel kan GOOGLE_SESSION_SECRET als vaste Secret Manager-koppeling worden gebruikt; anders wordt een gescheiden sleutel afgeleid uit het bestaande GOOGLE_CLIENT_SECRET. Rotatie beëindigt bestaande sessies. Tokens komen niet in browser-webopslag. Teamgegevens blijven in Sheets. De webapp vereist internet voor Google-gegevens en slaat die niet op in een offlinecache. Een telefoon die wordt vergrendeld, kan browseruitvoering pauzeren; valideer een volledige livewedstrijd op de echte iPhone voordat je de app hiervoor inzet.

## Installatie

Open het definitieve HTTPS-adres in Safari, meld aan met Google en kies het team. Delen → Zet op beginscherm → Voeg toe. De app gebruikt op de telefoon het volledige scherm; op desktop blijft de preview beschikbaar. `?device=real` toont de echte schermmodus ook op desktop.

