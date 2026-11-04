# Wisselassistent — fase 3

De deterministische kern is aangesloten op de bestaande CoachMate-interface, wedstrijdreducer en lokale opslag. Vertex AI is niet toegevoegd; er zijn geen Google Cloud-instellingen gewijzigd en er is niets gedeployd.

## Gebruik

Voor de aftrap staat **Spelersgroep en wisselplan** bij de dashboardsectie **Wisselplan**. De flow is: spelers bevestigen, direct het eerste voorstel berekenen, daarna handmatig aanpassen en bevestigen voor Live. Dezelfde voorbereiding is bereikbaar vanuit de Wisselassistent bij Live. Onbekende aanwezigheid moet expliciet worden bevestigd; er moeten minstens evenveel aanwezige spelers als veldplaatsen zijn.

**Bevestigen en verder** bewaart in één lokale actie de definitieve aanwezigheid met handmatige voorrang, de voorgestelde wedstrijdkeepers en een gevalideerd scenario. De eerste bezetting uit dat scenario wordt de startopstelling. Dit start geen klok en registreert geen gespeelde wissel of keepercorrectie. Een ongeldige keuze of onhaalbaar plan laat de volledige bestaande toestand intact en opent het bewerkbare concept voor een correctie. **Bevestigen en naar Live** accepteert uitsluitend een actueel doorgerekend voorstel; de coach start de wedstrijdklok zelf.

Het startplan combineert startbank en berekend wisseladvies; de lijst Alle wisselmomenten vervalt hier. Het toont vier mogelijke keeperkeuzes voor de hele wedstrijd, ook bij twee helften. Keeper 1 begint op doel. Een eerste voorstel gebruikt twee kandidaten als die beschikbaar zijn; expliciet ongeschikte bronkandidaten worden niet automatisch gekozen. Bekende eerdere keeperbeurten hebben voorrang, daarna geschiktheid/voorkeur. Onbekende keeperminuten en toekomstige wedstrijden leveren geen verzonnen ervaring op. De coach mag één tot vier aanwezige spelers voor deze ene wedstrijd aanwijzen. Dit verandert geen seizoensprofielen. Replanning blijft uitsluitend de gekozen wedstrijdkeepers gebruiken.

De uitklapbare **Startopstelling** groepeert Keeper, Verdediging, Middenveld en Spits. Ontbrekende posities worden niet verzonnen. De coach kan posities wijzigen en spelers tussen startveld en bank verplaatsen. Dit staat eerst in een scoped lokaal concept. **Wijzigingen doorrekenen** valideert en berekent het hele voorstel opnieuw, met de gekozen starters als harde constraint en zonder een gespeeld event te registreren. Tijdens onberekende wijzigingen blijft definitief bevestigen geblokkeerd. Posities gelden voor deze startopstelling en vormen geen verzonnen tactische kwaliteitsscores. Het dashboard onderscheidt het berekende/aangepaste voorstel van het door de coach bevestigde plan.

De assistent kiest een praktisch wisselinterval; het startplan heeft geen ritmekeuzemenu. Voor bevestiging vergelijkt `recommendCadence` geldige plannen met 5 minuten, 10 minuten en uitsluitend periodeovergangen. Eerst geldt de bestaande onafhankelijke fairnessmarge, vervolgens de bestaande beleidsscores voor rotatie, rust en bundeling. Dit is een begrensde heuristische vergelijking, geen bewijs van het globale optimum. De gekozen cadence staat expliciet in de lokale opdracht en bevestiging. De optimizer berekent hele blokken op dat rooster, met periodeovergangen en een herstart van het interval per periode. Vrije secondenmomenten worden niet achteraf afgerond. Het scherm toont een compacte instructiesamenvatting: momenten vanaf het begin van elk kwart/elke helft, afzonderlijke pauzewissels en het werkelijke aantal spelers erin en eruit. Alleen identieke patronen worden gegroepeerd; afwijkingen blijven expliciet gekoppeld aan hun kwart/helft. Keeperwissels worden afzonderlijk vermeld; een keeper die van of naar de bank gaat telt mee in de bezettingsaantallen. Een keeperrolwissel zonder bankbeweging is geen extra bankwissel. De werkelijke maximale streeftijdafwijking blijft zichtbaar. Bij gewijzigde keeper- of opstellingskeuzes verdwijnt het verouderde advies totdat opnieuw is berekend. Als geen praktisch kandidaatplan geldig is, blijft bevestigen geblokkeerd; er volgt geen stilzwijgende terugval naar secondenprecisie.

