# CoachMate uploadpakket v41 — 4 november 2026

V41 corrigeert de afrondingscontrole van streeftijden en maakt teamlaadfouten herstelbaar. Retry opent gericht herstel, Settings toont export/herstel en een onleesbaar lokaal concept kan zonder gegevensverlies worden geëxporteerd. Reconstructie vereist exact dezelfde bron, een expliciete bevestiging en een originele backup. Bevestigde batches worden zonder replay gearchiveerd. Zie docs/load-recovery-v41.md. Geen Apps Script-update nodig. De exacte oorzaak op een specifiek iPhone-concept vereist zo nodig de export van dat apparaat.

Dit pakket werkt de bestaande Cloud Run-service `coachmate` bij in project
`coachmate-f4c7a`, regio `europe-west1`. Frontend, backend, deterministische
wisselassistent en de nieuwe beschikbaarheidsflow horen bij dezelfde release.

Dit pakket corrigeert de touch-pointeroverdracht voor het gehele naamblok. Zie docs/roster-touch-v40.md. Alle v39-verbeteringen zijn inbegrepen, inclusief de stabiele sleepfeedback. Het vereenvoudigt Goal en Tegengoal, met een expliciete bankspeler-uitzondering, maker onbekend, bewaarde goalminuut en correctie via Wedstrijdverloop. Alle verbeteringen uit v37 blijven inbegrepen. Zie docs/goal-registration-v38.md. De beschikbaarheidsverbeteringen blijven behouden: Reacties bijwerken
opent nooit voorbereiding. Het uitnodigingsoverzicht is kanaalonafhankelijk met
aparte verzend- en antwoordstatus. WhatsApp-bevestigingen worden lokaal bewaard
vóór gedeelde registratie. Oude voorbereidingen worden veilig vergeleken en
afgerond met reservekopie; afwijkende wedstrijdkeuzes blijven behouden. Alle
v36-correcties blijven inbegrepen. Zie docs/availability-v37.md.
FormResponses behoudt zijn vier oorspronkelijke kolommen en krijgt vijf auditkolommen.
Na uitrol vult Reacties bijwerken bestaande logregels aan zonder antwoorden opnieuw
toe te passen. Handmatige correcties, IDs, links en eerder opgeslagen resultaten blijven behouden.
242 unit-/backendtests slagen; de build en beschermde runtime zijn gecontroleerd.
Alle verbeteringen uit v34 blijven inbegrepen. Nog niet uitgerold.

## Uploaden en uitvoeren

1. Open Google Cloud Shell met het account dat de bestaande service beheert.
2. Upload `coachmate-v41.tar.gz` via het Cloud Shell-menu **Upload** naar je thuismap.
3. Plak dit in de Cloud Shell-terminal:

```bash
cd ~
tar -xzf coachmate-v41.tar.gz
cd coachmate-v41
bash deploy-cloud-shell.sh
```

Het script controleert de pakketchecksums en bestaande service, bouwt een nieuw
image met Cloud Build in dezelfde image-repository en start een nieuwe revisie.
Pas nadat die gereed is, krijgt deze 100% verkeer. Omgevingsvariabelen,
Secret Manager-koppelingen, OAuth en de serviceaccount worden niet vervangen.
Concurrency en het revisiemaximum blijven op één instance/verzoek tegelijk.
Builds en de draaiende app gebruiken de bestaande Google Cloud-facturering.
Er worden geen nieuwe repositories, APIs, sleutels of IAM-rechten aangemaakt.

Het script controleert daarna de hoofdpagina en `/api/session`. Bij een mislukte
controle probeert het de vorige revisie terug te zetten. De concrete opdracht
wordt vóór de build opgeslagen als `rollback-cloud-shell.sh` in de uitgepakte map.
Handmatig terugzetten kan daar met:

```bash
bash rollback-cloud-shell.sh
```

Gebruik het script voor deze bestaande productieomgeving. Bij ontbrekende
toegang/configuratie stopt het met de Google-foutmelding; deel geen secrets.
Start een deployment wanneer er geen livewedstrijd actief is. Na deze eerste update moet je eenmalig opnieuw inloggen. Daarna blijft de
versleutelde sessie tot 30 dagen geldig bij geldige Google-toestemming, ook na een herstart.

## Na de deployment

Open https://coachmate-496317493719.europe-west1.run.app en controleer Google-login,
het juiste team, Beschikbaarheid en de wedstrijdvoorbereiding. Bekijk of de
actieve ronde behouden is en of de aparte voorbereiding twee stappen heeft.
Het deployscript doet geen ingelogde end-to-endtest en verstuurt geen uitnodigingen.
Bewaar de vorige revisie totdat de ingelogde controle geslaagd is.

## Inhoud en verificatie

- Broncode, Dockerfile, lockfile, backend en vooraf gecontroleerde `dist/client`.
  Cloud Build bouwt de frontend opnieuw; de meegeleverde build is ter referentie.
- Alle gedeelde TypeScriptmodules worden nu meegenomen in het runtime-image,
  inclusief `formations`, `availability-workflow` en `substitution`.
- 233/233 unit-/backendtests, TypeScript/build en 28/28 runtimebestanden slagen.
- Handmatig in de browser gecontroleerd: echte sleepwissel, annuleren buiten doel, scrollen, wedstrijdverwerking, berichtvoorbeeld en eindstand in historie. Nog niet op een fysieke iPhone getest.
- `verify-package.mjs` controleert hashes, de backend-importketen en een lokaal
  productieproces (frontend/assets, sessie, afgeschermde API en bronbestanden).
- Bash-syntaxis en deploymentscenario's zijn lokaal getest met nagebootste
  Google-opdrachten. Docker is lokaal niet beschikbaar; de echte Linux-container
  wordt pas bij jouw Cloud Build-run gebouwd.
- De bestaande waarschuwing over een JavaScriptbundle groter dan 500 kB blijft.
- Geen `.env`, Google-credentials, bronexports of `node_modules` in het pakket.

## Apps Script bij deze correctie

Voor v40 is geen nieuwe Apps Script-update nodig als het gecombineerde v34-script
met worker-invitations-v3 al is opgeslagen. Behoud de bestaande triggers.
Cloud Run werkt Apps Script niet automatisch bij. Oudere installaties zonder v3
hebben nog steeds de uitnodigingsupdate uit v29 nodig.

Na deployment: kies het juiste team en ronde en gebruik Reacties bijwerken.
Het bestaande FormResponses-log wordt aangevuld; verwijder geen regels.
Zie docs/response-audit.md voor de matching, migratie en testgrenzen.

## Technische referenties

- [Cloud Build submit](https://docs.cloud.google.com/sdk/gcloud/reference/builds/submit)
- [Cloud Run service update](https://docs.cloud.google.com/sdk/gcloud/reference/run/services/update)
- [Cloud Run verkeer terugzetten](https://docs.cloud.google.com/sdk/gcloud/reference/run/services/update-traffic)



