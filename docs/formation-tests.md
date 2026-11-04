# Veldopstelling en opstellingsvarianten — 21 oktober 2026

Startopstelling in stap 2/2 toont een compact voetbalveld met aanval boven, verdediging onder, een aparte keeperplek en de startbank eronder. De formatiekeuze bevat uitsluitend varianten die passen bij het ingestelde aantal spelers. Tik op een veldplek om via een toegankelijke keuzelijst een aanwezige speler te kiezen. Een veldspeler wisselt van plek, een bankspeler vervangt die starter. Een lege plek blokkeert berekenen en bevestigen. De startkeeper blijft via de bestaande keeperkeuze aanpasbaar.

## Varianten en opslag

- Zes spelers inclusief keeper: 2-2-1 en 2-1-2.
- Acht spelers inclusief keeper: 3-3-1, 2-3-2 en 3-2-2.
- Elf spelers inclusief keeper: 4-3-3, 4-4-2, 3-4-3 en 4-2-3-1.
- Onder Instellingen → Opstellingsvarianten kan de coach eigen varianten per teamgrootte toevoegen en verwijderen. Getallen lopen van verdediging naar aanval; de keeper telt niet mee. Twee tot vijf linies worden ondersteund, met meerdere middenveldlinies waar van toepassing. Per linie zijn maximaal vijf spelers toegestaan. Dubbele varianten en verkeerde totaalaantallen worden afgewezen.
- Concepten blijven lokaal bewaard per account/teamseizoen, ook na herladen. Formatie toevoegen wijzigt eerst het concept; uitsluitend Formaties opslaan verwerkt het via de bestaande opslag/batchroute. Verwijderen van een eigen variant verandert een opgeslagen wedstrijdplan of historische formatie niet.
- De expliciet gekozen formatie, geordende startspelers en bijbehorende posities blijven in de wedstrijdvoorbereiding en oorspronkelijke journalopdracht staan. Browser en backend valideren en reproduceren ze. De bestaande Sheets State-JSON bewaart de metadata; er is geen extra bronkolom of spelersadministratie toegevoegd.
- Handmatige wijzigingen vereisen herberekening. De optimizer blijft de gekozen startgroep en keeper als harde constraints gebruiken. Bronposities, kwaliteitsscores, werkelijk gespeelde minuten en seizoensprofielen worden niet gewijzigd. Een eerste visuele verdeling zonder expliciete coachkeuze is een voorstel op basis van bestaande posities, geen nieuwe bronwaarheid.

## Verificatie

`outputs/formation-unit.txt`: **158/158 unit- en backendtests geslaagd**, zonder overgeslagen tests. Nieuwe gevallen verifiëren geldige varianten voor alle teamgroottes, meerdere middenveldlinies, behoud van starters/bronrollen, uitsluiting van dubbele spelers en corrupte metadata, harde startgroep-/keeperregels, exacte speler- en keeperminuten, oude metadata zonder formatie, historische snapshots na verwijderen en de Sheets State-opslag/herlaadroute zonder gegevenslek naar een ander teamseizoen.

`outputs/formation-browser-complete.json`: **37/37 gerichte browsertests geslaagd**, zonder skips of flaky gevallen: 21 voorbereiding, 8 lopende assistent en 8 mobiele runtime. De gerichte gevallen controleren het kiezen en opnieuw berekenen voor 6/8/11 spelers, veld-/bank- en positiewissels, lege plekken, concepten na herladen, eigen varianten met ongeldige/geldige aantallen, smalle 320px-schermen met een linie van vijf aanraakdoelen van minimaal 44×44px, veilige bevestigingsfooter, teamgroottewijzigingen en toetsenbordsluiting na toevoegen. De bestaande Google-casus gebruikt een nagebootste backend en bewaart de expliciete opslag-/retryflow.

`outputs/formation-build.txt`: TypeScript en productiebuild geslaagd; alle **28 beschermde runtimebestanden** zijn intact. De bestaande waarschuwing over bundlegrootte blijft.

De veldweergave en nieuwe instellingen zijn bovendien in de bestaande in-app demo gecontroleerd. Er is uitsluitend in de geïsoleerde demo een voorbeeldvariant toegevoegd. Er is geen echte Google-upload of deployment uitgevoerd. De overige oudere UI-testbestanden zijn niet volledig herhaald; deze resultaten vormen geen fysieke-toesteltest of volledige toegankelijkheidsaudit.


De uiteindelijke demo is met de geselecteerde 2-3-2-formatie opnieuw doorgerekend. De startgroep bleef intact en er werd geen wedstrijdklok of gespeelde wissel gestart. De demo bevat ook de lokaal toegevoegde voorbeeldvariant 2-4-1. De preview is op het veldscherm open gehouden.

![Veldopstelling](../outputs/formation-pitch-preview.png)

![Opstellingsvarianten bij instellingen](../outputs/formation-settings-preview.png)


## Vervolg: standaardvarianten aanpassen en verwijderen

Alle varianten hebben nu een potlood- en prullenbakicoon, ook de oorspronkelijk standaard aangeboden varianten. Groepering gebeurt op het aantal spelers (6, 8 of 11 inclusief keeper). De bestaande opslag per teamseizoen blijft toegestaan en behouden. Een aanpassing opent een editor in dezelfde rij; het vinkje verwerkt de aanpassing in het lokale concept, het kruisje annuleert die rijaanpassing. Formaties opslaan bewaart de gewijzigde lijst. Verkeerde aantallen en dubbele patronen worden afgewezen. De icoonknoppen hebben toegankelijke labels en 44px aanraakdoelen.