Oude opdrachten zonder cadence en expliciete oude vrije `auto`-opdrachten behouden hun replaybetekenis. Nog niet gestarte vrije plannen worden pas na expliciete spelersbevestiging praktisch herberekend, met behoud van keeper- en opstellingskeuzes. Live-herplanning blijft op het vastgelegde rooster; een daadwerkelijk later uitgevoerde wissel wordt met de echte tijd geregistreerd. De eerste resterende bezetting begint op dat werkelijke tijdstip, daarna volgen de toekomstige roosterpunten. Geplande momenten zijn advies: de coach wisselt bij een geschikt stil spelmoment en bevestigt de echte uitvoering. Zie [de huidige verificatie](practical-interval-tests.md).

Tijdens een al begonnen wedstrijd kan **Live → Wisselassistent → Wisselplan maken** een voorstel voor de resterende wedstrijd maken. De opstelling moet het ingestelde aantal bevestigde aanwezige spelers bevatten en een geschikte keeper hebben. Ontbrekende bevestigingen worden niet als aanwezigheid ingevuld. Bestaande lopende wedstrijden kunnen verder geregistreerd worden zonder een nieuwe voorbereiding die hun echte tijd zou resetten.

Het telefoongebonden detailblad toont de eerstvolgende spelers eruit/erin, keeper, voorgesteld actief tijdstip, alle wisselmomenten, eindminuten inclusief keeperminuten, uitleg en alternatieven. Controleer voor de aftrap eerst de opstelling en keeper. **Advies accepteren** verandert geen bezetting, minuten of wisselregistratie. Alleen **Wissel als uitgevoerd registreren** wijzigt de bezetting nadat de coach de echte uitvoering bevestigt. Vervroegde bevestiging kan, mits de bezetting op dat werkelijke tijdstip geldig is. Zo kan de coach tijdens een spelonderbreking eerder wisselen.

**Aanpassen** wijzigt de volgende voorgestelde bezetting, niet de werkelijke opstelling. De volledige resterende bezetting wordt opnieuw gevalideerd en de scores/eindminuten worden opnieuw berekend. Daarna is nieuwe acceptatie vereist. Een handmatige afwijking wordt expliciet benoemd; de app doet niet alsof dit nog het oorspronkelijk geoptimaliseerde plan is.

**2 min uitstellen** wacht twee actieve speelminuten. Rust en stilstaande klok tellen niet mee. Daarna berekent de app een nieuw voorstel dat opnieuw geaccepteerd moet worden. **Overslaan** blijft behouden bij tabwisselen en herladen. Een relevante nieuwe wedstrijdwijziging of expliciet opnieuw berekenen kan daarna een nieuw voorstel opleveren.

## Automatische herplanning en herinneringen

Een centrale controller in de bestaande app herberekent ook als Live niet zichtbaar is, zolang de app geopend is. Triggers zijn een uitgevoerde advieswissel, handmatige wissel, keeperwijziging, aanwezigheidscorrectie, periodecorrectie/-overgang, scorewijziging, gewijzigd beleid/profiel of het verstrijken van een uitstel. Ook een onuitgevoerd wisselmoment dat meer dan één actieve minuut voorbij is, leidt tot herplanning. Een nieuw voorstel is nooit automatisch geaccepteerd of uitgevoerd.

Gewone klokticks houden een geaccepteerd advies geldig. De onafhankelijke `live.adviceEpoch` en een contexttoken onderscheiden relevante wijzigingen van het enkel verstrijken van tijd. Het contexttoken omvat ook de actuele seizoensroster/profielen, aanwezigheid, teaminstellingen en statistieken: een wijziging in Sheets wordt daarmee herkend, ook zonder lokale epochwijziging. De daadwerkelijke uitvoering rekent de bestaande klok opnieuw af en controleert de volledige bezetting, beschikbaarheid, geschikte keeper en persoonlijke limieten.

De herinnering verschijnt op de Live-kaart vanaf het ingestelde aantal seconden voor het volgende wisselmoment. Zij gebruikt `live.elapsedMs` uit de bestaande klok. Dit zijn herinneringen **in de geopende app**, geen pushberichten of toezegging dat een gesloten/gepauzeerde browser op de achtergrond blijft draaien. Bij terugkeer blijft de bestaande klok leidend.

## Instellingen

**Instellingen → AI-wisselassistent** bevat de drie gewichten, historische compensatie, referentieperiode, maximale correctie, bundelen, periodeovergangen, hele bankperioden, keepersvoorkeur en herinneringstijd. De groep **Geschikte keepers** bewerkt de reeds bestaande `Players.substitutionProfile`-metadata; zij introduceert geen tweede spelersadministratie. Bestaande kwaliteitsscores en overige profielvelden blijven behouden.

Wijzigingen blijven eerst als concept op het apparaat staan, gescopeerd op account en teamseizoen. **Wisselinstellingen opslaan** verwerkt de profiel- en beleidsacties samen in de bestaande batch. De backend bewaart de profielwijzigingen met behoud van andere broncellen in de Players-rijen en het versiebeleid in de State-JSON. De bestaande bron-/revisiecontroles gelden. **Standaardwaarden herstellen** vult eerst een lokaal beleidsconcept in; pas Opslaan verwerkt dit als een nieuwe beleidsversie. De expliciete geschiktheid van spelers blijft behouden.

