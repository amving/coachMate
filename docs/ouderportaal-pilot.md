# Ouderportaal en beschikbaarheid

Deze wijziging blijft uitgeschakeld totdat de Cloud Run-service een Firestore-project en minstens één pilotteam heeft gekregen. Gebruik een geïsoleerde service en fictieve jeugdgegevens voor de eerste proef.

1. Maak een Firestore Standard-database in een EU-regio. Houd de database gesloten voor browserclients. De app gebruikt server-side Application Default Credentials, geen sleutelbestand en geen directe Firestore-browseraanroepen. Zie [Firestore IAM](https://cloud.google.com/firestore/docs/security/iam).
2. Geef uitsluitend de runtime-identiteit de benodigde Firestore-datatoegang voor de pilotdatabase en leesrechten op de pilot-Spreadsheet. Controleer dat de Sheets-API en Firestore-API zijn ingeschakeld. OAuth-rechten van coaches blijven gescheiden van de servertoegang en van de ouderaanmelding. De IAM- en bestandsdeling zijn aparte, expliciete beheeracties.
3. Stel `COACHMATE_PARENT_PROJECT` en `COACHMATE_PARENT_TEAMS` in. De tweede instelling bevat een lijst stabiele teamseizoen-ID's, gescheiden door komma's. `COACHMATE_PARENT_DATABASE` is optioneel en gebruikt anders de standaarddatabase. Controleer dat je testaccounts mogen inloggen als Google OAuth nog op de teststand staat. De ouderlogin gebruikt alleen OpenID en e-mail en bewaart geen Google-tokens.
4. Open als coach **Instellingen → Oudertoegang**. Kies een kind en het Google-e-mailadres van de ouder. Kopieer de link en deel hem persoonlijk. De link verloopt na zeven dagen en is gebonden aan het geverifieerde e-mailadres. Het geheime deel staat in het URL-fragment. CoachMate stuurt zelf geen uitnodiging via dit scherm. Een tweede verzorger krijgt een eigen koppeling.
5. Test met twee ouderaccounts en een coachaccount. Laat de ene ouder een antwoord opslaan en bevestig dat het zichtbaar is in de beschikbaarheidslijst van de coach. Test een parallelle wijziging, intrekking, verlopen uitnodiging en de overgang rond de aftrap. Voor een uitrol naar meer teams geldt dezelfde test met afgeschermde testdata.

## Bronnen en herstel

De wedstrijdagenda, officiële uitslagen en coachcorrecties blijven in Sheets. Firestore bewaart persoonlijke uitnodigingen, koppelingen en antwoorden. Een ouder ziet per gekoppeld kind de eigen antwoorden en gewone wedstrijddetails. De coachweergave past deze volgorde toe: handmatige coachcorrectie, antwoord uit het ouderportaal, bestaand Forms-antwoord. Alleen het antwoord uit het ouderportaal wordt gebruikt wanneer beide ouderkanalen een antwoord hebben. Verwerkte wedstrijden en archieven worden hierdoor niet aangepast. De portal schrijft geen aanwezigheid, individueel gespeelde minuten of teamscores.

Een wijziging die de effectieve beschikbaarheid verandert, verandert ook de bronversie voor de coach. Een oude lokale wedstrijddraft blijft behouden en kan via de bestaande conflictafhandeling worden beoordeeld. Parent-antwoorden gebruiken een documentversie om overschrijven te voorkomen. Een intrekking en het opslaan van een antwoord controleren dezelfde versie van de ouderkoppeling.

Bij terugdraaien schakel je de pilot uit door de lijst met pilotteam-ID's leeg te maken en de service opnieuw te configureren. De Firestore-antwoorden blijven bewaard. Controleer vóór de pilot met de club wie toegang mag beheren en hoe lang ouderkoppelingen, verlopen uitnodigingen en antwoorden bewaard blijven.