Het eerder vast ingevoegde aanbod is vervangen door een expliciet opgeslagen catalogus zodra de coach die wijzigt. Daardoor komen verwijderde standaardvarianten na herladen niet terug. Een lege lijst voor één teamgrootte blijft leeg. Oudere eigen-variantenlijsten, lokale concepten en journalopdrachten behouden hun eerdere betekenis en worden bij het openen veilig gecombineerd met het oorspronkelijke aanbod. Opgeslagen wedstrijdformaties zijn onafhankelijke snapshots en worden niet herschreven.

Verificatie: **160/160 unit- en backendtests** en **33/33 gerichte browsertests** geslaagd, zonder skips of flaky gevallen. De nieuwe gevallen controleren wijzigen/verwijderen van standaardvarianten voor elk spelersaantal, herladen van zowel concept als definitieve lijst, annuleren, duplicate-/totaalvalidatie, oude commando's en lege lijsten. TypeScript en productiebuild slagen; de 28 beschermde runtimebestanden blijven intact. Rapporten: `outputs/formation-icons-unit.txt`, `outputs/formation-icons-browser.json` en `outputs/formation-icons-build.txt`. De overige oudere UI-testbestanden zijn voor deze correctie niet opnieuw uitgevoerd. Geen echte Google-upload of deployment.

De editor en de icoonacties zijn ook in de in-app demo gecontroleerd; de demo is op het beheer voor elf spelers opengehouden.

![Bewerkbare standaardvarianten met potlood en prullenbak](../outputs/formation-icons-preview.png)


## Koppeling aan spelersaantal van het actieve teamseizoen

De formatiekeuze gebruikt uitsluitend de teaminstelling Spelers op het veld, inclusief keeper. De formatie zelf bevat dus 5, 7 of 10 veldspelers. Een groot seizoenroster, aanwezige reserves of het bekijken van een andere spelersaantalgroep in Instellingen verandert de opties van de assistent niet. Het planscherm vermeldt deze bron compact. Een bewaarde formatie die niet bij het actuele aantal past wordt niet als huidige optie aangeboden en blokkeert bevestiging zolang deze niet opnieuw is berekend. Historische snapshots blijven intact.

Verificatie: **161/161 unit- en backendtests** en **35/35 gerichte browsertests** geslaagd, zonder skips of flaky gevallen. De nieuwe regressies controleren dezelfde ruime selectie bij 6/8/11 spelers, afwijkende aanwezigheid, de optimizerbezetting en het bekijken van 11-spelerformaties in beheer terwijl het actieve teamseizoen 6 of 8 spelers gebruikt. De bestaande test voor wijzigen van de teaminstelling controleert ook dat een eerdere 8-spelerformatie verdwijnt bij omschakeling naar 6. TypeScript, productiebuild en de integriteitscontrole van alle 28 beschermde runtimebestanden slagen. Rapporten: `outputs/formation-team-size-unit.txt`, `outputs/formation-team-size-browser.json`, `outputs/formation-team-size-build.txt`. De overige oudere UI-testbestanden zijn niet opnieuw uitgevoerd.

De in-app demo staat op 8 spelers inclusief keeper en toont uitsluitend passende varianten, met het label Teamseizoen: 7 veldspelers + keeper. Geen echte Google-upload of deployment uitgevoerd.

![Formatiekeuze op basis van teamseizoen](../outputs/formation-team-size-preview.png)


## Correctie van de zichtbare zes-spelerdemo en gelijk aanbod

De gemelde demo had een eigen beginconfiguratie met 8 spelers en behield die in geïsoleerde opslag. De assistentdemo gebruikt nu dezelfde standaard van 6 spelers inclusief keeper als de gewone lokale demo. Bestaande opgeslagen teamkeuzes worden niet automatisch overschreven; de geopende demo is via Team en wedstrijd expliciet op 6 spelers gezet en daarna opnieuw berekend. Formatiebeheer toont het actieve spelersaantal, markeert de bijbehorende groep met dit team en onderscheidt het bekijken van andere groepen van het wijzigen van de teaminstelling.

Een gewijzigde of verwijderde variant werd bovendien bij een bewaarde wedstrijdformatie als extra huidige optie teruggezet. Deze wordt nu uitsluitend als uitgeschakelde snapshotwaarde getoond. Alleen de opgeslagen passende catalogusvarianten zijn selecteerbaar. Een snapshot blijft reproduceerbaar zonder de verwijderde variant opnieuw beschikbaar te maken.

Verificatie: **161/161 unit/backendtests** en **37/37 gerichte browsertests** geslaagd, zonder skips of flaky gevallen. Twee nieuwe gevallen controleren de verse zes-spelerdemo en exacte gelijkheid met het aanbod in Instellingen na aanpassen, verwijderen, toevoegen, herberekenen en herladen. Build, TypeScript en alle 28 beschermde runtimebestanden slagen. Rapporten: `outputs/formation-six-unit.txt`, `outputs/formation-six-browser.json`, `outputs/formation-six-build.txt`. De overige oudere browserbestanden zijn niet opnieuw uitgevoerd. Geen Google-upload of deployment.

De bestaande in-app demo is gecontroleerd op Startopstelling 6/6, opties 2-2-1 en 2-1-2 en Teamseizoen: 5 veldspelers + keeper.

![Zes-spelerformatie](../outputs/formation-six-preview.png)
