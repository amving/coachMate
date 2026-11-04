# Praktisch wisselinterval — 18 oktober 2026

De eerdere vrije berekening leverde 03:58 en andere secondenmomenten op om de streeftijden exact te halen. Alleen die tijd afronden zou het berekende minutenplan onjuist maken. De voorbereiding kiest nu echt tussen roosters van 5 minuten, 10 minuten en periodeovergangen. Periodegrenzen blijven behouden; het ritme begint per periode opnieuw.

De assistent vergelijkt geldige kandidaatplannen, past eerst de bestaande fairnessmarge toe en gebruikt daarna de bestaande scores voor rotatie en rust. Dit is een begrensde heuristiek, geen bewijs van het globale optimum. Een ongeldige praktische planning valt niet terug op een vrij secondenplan. De gekozen cadence staat expliciet in het commando, de wedstrijdvoorbereiding en het lokale journal, zodat browser en backend hetzelfde plan reproduceren. Oude commando's behouden hun oorspronkelijke betekenis.

De UI toont alleen berekend intervaladvies, zonder ritmekeuzemenu. In de demo met 11 spelers en 8 veldplaatsen: **ongeveer elke 5 minuten, plus kwartpauzes; wissel bij stil spel**. De echte maximale afwijking van de persoonlijke streeftijd bedraagt circa **1,4 minuut**. De keepers krijgen ieder 25 minuten. Bij nieuwe keuzes wordt het vorige interval verborgen tot herberekening.

## Verificatie

- `npm.cmd run test:unit`: **150/150 geslaagd**, zonder skips. Inclusief automatische keuze van vijf minuten (11 spelers/4 kwarten), tien minuten (10 spelers/2 helften) en periodeovergangen (geen bankspelers), werkelijk geprojecteerde afwijking, harde bezettingsregels, 400 speler-minuten, 50 keeperminuten, één tot vier keepers, handmatige starters, niet-muteren bij fouten en deterministische replay van oude en nieuwe commando's.
- Een werkelijk bij **5:21** uitgevoerde advieswissel behoudt 321.000 ms als uitvoeringstijd en alle opgebouwde minuten. De herplanning begint op die tijd, gebruikt daarna uitsluitend toekomstige roosterpunten en behoudt exact 400 speler-minuten en 50 keeperminuten.
- Playwright, `tests/match-preparation.spec.ts` en `tests/substitution-assistant.spec.ts`: **21/21 geslaagd**, nul skips/flaky gevallen. Inclusief migratie van een vrije planning met behoud van keeper-/opstellingskeuzes, onberekende wijzigingen, gedeelde aanwezigheidsconcepten, lokale Google-batches en retry, twee stappen, veilige schermranden op 320px/390px en desktop-iPhone/Pixel.
- `npm.cmd run build`: TypeScript en productiebuild geslaagd. Alle **28 beschermde runtimebestanden** intact. Bestaande waarschuwing over bundlegrootte blijft.
- `npm.cmd run verify:optimizer`: de oorspronkelijke vrije referentie blijft geldig: **400 speler-minuten**, **50 keeperminuten**, nul streeftijdafwijking. Deze referentie gebruikt bewust de bestaande vrije kern; de praktische demo toont de werkelijke blokafwijking van 1,4 minuut.
- De bestaande demo is in de in-app browser doorlopen van Overzicht via Spelersgroep (1/2) naar Wisselplan (2/2). Het getoonde interval, de keeperminuten en de afwijking zijn visueel gecontroleerd.

Rapporten: `outputs/practical-interval-unit.txt`, `outputs/practical-interval-browser.json`, `outputs/practical-interval-build.txt`. Bewijs: `outputs/practical-interval-preview.png`.

De oude brede UI-suite is voor deze vervolgcorrectie niet volledig opnieuw uitgevoerd. Eerder bekende brede UI-testproblemen zijn hiermee niet opgelost of opnieuw beoordeeld. Google-verkeer is in de gerichte browsergevallen nagebootst; er is geen echte upload, uitnodiging of deployment uitgevoerd. Geen fysiek toestelonderzoek of volledige toegankelijkheidsaudit.

![Praktisch intervaladvies](../outputs/practical-interval-preview.png)
