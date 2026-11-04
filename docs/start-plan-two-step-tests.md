# Startplan: twee aparte schermen

De gebruikersroute is op 18 oktober 2026 vereenvoudigd na expliciete verduidelijking: **eerst uitsluitend spelers bevestigen; daarna keepers en wisselplan**.

## Route en tekst

1. **Spelersgroep**: aanwezige spelers bekijken en aanpassen, daarna **Bevestigen en verder**. Geen keeperkeuzes of wisselritme op deze pagina. De gedeelde lokale aanwezigheidsdraft blijft in gebruik.
2. **Wisselplan**: startbank en automatisch berekend wisseladvies, vier keeperkeuzes (twee ingevuld als suggestie) en de uitklapbare startopstelling. Een terugpijl opent de spelersgroep. Onberekende wijzigingen bieden **Wijzigingen berekenen**; een actueel geldig voorstel biedt **Bevestigen en naar Live**.

Beide stappen zijn schermvullende, telefoongebonden pagina’s met de bestaande FlowStack. De wedstrijdcontext staat één keer in de kop. Lange instructies, herhaalde aantallen, de aparte blauwe stapomschrijving en optioneel-labels bij lege keepervelden zijn verwijderd. De korte teller 1/2 of 2/2 blijft zichtbaar. Minutenaantallen worden alleen bij een actueel doorgerekend plan getoond.

De rekenkern, constraints, het journal en de scheiding tussen accepteren en daadwerkelijk uitvoeren blijven behouden. Een gewijzigde, ongeldige of verouderde planning kan niet voor Live worden bevestigd. Er start geen wedstrijdklok door de voorbereiding.

## Visuele controle

De oorspronkelijke lange sheet mengde uitleg, bevestigde spelers, keeperkeuzes en planresultaten. De nieuwe eerste pagina bevat alleen de selectietaak. De tweede pagina gebruikt meer schermruimte en geeft één actuele hoofdactie.

- De bevestigingsknop op pagina 1 blijft volledig binnen de zichtbare scrollrand; een overgeërfde negatieve ondermarge is gecorrigeerd.
- Scrollinhoud eindigt boven de vaste actie en fysieke/simuleerde veilige onderrand. Het eigen veilige-inset-token blijft buiten de interne toetsenbordvariabele van MobileScroll.
- De actieve FlowStack-pagina heeft een dekkende achtergrond. Een eerdere pagina kan niet tussen kaarten doorschijnen en is niet interactief of toegankelijk zolang de nieuwe pagina actief is.
- Koppen krijgen focus bij de overgang; de dialoognaam volgt de huidige pagina. Teruggaan en sluiten behouden lokale keuzes. Sluiten herstelt focus naar de ingang.

### 1 · Spelersgroep

![Spelersgroep](../outputs/start-plan-two-step-squad.png)

### 2 · Wisselplan

![Wisselplan](../outputs/start-plan-two-step-plan.png)

De screenshot van het planscherm is na de overgang vanuit Spelersgroep gecontroleerd, zodat ook doorschijnen van de vorige pagina is uitgesloten. De originele sheet staat ter vergelijking in `outputs/start-plan-two-step-before.png`.

## Verificatie

- **146/146 unit- en backendtests geslaagd**: `outputs/start-plan-two-step-unit.txt`.
- **27/27 gerichte browsertests geslaagd**, zonder overgeslagen of flaky gevallen: 11 voor de voorbereiding, 8 voor de lopende assistent en 8 voor de mobiele runtime. Getest zijn spelersbevestiging, vier keeperkeuzes, bank-/positieaanpassingen, onhaalbare plannen, herladen, lokale Google-batches en retry; daarnaast veilige schermranden op 320px, 390px, gekalibreerde iPhone en Pixel, bestaande Live-assistent en runtimegebaren. Definitief rapport: `outputs/start-plan-two-step-final-browser.json`.
- Productiebuild en TypeScript geslaagd, alle **28 beschermde runtimebestanden** intact: `outputs/start-plan-two-step-build.txt`.

De gehele oude browserreeks is voor deze beperkte vervolgwijziging niet opnieuw uitgevoerd. De eerder gerapporteerde 23 bredere UI-testproblemen zijn hiermee niet opgelost of opnieuw beoordeeld. Deze verificatie omvat geen echte Google-upload of fysiek toestelonderzoek; de Google-casus gebruikt een nagebootste backend. Er is geen volledige toegankelijkheidsconformiteit vastgesteld.


## Correctie: ingang vanaf Overzicht

De ingang sloeg bij een eerder bevestigd plan of bewaard concept de spelerspagina over. Dit is gecorrigeerd: **Spelersgroep en wisselplan opent altijd stap 1/2**. Alleen Bevestigen en verder opent stap 2/2. Keeper-, ritme- en opstellingsconcepten blijven behouden; een ongewijzigde spelersgroep veroorzaakt geen nieuwe berekening of toepassing van onberekende keuzes.

Voor deze correctie zijn **12/12 voorbereidingsbrowsertests geslaagd**, inclusief de nieuwe regressietest voor heropenen na bevestiging en na herladen met een bewaard concept. Productiebuild, TypeScript en controle van alle 28 runtimebestanden slagen. Rapporten: `outputs/start-plan-entry-browser.json` en `outputs/start-plan-entry-build.txt`. De eerder genoemde 146 unittests en overige browsergevallen zijn voor deze kleine vervolgcorrectie niet opnieuw gedraaid.


## Eerdere correctie: assistent bepaalt wisselmomenten (vervangen)

Deze uitvoering bracht onpraktische secondenprecisie terug en is vervangen door [praktisch intervaladvies](practical-interval-tests.md). De onderstaande resultaten documenteren de eerdere uitvoering.

De ritmekeuze is op verzoek verwijderd. Nieuwe UI-opdrachten gebruiken expliciet automatische momenten; het read-only wisseladvies komt uit de echte eerste bezettingswijziging van het berekende plan. Bij wijzigingen wordt geen verouderd tijdstip getoond. Oude lokale ritmeconcepten behouden de coachkeuzes maar krijgen een herberekening voordat ze bevestigd kunnen worden. Bestaande opgeslagen gebeurtenissen en opdrachten zonder ritmeveld behouden hun oude replaybetekenis.

Verificatie: **147/147 unit- en backendtests**, **21/21 gerichte browsertests** (13 voorbereiding, 8 lopende assistent), productiebuild/TypeScript en **28/28 runtimebestanden** geslaagd. De tests controleren onder meer automatische momenten zonder vaste intervalregel, 400 speler-minuten en 50 keeperminuten, geselecteerde keepers, migratie, het echte getoonde eerste moment en het verbergen van verouderde tijden. Rapporten: `outputs/assistant-moments-unit.txt`, `outputs/assistant-moments-browser.json`, `outputs/assistant-moments-build.txt`. Geen volledige herhaling van de brede oude UI-suite of echte Google-upload uitgevoerd.

![Wisseladvies zonder ritmekeuze](../outputs/assistant-moments-preview.png)
