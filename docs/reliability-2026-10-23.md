# CoachMate — betrouwbaarheid en uitnodigingen, 23 oktober 2026

## Wat is gewijzigd

Statusmeldingen zijn iOS-achtige overlays zonder verschuivende scherminhoud, onder de modal-laag. De navigatie is compacter met behoud van de fysieke veilige onderrand. Meer opent conceptopties in een telefoonsheet. Opnieuw en de foutmelding openen bij een bronconflict een expliciete vergelijking met de actuele bron; herstel bewaart eerst de oorspronkelijke lokale export. Een verloren antwoord gebruikt hetzelfde batchnummer, zodat opnieuw opslaan geen doelpunten verdubbelt. Verwerken meldt fouten ook in het afsluitvenster. Netwerkverzoeken hebben een grens van 30 seconden; een timeout bevestigt geen opslag en wist geen concept.

De conflictcontrole is gescheiden van automatisch gewijzigde Forms-/verzendgegevens en andere teams. Echte wijzigingen aan het eigen team/seizoen blijven beschermd. De schrijfcontrole vergelijkt alle tabellen die de operatie vervangt, met de vers gelezen bron; niet-vervangen tabellen worden niet overschreven.

Opstarten heeft één laadscherm tot sessie en team bekend zijn. De dubbele startup-effecten zijn voorkomen. Het enige of onthouden team wordt samen met de formuliergegevens vanuit één Sheets-snapshot geladen: twee appverzoeken (/api/session en /api/teams), zonder aparte state/forms-rondreizen. De server comprimeert tekstbestanden en geeft gehashte assets immutable caching; HTML blijft vers.

Sessiecookies zijn authenticated-encrypted (AES-GCM), HttpOnly, SameSite=Lax en op HTTPS Secure. Google-refreshgegevens verlaten deze beveiligde cookie/servercontext niet richting webopslag. De sessie kan tot 30 dagen blijven gelden en overleeft een Cloud Run-herstart, zolang Google-toestemming geldig blijft. Eenmalig opnieuw inloggen na uitrol migreert de oude geheugensessie. Een ingetrokken of eerder aflopende Google-toestemming kan opnieuw inloggen vereisen.

## Uitnodigingen

De gevraagde korte tekst gebruikt de eerste naam uit Players.parentName (bestaand parent als fallback), shortName en de ronde. {parentName}, {shortName} en {speelronde} zijn ook in aangepaste tekst beschikbaar. Elk bericht bevat één persoonlijke, gecontroleerde korte startlink met behoud van een werkende lange fallback. Een e-mailbatch bewaart zowel de template als het volledig gerenderde persoonlijke bericht, zodat een latere bronwijziging het bericht niet stilzwijgend wijzigt.

Nog te verzenden en Uitgenodigd zijn apart. In wachtrij, verwerking, onzeker, verstuurd of reeds gereageerd sluit een nieuwe startuitnodiging uit, ongeacht kanaal. Het API en de mailworker bewaken dit ook. Bevestigingsmails sturen niet langer automatisch links mee. De echte Google-editUrl blijft opgeslagen; Wijzigingslink nasturen maakt alleen na een inzending een apart WhatsApp-bericht met die bewerklink.

Alle geselecteerde WhatsApp-berichten worden tegelijk als lokale, bevroren persoonlijke concepten bewaard. Per speler zijn WhatsApp en (bij bekend telefoonnummer) WhatsApp Web bereikbaar. Geopend is geen verzonden. Alleen Ik heb dit bericht verstuurd maakt na expliciete coachactie een gedeeld verzendrecord. WhatsApp biedt click-to-chat met vooraf ingevulde tekst; CoachMate maakt geen stille drafts in WhatsApp zelf. Oude lokale rijgegevens worden als migratiegegevens behouden.

## Exportonderzoek

De aangeleverde export is uitsluitend lokaal gelezen. Deze bevat een onbevestigde wissel, revisie 41, en een live-snapshot zonder doelpunten en zonder verstreken speeltijd. De 11 doelpunten uit een van de screenshots staan niet in dit bestand en zijn niet gereconstrueerd of naar Google geschreven. De export bevat geen bewijs dat de gebruiker werkelijk een conflict met een andere coach had: het eerdere volledige bronfingerprint veranderde ook bij een worker-heartbeat.

## Uitrol en controle

Werk frontend en backend samen bij. Werk AvailabilityMail.gs en Distribution.gs in hetzelfde bestaande afzonderlijke Apps Script-project bij; behoud triggers en bronvraag-ID's. Worker-invitations-v3 is vereist voordat nieuwe e-mails worden klaargezet. FormDeliveries krijgt alleen achteraan renderedMessage; oude rijen en kolommen blijven leesbaar. Players.parentName is optioneel.

186 unit-/backendtests en 33 gerichte browsertests zijn geslaagd. De browsertests gebruiken nagebootst Google-verkeer en controleren foutafhandeling, idempotente retries, expliciet herstel, laadscherm, twee-verzoeken-bootstrap, statusoverlay, onderste navigatiegrens, lokale WhatsApp-concepten en de afzonderlijke editlink. TypeScript en de productiebuild slagen; alle 28 beschermde runtimebestanden zijn intact. De in-app desktoppreview is visueel gecontroleerd. Geen echte Google-login-, fysieke iPhone- of mailbezorgtest, productie-uitrol, uitnodigingen of bronmutaties zijn uitgevoerd.

