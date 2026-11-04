# Eindstanden, wedstrijdbericht en veldbediening — 25 oktober 2026

## Eindstanden

De historielijst las alleen matchResults, gevuld door historische Sheet-imports.
Live afsluiten bewaart de echte eindstand in liveArchive. Daardoor ontbraken de
twee recente Live-wedstrijden in de scorekolom, terwijl hun cijfers intact waren.
recordedMatchResult leest een expliciete matchResults-uitslag of een afgesloten
Live-archief (ook de actuele afgesloten wedstrijd). Historie en spelerdetail
gebruiken dezelfde bronkeuze. Een lopende of onbekende uitslag wordt niet als 0–0
verzonnen. Bestaande archieven werken direct na de frontendupdate; geen migratie
of herverwerking nodig. Home/away-presentatie blijft teamrelatieve opslag omzetten.

## WhatsApp

Het bericht toont thuisploeg–uitploeg, een volledige datum, daarna Eindstand en de
score op een eigen regel. Scoreverloop is één lijst met cumulatieve thuis/uitstand,
doelpuntenmaker en minuut (`1-0 Tijn '12`). Gewone tegengoals krijgen `-`; eigen
doelpunten zijn expliciet herkenbaar. De lijst gebruikt eerst de vastgelegde
eventvolgorde, anders unieke scoremomenten of verschillende bekende minuten.
Bij ontbrekende/ambigue legacy-volgorde worden tussenstanden als onbekend benoemd;
er worden geen tijden of gebeurtenisvolgordes gereconstrueerd. Undo-gaten in
eventnummers blijven geldig; de cumulatieve standen tellen alleen behouden goals.
De WhatsApp-link gebruikt exact dezelfde tekst als de preview. Verzenden blijft
een handeling van de coach; tijdens de controle is niets verstuurd.

## Aanraken en slepen

De oude sleepgreep was 27 CSS-pixels breed. De nieuwe greep is 44 pixels breed en
minimaal 64 pixels hoog, met ruimere namen/minuten en hogere doelkaarten. De
naamzone blijft een scroll-/tikvlak; alleen de greep bezit het sleepgebaar. Het
sleepbeeld staat boven de vinger en een geldig doel toont beide namen.
Autoscroll begint pas na beweging en 250 ms verblijf in een 24px-randzone. Het
stopt buiten het scrollvenster en is tijdgestuurd, onafhankelijk van de
beeldschermfrequentie. Hierdoor verschuift geen doelkaart door alleen oppakken.
Loslaten buiten een speler annuleert. De toegankelijke niet-sleepbediening blijft.
De niet-scrollende desktop-device-screen gebruikt app-scoped overflow:clip, zodat
focus/scrollen geen verborgen keyboardasset of content achter de camera onthult.
De beschermde mobiele runtime is niet aangepast.

Het gekozen rood/zwarte icoon hoort bij ons team (EDO), het blauwe bij de
tegenstander, onafhankelijk van thuis/uit. De thuisploeg blijft links staan.

## Verificatie

- 220 unit-/backendtests geslaagd: inclusief Live-archief na twee afgesloten
  wedstrijden, bestaande importuitslagen, onbekende uitslagen, thuis/uit,
  chronologie, eigen goals, undo en ontbrekende historische tijden.
- In een aparte demo via de in-app browser: Mats naar Lucas gesleept en exact
  één juiste wissel geregistreerd; ongeldige drop registreert niets. Vanaf de
  naamzone gescrold: 100px, zonder extra wissel of keeperkeuze. Greepafmetingen
  44×64 (keeper 44×67); buitenste device-screen blijft op scrollTop 0.
- Testwedstrijd met goals voor/tegen/voor verwerkt; bericht toont 0-1, 1-1, 1-2
  in uitvolgorde. Historielijst toont daarna 1–2 zonder matchResults-record.
- TypeScript, build en 28 beschermde runtimebestanden gecontroleerd. Geen fysieke
  iPhone-test, Google-bronmutatie of productie-uitrol. Bronvoorbeelden zijn gelezen;
  de browserhandelingen veranderden uitsluitend een aparte lokale demo.

Referenties: [Apple hit targets](https://developer.apple.com/design/tips/),
[Apple drag and drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop).
