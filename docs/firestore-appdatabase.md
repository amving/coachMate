# Firestore-appdatabase in de pilot

De appdatabase gebruikt de bestaande CoachMate-bronparser en dezelfde wedstrijdlogica als Sheets. Firestore bewaart de gegevens in begrensde documenten. Een opslag reserveert de gelezen versie en schrijft de gewijzigde documenten met de nieuwe versie in één commit. Een tweede schrijver met dezelfde oude versie krijgt een conflict.

Voor de pilot gelden `COACHMATE_APP_STORE=firestore`, een lokale `FIRESTORE_EMULATOR_HOST` en een apart `COACHMATE_APP_FIRESTORE_PROJECT` met voorvoegsel `demo-`. De bestaande productieconfiguratie gebruikt Sheets. Firestore-pilotmodus weigert `NODE_ENV=production`.

Gebruik een opname uit de [proefmigratie](firestore-proefmigratie.md) en een lokaal bestand met pilotrechten, bijvoorbeeld `[{"accountId":"google:test-coach","teams":["team-a"]}]`. `accountId` gebruikt de geverifieerde Google-subject-ID. Een vooraf ingerichte beheerder kan `"admin":true` krijgen. Draai de seed alleen voor een leeg demo-project:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:4893'
node --experimental-strip-types scripts/seed-firestore-app-pilot.mjs outputs/opname.json demo-coachmate-app outputs/testrechten.json
```

De coach ziet alleen toegewezen teamseizoenen. De server controleert de rechten opnieuw bij ieder verzoek. Coachaanmelding gebruikt alleen Google-identiteit in pilotmodus. Forms- en clubmigratieacties blijven in Sheets beschikbaar. De bestaande Forms-werkprocessen en het beheer van roltoewijzingen krijgen een eigen aansluiting vóór omschakeling.