Referenties: [WhatsApp click-to-chat](https://faq.whatsapp.com/5913398998672934), [Google OAuth offline access](https://developers.google.com/identity/protocols/oauth2/web-server#offline).

## Follow-up v30: aanhef en muisaanwijzer

Het demo-uitnodigingsvoorbeeld gaf parentName/parent en shortName niet door. Het gebruikt nu dezelfde aanhefopmaak als het verzonden bericht; de eerste naam van de geselecteerde ouder vervangt de generieke aanhef. Een expliciete parentName heeft voorrang boven de oude parent-kolom.

De beschikbaarheidsportalen blokkeerden pointermove, waardoor PhoneFrame de aangepaste muisaanwijzer niet kon bijwerken. Alleen het starten/eindigen van een sleepgebaar blijft geïsoleerd; bewegingen bereiken de bestaande cursor. De beschermde runtime is niet gewijzigd.

9/9 gerichte uitnodigingsbrowsertests, TypeScript, de productiebuild en de integriteitscontrole van 28 runtimebestanden slagen. De browsertests controleren cursorpositie boven de lijst en het bericht, scrollen zonder aanvinken of achtergrondbeweging, aanhef per geselecteerde demo-ouder en expliciete parentName-voorrang in een Google-fixture. Dit vervolg is lokaal gecontroleerd; niet gedeployd.

## Follow-up v31: vaste uitnodigingsbalk en werkende navigatie

In de geopende desktoppreview was device-screen.scrollTop 54 geworden. De browser kon deze met overflow:hidden begrensde voorouder bij focus nog steeds scrollen; daardoor verschoven de header en klikdoelen ten opzichte van de vaste camera. De bestaande safe-area van de header was correct.

Alleen zolang een schermvullende beschikbaarheidspagina open is, gebruikt de desktop device-screen nu overflow:clip. Die voorouder kan niet meer scrollen; inhoud blijft via de bestaande MobileScroll bewegen. Geen extra headerpadding of wijziging aan beschermde runtimebestanden. De native schermmodus blijft zijn bestaande fysieke veilige ruimte gebruiken.

14/14 gerichte browsertests slagen. De regressie reproduceerde vóór de correctie de verschoven voorouder (scrollTop 54) en controleert nu scrollTop 0, vaste headerpositie, echte muisklikken op Terug/Sluiten, tekstfocus/Tab, toetsenbord sluiten en behoud van de berichttekst. Ook iPhone-/Pixel-desktopframes en native schermmodus zijn gecontroleerd. De overige uitnodigingstests controleren opnieuw cursor, lijstslepen, aanhef en bericht-/verzendconcepten. Build en 28 beschermde runtimebestanden slagen. In de geopende in-app preview zijn beide knoppen en de vaste balk bij open toetsenbord rechtstreeks gecontroleerd. Geen productie-uitrol.


## Statistieken en wisseladvies

De registratiegrens is expliciet gescopeerd op `hfc-edo-jo10-2-2026-2027`: ronde 1 telt alleen voor doelen en 50 wedstrijdminuten per verwerkte wedstrijd; de overige individuele cijfers tellen vanaf ronde 2. `team.fullStatsFromRound` is een optionele, gevalideerde teamseizoeninstelling; oudere staten behouden hun schema en andere teams/seizoenen behouden hun oude dekking. De geïsoleerde ontwerpvoorbeelden gebruiken dezelfde grens. Dit is een projectie op de bestaande gegevens, geen destructieve migratie van historische rijen. Correcties van doelen bewaren verborgen bronminuten en aanwezigheid. Nieuwe historische doelpuntrijen houden de minuten onbekend. Ronde-1-import vereist geen keeper-/afwezigheidsgegevens; uitslag en scorers blijven gevalideerd en de import blijft atomair/idempotent.

Overzicht en Statistieken tonen eenmaal de duur per verwerkte wedstrijd. Ronde 1 gebruikt 50 minuten; vanaf volledige registratie heeft een live archief/de afgesloten actieve wedstrijd voorrang op historische duur. Rust telt niet mee, extra speeltijd wel. Individuele minuten en aanwezigheid gebruiken alleen volledige registratieronden, inclusief de juiste wedstrijdnoemer en onbekende/rangloze waarden. Hetzelfde filter geldt voor de historie van de wisselassistent en de keepervoorstellen. Onverwerkte wedstrijden tellen niet mee. Gearchiveerde seizoenen blijven alleen lezen.

Het wisselplan verandert niet: de uitklaplijst maakt de werkelijke bezetting en de namen bij elke overgang zichtbaar. Bij 9 aanwezigen en een 6-persoonsveld blijven steeds 3 spelers op de bank, ook wanneer maar 2 spelers wisselen. De lijst benoemt de speler die blijft zitten, plus eventuele keeperwissel. In het bestaande demo-voorstel blijft Mats bij beide wissels in kwart 3 op de bank. Het plan heeft nog steeds een maximale afwijking van 1,7 minuut van de streeftijd.


Validatie: 193/193 unit-/backendtests; 39/39 unieke gerichte browsertests (30 wedstrijdvoorbereiding, 4 tabnavigatie en 5 statistiekendekking). De statistiekentests toetsen 50 + 53,5 = 103,5 teamminuten in plaats van de som van spelersminuten, doelpunten over beide rondes, alleen ronde-2-minuten en aanwezigheidsnoemer, geen individuele nul/rang bij uitsluitend ronde 1, behoud van verborgen broncijfers na correctie, halve-minuutcorrecties in ronde 2, archief alleen lezen en de juiste afsluitpreview. Een extra domeintest controleert dat de nieuwe registratiegrens een oud advies ongeldig maakt zonder het opgeslagen plan te herschrijven. Bestaande runtimebestanden zijn intact en de build slaagt. Geen Google-gegevens gewijzigd en geen live uitrol uitgevoerd.
