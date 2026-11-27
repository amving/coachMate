# Proefmigratie van Sheets naar Firestore

De proef neemt de zeven tabbladen met team- en wedstrijdgegevens over. Sheets blijft de productiebron. Deze wijziging wordt als los script uitgevoerd en verandert geen app- of ouderinstellingen.

1. Lees de tabbladen `Seasons`, `TeamSeasons`, `Players`, `Matches`, `State`, `Availability` en `MatchStats` uit Sheets. Bewaar de kolomkoppen. Gebruik onbewerkte waarden voor getallen, booleans en JSON. Gebruik de weergegeven tekst voor datum en tijd waar Sheets serienummers teruggeeft. Controleer dat de bron tijdens het opnemen gelijk bleef.
2. Bewaar de opname lokaal onder `outputs/` in de vorm `{ "capturedAt": "<ISO-tijd>", "tabs": { "Seasons": [["seasonId", "name", "archived"], ...], ... } }`. Neem geen Forms-links, codes, bezorglog of autorisatiegegevens op. Het script verwijdert oudercontactvelden uit zowel `Players` als de opgeslagen teamstatus.
3. Start een afgeschermde lokale Firestore-emulator. Voer in PowerShell uit:

   ```powershell
   $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:4893'
   node --experimental-strip-types scripts/firestore-history-pilot.mjs outputs/firestore-migration/bron.json demo-coachmate-history
   ```

De proef gebruikt de bestaande CoachMate-parser. Een bronhash bepaalt het Firestore-pad onder `migrationRuns`. Dezelfde opname kan worden herhaald op hetzelfde pad. Na schrijven leest het script elke tabel terug, vergelijkt het rijen en historische details en schrijft het pas dan een verificatierapport. Het rapport bevat onder meer wedstrijden, uitslagen, punten, teamminuten, team- en spelersdoelpunten en de aantallen uitslagregistraties zonder individuele cijfers. Het script gebruikt alleen een lokaal emulatoradres en een `demo-`-project.

De documenten zijn een tussenstap voor de migratieproef. De vorm voor dagelijks gebruik en de omschakeling van appverzoeken horen in een volgend ontwerp en een afzonderlijke wijziging. Bewaar ruwe productieopnamen, emulatordata en uitvoer buiten Git.