## Registratie en synchronisatie

- `CoachState.assistant[matchId]` bewaart het actuele scenario, match-/team-/status-/regel-/beleidsversie, aanmaakdatum, status, eerste geaccepteerde persoonlijke streeftijden en idempotente besluit-events. Elk event bewaart ook de toen voorgestelde spelers/keeper, het geplande moment, de verwachte eindminuten, scores en redencodes. Een nieuw voorstel wist de eerdere adviesdetails niet; de werkelijke uitvoeringstijd staat apart van het geplande moment.
- `assistant-prepare`, `assistant-plan`, `assistant-decision`, `assistant-adjust` en `assistant-execute` lopen via de bestaande reducer. De browser verzendt bij een Google-team geen berekende tabellen: de bestaande backend speelt de oorspronkelijke commando's en tijdstippen af en berekent/valideert het plan zelf opnieuw. Voorbereiding heeft een idempotente event-ID en verwachte adviesversie. De bevestigde spelersgroep, keeperkeuze en het ritme blijven ook in het bijbehorende advies-event bewaard.
- Plannen, accepteren, aanpassen, uitstellen en uitvoeren veroorzaken geen losse Google-writes. Ze staan in het bestaande account/team-journal. **Tussentijds opslaan** of **Wedstrijddata verwerken** uploadt de batch expliciet. Na een fout blijven de events en dezelfde batch-ID bewaard voor **Opnieuw opslaan**.
- Eén `assistant-execute` rekent de verstreken tijd eenmaal af en vervangt veld plus keeper in één consistente overgang. Herhaalde event-ID's zijn idempotent. Verouderde/ongeldige commando's laten de backendbatch geheel mislukken; er wordt geen deel opgeslagen.
- `LiveMatch.keeperChanges` registreert ook keeper-/veldpositiewissels op hun exacte actieve tijdstip. `live.occupancy` en de bestaande ongeronde `played`-waarden blijven leidend voor echte minuten. Keeperminuten leveren nooit automatisch extra veldminuten op.
- Afsluiten legt de eerste geaccepteerde persoonlijke streeftijden als `MatchStat.targetMinutes` vast, zodat volgende wedstrijden bekende historische compensatie kunnen gebruiken. Oudere onbekende streeftijden blijven onbekend.
- Archieven blijven alleen-lezen. Bij de eerste club-ID-migratie worden de nieuwe advies-foreign keys mee gemigreerd en de oude adviescontext ongeldig gemaakt; de historie blijft bestaan.

Er worden geen echte spelersnamen of contactgegevens naar AI gestuurd. Er is in deze fase geen AI-verzoek of Vertex-afhankelijkheid.

Een latere productie-uitrol moet frontend en backend samen bijwerken: de nieuwe batchcommando's worden door de bestaande deployment van vóór fase 3 nog niet verwerkt.

## Lokale demo en tests

De ontwikkelpreview `http://localhost:4186/?design=assistant` bevat 11 fictieve aanwezige spelers, acht plaatsen en drie geschikte keepers. Zij heeft een eigen opslagnaam en doet geen Google-verzoeken. De gewone lokale demo en Google-teams blijven apart. `case` in de query kan een aparte demo-wedstrijdopslag kiezen. Dit ontwikkelpad zit niet als actieve demo-modus in de productiebuild.

De nieuwe Node-tests staan in `tests/recommendations.test.mjs`, de browsertests in `tests/substitution-assistant.spec.ts`. Voor de bestaande draaiende preview is `playwright.preview.config.ts` toegevoegd. Dit voorkomt een tweede npm/Vite-procesboom en de hier gevonden Windows-afsluitproblemen van de zelfgestarte testserver.

Zie [het fase-3-testrapport](substitution-phase-3-tests.md) voor de aantallen, nieuwe flows en volledige regressiesuite. De eerdere [architectuur en zoeklimieten van de kern](substitution-optimizer.md) blijven gelden: dit is een begrensde heuristiek, geen garantie op een wereldwijd optimum voor iedere mogelijke beperking.

Volgende fase: een afzonderlijke server-side Vertex-adapter met gevalideerde gestructureerde output en fallback. De deterministische adviezen blijven daarvan onafhankelijk.

De voorbereiding gebruikt nu twee aparte schermvullende pagina’s: eerst uitsluitend Spelersgroep, daarna Wisselplan met keepers en opstelling. Zie [de UX-wijziging en verificatie](start-plan-two-step-tests.md).


## Vervolg: concrete wisselinstructies

De algemene zin over een interval is vervangen door momenten en aantallen uit de werkelijke bezettingswissels. Zie [verificatie van de instructies](rotation-instructions-tests.md). Het rooster, de berekening en de opgeslagen echte minuten zijn voor deze presentatiewijziging niet aangepast.
