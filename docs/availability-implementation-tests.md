# Beschikbaarheid — implementatie en verificatie

Het voorstel voor annotatie 6 is op 18 oktober 2026 goedgekeurd en geïmplementeerd. De wijzigingen betreffen de app-eigen UI in `src/Prototype.tsx` en `src/prototype.css`; de mobiele runtime en bestaande Forms/backend-contracten zijn behouden.

## Resultaat

- **Actieve uitvraag** toont de geselecteerde ronde, ontvangen ouderreacties, ontbrekende ouderreacties en afzonderlijke persoonlijke e-mailstatussen (verstuurd/in behandeling/mislukt/onzeker). Coachcorrecties verhogen de ouderreactietelling niet. WhatsApp-verzending blijft onbekend.
- **Uitnodigen** en **Reacties bijwerken** staan direct op het overzicht. Een lokaal importtijdstip wordt uitsluitend na bevestigde succesvolle import geschreven. Bij fouten blijven bestaande gegevens zichtbaar; nog niet geladen verzendstatus wordt onbekend genoemd.
- **Per wedstrijd** blijft een compact leesoverzicht met aanwezig/afwezig/onbekend. Verstreken en verwerkte wedstrijden staan bij Afgelopen wedstrijden; niet verwerkte wedstrijden worden als zodanig benoemd. Aanpassen opent dezelfde bestaande lokale correctie-editor.
- **Nieuwe speelronde voorbereiden** heeft drie stappen: wedstrijden → spelers/kanaal → controleren/uitvragen. Het concept overleeft teruggaan, tabwissels en herladen, gescheiden per account en teamseizoen. Een ongebruikt concept kan na een extra bevestiging worden verwijderd.
- Bij stap 3 slaat de coach de ronde expliciet op en start de Form-voorbereiding. Daarna blijft het versturen van persoonlijke e-mails of klaarzetten van WhatsApp-berichten een afzonderlijke expliciete actie. Een opgeslagen ronde vervangt de actieve uitvraag niet automatisch. De actieve rondevoorkeur wordt lokaal bewaard; op een ander apparaat zijn bekende inzendingen en bezorgregistraties leidend bij de eerste selectie.
- De bestaande persoonlijke links, adresvalidatie, duurzame batch-ID's, publicatiecontrole en foutafhandeling worden hergebruikt. Een mislukte Form-voorbereiding kan worden hervat zonder de ronde opnieuw aan te maken. Verloren verzendbevestigingen worden via bezorgregistraties verzoend. WhatsApp-wachtrij en geopende/overgeslagen voortgang blijven lokaal bewaard; geopend wordt nooit als verzonden geregistreerd.
- De ontwikkelaarsdemo benoemt dat er geen Google-reacties of verzending zijn gekoppeld. De voorbereiding is lokaal te doorlopen (kies WhatsApp bij ontbrekende demo-e-mails). Tijdens deze verificatie zijn geen echte uitnodigingen verstuurd en geen Google-rondes aangemaakt.

## Verificatie

- `npm.cmd run test:unit`: **146/146 geslaagd**. Inclusief optimizer, startplan, lokale batches, Forms en bronvalidatie. Log: `outputs/availability-unit.txt`.
- Gerichte browserreeks: **35/35 geslaagd**, zonder overgeslagen of flaky tests. Betreft voorbereiding, uitnodigingen, bestaande wedstrijdvoorbereiding, Live-assistent en mobiele runtime. Rapport: `outputs/availability-final-browser.json`.
- `npm.cmd run build`: geslaagd, inclusief TypeScript en controle van alle 28 beschermde runtimebestanden. Bestaande Vite-melding over de grootte van de JavaScript-bundel blijft zichtbaar; dit blokkeert de build niet. Log: `outputs/availability-build.txt`.
- Volledige browserreeks: **86/114 geslaagd, 28 mislukt**, geen overgeslagen of flaky gemarkeerde gevallen. Rapport: `outputs/availability-full-browser.json`. Deze run gebruikte twee workers en een timeout van 15 seconden; sommige suites stellen zelf een langere timeout in.
- Daarna zijn de beschikbaarheidsintegratietests bijgewerkt naar de huidige goedgekeurde route (Form-beheer in Instellingen, expliciete correctie-editor, leesbare rondehistorie en begeleide rondevoorbereiding). De aanvullende run behaalde **15/16**; de laatste fout bleek een onvolledige geschiedenisfixture zonder expliciete actuele ronde. De gecorrigeerde fixture is apart **1/1 geslaagd**. Rapporten: `outputs/availability-integration-browser.json` en `outputs/availability-history-browser.json`.
- Samen zijn **41 verschillende gerichte browsertests geslaagd**: 11 nieuwe beschikbaarheidsreistests, 2 uitnodigingstests, 2 Form-integraties, 2 rondecontroles, 1 historische-reactiecontrole, 7 startplantests, 8 Live-assistenttests en 8 mobiele-runtimetests. De extra verloren-verzendbevestigingstest staat in de aanvullende reeks.
- Met het laatste resultaat per test komt de combinatie van volledige run en gerichte hertests op **91/114 geslaagd; 23 blijven rood**. Dit is een samengestelde stand, geen tweede volledig groene run. `outputs/availability-latest-results.json` bevat de resterende testnamen en exacte fouten. De brede run had ook twee timinggevoelige fouten bij verloren uitnodigingsbevestiging en Carousel-beweging; beide slagen in de gerichte reeks met één worker.
- In-app browser: de rondekeuze, drie stappen, kanaalkeuze, teruggaan, hervatten en het verwijderen van het zelfgemaakte lokale testconcept visueel gecontroleerd. Screenshots: `outputs/availability-overview-preview.png` en `outputs/availability-preparation-preview.png`.

