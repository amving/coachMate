# Wedstrijdvoorbereiding — 24 oktober 2026

De coach doorloopt vier schermvullende stappen in de bestaande iOS-vormgeving:

1. **Spelersgroep** — bevestig alle aanwezige/afwezige spelers; onbekende antwoorden of een te kleine groep blokkeren verdergaan.
2. **Keepers** — één verplichte keuze per kwart (of helft). Herhaalde namen zijn toegestaan: 2+2, 3+1, één vaste keeper of vier verschillende keepers. Een expliciete voorstelknop kan bekende eerdere keeperbeurten gebruiken. De coach bevestigt de periodeverdeling.
3. **Wisseladvies** — bereken met de gekozen spelersgroep en exacte keeperverdeling. Toon de voorgestelde startbank, werkelijke wisselaantallen en een namenlijst. Geen keepervelden of opstellingseditor op dit scherm.
4. **Startopstelling** — de coach kiest de veldspelers of neemt expliciet het voorstel over. Onvolledige plekken blokkeren bevestiging. De vaste footer benoemt het aantal opgestelde spelers en de ontbrekende positie; lege plekken hebben een omlijnd plusje. De laatste actie rekent opnieuw met de definitieve starters en gaat alleen na succesvolle lokale registratie naar Live.

Apple ondersteunt een schermvullende taak voor een gerichte voorbereiding met meerdere stappen, één herkenbaar pad en duidelijke terug-/afsluitacties. CoachMate vertaalt dit naar één taak per stap, dezelfde wedstrijdcontext en een voortgangsteller. Dit is een productkeuze, geen door Apple voorgeschreven aantal stappen. Zie [Modality](https://developer.apple.com/design/human-interface-guidelines/modality) en [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets).

## Gegevens en berekening

`preparation.keeperSchedule` bewaart een speler-ID per periode; duplicaten betekenen meerdere keeperbeurten voor dezelfde speler. De optimizer, verdeling van streefminuten, planvalidatie en uitvoeringscontrole gebruiken deze constraint. Een keuze van drie kwarten heeft dus 37,5 keeperminuten en minimaal die totale speeltijd; twee kwarten zijn 25 minuten. De veldbezetting blijft constant. De eerste keeper hoort bij kwart 1 en de definitieve veldspelers zijn echte startconstraints.

Een geregistreerde werkelijke keepercorrectie overschrijft voor de planning uitsluitend de resterende actuele geplande periode. De bronkeuzes en de audit blijven intact, evenals de toekomstige keeperbeurten. Een ander wedstrijdformaat vraagt nieuwe periodekeuzes; historische tijden en besluiten blijven staan.

`src/preparation-flow.ts` beheert de berekening en het versie-3-concept. Berekenen produceert alleen een preview en schrijft geen wedstrijdactie. Definitief bevestigen gebruikt één `assistant-prepare`-actie met `confirmed:true`: selectie, keeperverdeling, formatie, starters en acceptatie zijn samen herhaalbaar via het bestaande lokale journal. Starttijd, goals, gespeelde minuten en geregistreerde wissels veranderen niet. De bestaande expliciete opslag uploadt het journal later. Bij fouten blijven concept en eerdere bevestigde toestand behouden.

Oude versie-2-concepten blijven compleet onder `legacy` beschikbaar; de oude slots waren hele-wedstrijdkandidaten en worden niet als kwartindeling gelezen. Account/teamseizoen/wedstrijd blijven de opslaggrens. Een beschadigd opgeslagen plan wordt als ongeldig gemarkeerd, met behoud van de invoer. Een gedeeld actueel bevestigd plan kan zonder lokaal concept worden teruggelezen.

## Overzicht en Live

Overzicht toont vóór de laatste bevestiging voorbereiding/concept, zonder banknamen. Daarna komen de namen uit de bevestigde wedstrijdopstelling. De lijst onder een onvolledig veld heet Nog te plaatsen.

Live toont de bevestigde periodekeepers en het eerste wisselmoment. Gepland wisselpatroon opent een telefoonschermgebonden detail met wisselmomenten, erin/eruit en de speler die eventueel blijft zitten. Het detail voert geen wissels uit. De bestaande expliciete uitvoeringshandeling blijft nodig tijdens de wedstrijd.

## Validatie

- 211 unit-/backendtests geslaagd, inclusief keeperverdelingen 1, 2+2, 3+1, 3 en 4 keepers, twee helften, harde starters, ongeldige minutenlimieten, keepercorrecties, formatwijziging, beschadigde concepten, gedeelde bevestiging en idempotente journal replay. De validatiereden benoemt de ontbrekende formatieplek en verdwijnt alleen bij een complete geldige opstelling.
- De gemelde opstelling had Spits 1 leeg (5/6). In de in-app browser gecontroleerd dat invullen de knop activeert en leegmaken hem met de concrete uitleg weer blokkeert. Oorspronkelijke coachkeuzes behouden; geen bevestiging of upload uitgevoerd bij deze controle.
- De vier stappen zijn via de in-app browser doorlopen: keuzes 3+1, concept sluiten/herladen, gewijzigde starter Lucas in plaats van Ties, bevestiging naar Live met klok 00:00 en nul geregistreerde wissels, namen in het detail en bevestigde banknamen op Overzicht.
- `tests/match-preparation.spec.ts` is aangepast naar de vierstapsflow, met behoud van de onafhankelijke formatiebeheerchecks. Deze Playwright-suite is in deze sessie niet via de CLI uitgevoerd; browsercontrole verliep via de in-app browser.
- Beschermde mobiele runtime en productiebuild worden vóór de overdracht gecontroleerd. Geen uitrol en geen Google-gegevenswijzigingen.