De browserintegraties gebruiken nagebootste Google-antwoorden. Dit bewijst de UI- en foutpaden; echte bezorging, Google-publicatie en fysieke iPhone-bediening zijn hiermee niet opnieuw getest.

## Nog falende brede tests

De resterende 23 gevallen betreffen hoofdzakelijk oude scherm- en selectorverwachtingen: onder meer Aanwezigheid aanpassen op het dashboard, de vroegere Wedstrijd-tab, Historie/Planning en Speelrondes beheren op Beschikbaarheid, oude timing/statistiekblokken en het oude score-/matchkeuzepad. Die verwachtingen zijn niet vervangen door slappere controles en de tests zijn niet overgeslagen. Ze vragen om apart onderhoud aan de bredere suite; er wordt geen volledig groene totaalsuite geclaimd. Een falende assert alleen bewijst bovendien niet dat elke bijbehorende productfunctie foutloos werkt.

| Testbestand | Resterend mislukt |
| --- | ---: |
| `attendance-batch-review.spec.ts` | 2 |
| `backend-app.spec.ts` | 1 |
| `coach-app.spec.ts` | 5 |
| `dashboard-review.spec.ts` | 1 |
| `ios-all-screens.spec.ts` | 4 |
| `ios-upgrade.spec.ts` | 1 |
| `live-review.spec.ts` | 2 |
| `local-cache-review.spec.ts` | 1 |
| `real-device.spec.ts` | 1 |
| `team-size-review.spec.ts` | 1 |
| `ux-review.spec.ts` | 2 |
| `venue-order.spec.ts` | 2 |


## Actieve ronde en voorbereiding in twee stappen — 21 oktober 2026

De laatste goedgekeurde indeling is geïmplementeerd. Het hoofdscherm heeft geen rondekeuze meer; een rustige contextregel hoort bij het reactie-overzicht en de compacte wedstrijden. Uitnodigingen/verzenddetails en eerdere rondes openen afzonderlijk. Nieuwe ronde voorbereiden / Voorbereiding hervatten staat afgescheiden onder de lijst en opent een schermvullende route met vaste navigatie. Stap 1 verenigt bestaande Sheets-wedstrijden en invoer in de app, expliciet opslaan en formulier voorbereiden; stap 2 bevat selectie, kanaal en expliciete uitnodiging. De nieuwe uitvraag wordt pas actief na expliciet starten. Google-koppeling en clubopmaak blijven bij Instellingen.

Een nieuwe expliciete save-round-matches-actie kan wedstrijden binnen de ronde aanvullen en aanpassen. Opgeslagen wedstrijden mogen niet worden verwijderd of naar een andere ronde verschoven; lopende/verwerkte wedstrijden zijn beschermd. Alleen nieuwe matches krijgen onbekende aanwezigheid. Bestaande antwoorden, coachmarkeringen, doelen, tijden, andere teams en coachkolommen blijven behouden. Een reeds bestaand rondeformulier blokkeert stille programmawijzigingen. Bronvernieuwing behoudt lokale aanvullingen en vereist expliciete oplossing bij conflicten. Een onopgeslagen wedstrijdjournal wordt nooit door bronvernieuwing vervangen.

Oudere drie-stappenconcepten behouden hun wedstrijden, kanaal en geselecteerde spelers. Datumvelden verwerken ISO, dd-mm-yyyy en Nederlandse maandnamen. Bij een bestaand formulier blijft de originele bronnotatie intact; die wordt niet omgeschreven door alleen naar uitnodigingen te gaan. Een formulieropdracht en persoonlijke links moeten gereed en gecontroleerd zijn voordat stap 2 automatisch opent. Er is geen automatische uitnodiging door formulieraanmaak.

### Resultaten

- **168/168 unit- en backendtests geslaagd**, zonder skips: nieuwe rondeopslag, dubbele/ongeldige ID’s, ongeldige datums, historische/lopende wedstrijden, archieven, bronconflicten en Sheets-opslag met behoud van andere teams/coachkolommen. Log: `outputs/availability-two-step-unit.txt`.
- **38/38 gerichte browsertests geslaagd**, zonder skips of flaky gevallen: `availability-journey.spec.ts` (25), `round-review.spec.ts` (2), `availability-round-review.spec.ts` (1), `invitation-flow.spec.ts` (2), `mobile-runtime.spec.ts` (8). Rapport: `outputs/availability-two-step-browser-release.json`.
- Browsertests behandelen invoer in de app, een bestaande Sheets-ronde met een extra app-wedstrijd, bronvernieuwing met conflicten, herladen, conceptmigratie en teamscope, verloren verzendantwoord zonder dubbele uitnodiging, formulierfouten/wachtrij, WhatsApp zonder verzendclaim, archieven, veilige navigatie en bereikbare acties op 320/390px plus de mobiele runtime.
- TypeScript en productiebuild slagen; alle **28 beschermde runtimebestanden** zijn intact. Log: `outputs/availability-two-step-build.txt`. Ook de syntaxiscontrole van `server/index.mjs` slaagt. De bestaande bundlegroottewaarschuwing blijft.

De in-app demo is visueel gecontroleerd en staat op Beschikbaarheid open. Er zijn geen echte Google-formulieren aangemaakt, e-mails verstuurd of deployments uitgevoerd. De Google-routes in de browsertests gebruiken een nagebootste backend; dit is geen test op een fysieke iPhone of volledige toegankelijkheidsaudit. De oudere overige UI-testbestanden uit het eerdere brede rapport zijn niet volledig herhaald.

![Actieve ronde](../outputs/availability-two-step-overview.png)

![Wedstrijden voorbereiden](../outputs/availability-two-step-matches.png)

![Uitnodigen](../outputs/availability-two-step-invite.png)
