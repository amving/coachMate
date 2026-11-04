# Wisselassistent — fase 1 en 2

## Reikwijdte

Deze oplevering bevat de technische, deterministische basis. De app toont nog geen nieuwe advies- of instellingeninterface. Coachbesluiten, herinneringen, uitvoering vanuit een advies en Vertex AI horen bij fase 3/4. Er zijn geen nieuwe frameworks, databases, cloudservices, credentials of deployments toegevoegd.

## Architectuuranalyse (fase 1)

| Onderdeel | Bestaande bron en hergebruik |
| --- | --- |
| Frontend | React 19, TypeScript, Vite; `Prototype.tsx` met beschermde mobiele runtime. Geen schermwijzigingen in deze fase. |
| Applicatiemodel | `CoachState` / `Catalog` / `LiveMatch` / `MatchStat` in `src/coach-state.ts`. Eén reducer beheert klok, keeper, wissels, doelen en aanwezigheid. |
| Wedstrijdinstellingen | `team.fieldSize` (6/8/11 inclusief keeper), `team.periods` en `live.periods` (2/4). De bestaande reguliere duur is 50 minuten; deze waarde is nu geëxporteerd als `MATCH_DURATION_MINUTES`, zonder tweede instelling. Live mag maximaal 120 minuten registreren. |
| Tijd | `settleLive` rekent werkelijk verstreken actieve kloktijd toe aan de actuele bezetting. Rust gebruikt `breakMs` / `breakSince`. `periodTimes` zijn werkelijk geregistreerde tijden. De optimizer start geen klok. |
| Registratie | `live.played` bewaart totale en keepermilliseconden; `live.swaps` bevat spelers en afgeronde minuut. `liveArchive` bewaart afgesloten wedstrijden. De bestaande eindstatistieken ronden op hele minuten; de optimizer gebruikt ongeronde livegegevens. |
| Opslag | Google Sheets: Seasons, TeamSeasons, Players, Matches, State, Availability, MatchStats en Forms-tabellen. `State` bewaart JSON in delen per stabiele `teamSeasonId` met revisie. Geen Firebase-database aangetroffen. |
| Offline/synchronisatie | Lokale, op account/team gescopeerde journalen; `action-batch.ts` speelt oorspronkelijke actie-tijden af. Bestaande batch-ID's en revisie/bron-token voorkomen dubbele upload en stille conflicten. |
| Backend | Node HTTP-server; Sheets/Forms via bestaande OAuth-client. Schrijfacties worden binnen één proces geserialiseerd en in één Sheets-batch verwerkt. |
| Autorisatie | Google OAuth met PKCE/state/nonce, geverifieerd e-mailadres op coachallowlist, HttpOnly-sessie, Origin/CSRF-controle. Geen afzonderlijke teamrollen; bestaande Google-documentrechten blijven gelden. |
| Cloud | Bestaande Cloud Run-hosting in project `coachmate-f4c7a`; geen Vertex-aanroep nodig voor fase 2. Geen cloudinstellingen gewijzigd. |
| Instellingen | Bestaand apart instellingenscherm en reduceracties. Deze fase voegt alleen de beleidsactie en opslag toe; het visuele instellingenonderdeel wacht op fase 3. |

Belangrijke ontbrekende brongegevens: legacy opstellingen/keeperwissels hebben geen volledige intervallen, posities zijn vrije tekst, kwaliteitsscores en persoonlijke historische streeftijden ontbreken meestal. De adapter vult die niet met fictieve waarden aan. Nieuwe wissels bewaren naast de bestaande schermminuut ook `atMs`, de exacte actieve uitvoeringstijd. Bij oude wissels vermeldt de adapter de lagere minuutprecisie, tenzij een geregistreerde intervalgrens de werkelijke uitvoering bewijst.

## Modules en datamodel

| Module | Verantwoordelijkheid |
| --- | --- |
| `src/substitution/types.ts` | Genormaliseerde `MatchState`, expliciete spelersprofielen, bezettingsintervallen en scenarioresultaten. Interne speler-ID's, geen namen/contactgegevens. |
| `adapter.ts` | Momentopname via bestaande `settleLive`; beschikbaarheid, beginopstelling indien bekend, uitgevoerde wissels, tijdsoorten, rotatiestatus en seizoenshistorie. |
| `rules.ts` | Harde bezetting-, keeper-, beschikbaarheid-, tijd-, interval- en minutenvalidatie; zuivere uitvoeringspoort met twee bevestigingen en versiecontrole. |
| `policy.ts` | Schema-/beleidsversies, gevalideerde instellingen, normalisatie, standaardwaarden en herstel. |
| `profile.ts` | Validatie van expliciete keepersgeschiktheid, voorkeur/kwaliteit, positiekwaliteiten, minutenlimiet en beschikbaarheidsvenster. |
| `targets.ts` | Gebonden gezamenlijke verdeling van het exacte minutenbudget en historische compensatie. |
| `rotation.ts` / `goalkeepers.ts` | Wachttijd, aaneengesloten belasting, eerdere beurten en keeperrotatie met bekende historie. |
| `optimizer.ts` | Begrensde volledige planning van de resterende wedstrijd, eerlijke reparatie, validatie en rangschikking. |
| `index.ts` | `planCoachMatch`: koppelt de bestaande CoachState aan de daadwerkelijk opgeslagen teampolicy. Alleen lezen, geen registratie of netwerkverzoek. |

`LiveMatch.occupancy` registreert voortaan tijdens de bestaande klokafrekening actieve `[startMs, endMs)`-intervallen met veld en keeper. Identieke aangrenzende intervallen worden samengevoegd; rust levert geen interval of speelminuten op. Oude opslag zonder intervallen blijft leesbaar. Een gedeeltelijke legacyregistratie begint bij de eerste nieuwe observatie, nooit bij een verzonnen beginopstelling. Minutentotalen met volledige dekking moeten exact overeenkomen met de intervallen.

`MatchState.clock.matchMs` betekent actieve speeltijd. `breakMs` betekent geregistreerde rust. `elapsedRealMs` betekent actieve tijd plus geregistreerde rust, zoals de huidige UI dat telt. Losse handmatige klokstops werden niet als rust geregistreerd; dit is dus geen gereconstrueerde wandklokduur sinds aftrap. Onbekende oude rust blijft `null`. `actualPeriodTimesMs` blijft apart van de **nominale** plangrenzen (bijvoorbeeld 12,5/25/37,5/50). De coach bepaalt de werkelijke periodeovergang; er is geen automatische tweede klok. Na de reguliere eindtijd verzint de optimizer geen blessuretijd: hij meldt `NO_REMAINING_PLAY` en bewaart de echte livegegevens.

Een statusversie is een exact geserialiseerd vergelijkingstoken van revisie, genormaliseerde gegevens, livegegevens en opgeslagen beleid. Ook een lokaal doelpunt, verstreken kloktijd of beleidswijziging maakt het advies oud zonder een nieuwe serverrevisie. Behandel dit token als opaque; niet loggen of aan AI doorgeven. Scenario-ID's zijn lokaal uniek binnen die snapshot; vergelijk altijd ook wedstrijd-, team-, status-, regel- en beleidsversie.

## Beleid en opslag

Standaard: model C met gewichten 50/30/20, vijf relevante bekende wedstrijden, 30% compensatie, maximaal ±15% correctie, voorkeur voor bundelen/periodeovergangen/hele bankperioden, `ROTATING`, herinnering 30 seconden vooraf. Harde regels kunnen niet via beleid uitgeschakeld worden.

De reduceractie `set-substitution-policy` bevat `expectedVersion` en optioneel `policy`. Zonder policy herstelt hij de standaardwaarden als **nieuwe** versie. `team.substitutionPolicy` en de volledige `substitutionPolicyHistory` worden opgeslagen in de bestaande State-JSON. Oude teams zonder policy gebruiken standaardwaarden. De normale `/api/action`-route accepteert de actie met dezelfde sessie-, CSRF-, archief-, revisie- en brontokencontroles. Een ongeldige/verouderde beleidsactie wordt geweigerd. Er is geen automatische write vanuit de optimizer.

Voorbeeld van de actiepayload (binnen het bestaande API-envelope met teamSeasonId, revision en sourceToken):

```json
{"type":"set-substitution-policy","expectedVersion":0,"policy":{"schemaVersion":1,"version":1,"weights":{"fairness":50,"rotation":30,"tactical":20},"historyMatches":5,"compensationFactor":0.3,"maxHistoricalCorrection":0.15,"preferBundled":true,"preferPeriodTransitions":true,"preferWholePeriodsOnBench":true,"goalkeeperMode":"ROTATING","reminderSeconds":30,"fairnessToleranceMs":30000}}
```

De server kent de nieuwe oplopende versie toe. Relatieve gewichten worden genormaliseerd; alle nul, onbekende eigenschappen en niet-eindige waarden zijn ongeldig. Een beleidswijziging vereist geen prompt- of codewijziging. Herinneringen zijn in deze fase alleen een opgeslagen voorkeur.

Spelergegevens blijven in `Players`, met een optionele, op kopnaam gemapte `substitutionProfile`-kolom. Bestaande Sheets zonder die kolom blijven werken. De JSON kan bijvoorbeeld bevatten:

```json
{"goalkeeperEligible":true,"goalkeeperQuality":0.8,"goalkeeperPreference":0.6,"positionQualities":{"V":0.7,"M":0.5}}
```

Alle kwaliteitsscores liggen tussen 0 en 1 en moeten door de coach aangeleverd zijn. `maxMinutes`, `availableFromMs` en `availableUntilMs` zijn optionele expliciete beperkingen. Gebruik een snapshot-override via `profiles` voor wedstrijdspecifieke beperkingen; een opgeslagen profiel geldt als standaard voor het teamseizoen. Ontbrekende geschiktheid valt alleen terug op de bestaande positie `K` of de daadwerkelijk door de coach geselecteerde huidige keeper. Expliciet `false` heeft voorrang. Een pending beschikbaarheid wordt niet als bevestigde aanwezigheid beschouwd. Verwijderingen en onbekende ID's worden niet stil geaccepteerd.

`MatchStat.targetMinutes` is optionele werkelijk vastgelegde persoonlijke streeftijd. Het veld blijft behouden in de bestaande State-JSON. Het is geen nieuw verplicht Sheetveld; de leesbare MatchStats-uitvoer behoudt het bestaande schema. Fase 3 moet de geaccepteerde persoonlijke streeftijden vastleggen bij de wedstrijdregistratie. Voor oude wedstrijden zonder streeftijd rekent deze fase geen historische schuld uit. De huidige gemiddelde veldminuten-suggestie in de UI blijft buiten deze fase.

## Optimalisatie en expliciete aannames

1. Bereken huidig werkelijk totaal plus resterende tijd × ingestelde veldbezetting. Keeperminuten tellen volledig mee. Eerder gespeelde minuten kunnen niet teruggedraaid worden.
2. Verdeel gezamenlijk met fysieke onder-/bovengrenzen: reeds gespeelde tijd, beschikbaarheidsvenster, persoonlijke limiet en uitsluitend geschikte keeper voor ieder toekomstig interval. Een enige geschikte keeper krijgt minimaal de noodzakelijke keeperduur, nooit extra veldcompensatie.
3. Gebruik per speler de laatste vijf bekende, verwerkte, eerdere wedstrijden in hetzelfde teamseizoen met `present=true` én bekende werkelijke/persoonlijke doelminuten. De schuld is de **som** van doel minus werkelijkheid. Vermenigvuldig met 30%, begrens op ±15% van de fysieke basisdoeltijd en projecteer alle doelen gezamenlijk opnieuw binnen die grenzen. Afwezige/ongekende waarden tellen niet als nul. Het resultaat telt exact op tot het minutenbudget, inclusief deterministische afronding op milliseconden.
4. Genereer maximaal 12 plannen: periode-, halve periode-, 2,5-minuten- en halve-minutecadans, elk met drie deterministische varianten. Alle perioden en beschikbaarheidsgrenzen worden meegenomen. Persoonlijke restlimieten kunnen een interval splitsen. Er worden geen spelerssubsets uitputtend opgesomd.
5. Kies per interval via resterende doeltijd/gelegenheid en afzonderlijke rotatieprioriteit (banktijd, aaneengesloten speeltijd, eerdere beurten). Keeperkeuze gebruikt geschiktheid, huidige en bekende historische keeperbelasting, expliciete voorkeur/kwaliteit. Ontbrekende oude rotatiestatus blijft onbekend; er wordt geen fictieve voorgeschiedenis toegevoegd.
6. Herstel grove plannen door geldige bezettingsstukken van overbedeelde naar onderbedeelde spelers te verplaatsen. Maximaal 256 verbeteringen per kandidaat, iedere stap vermindert de absolute doelfout. Keeper/veldwissels vormen één consistente intervaltoestand. Het planningsraster heeft maximaal 600 initiële intervallen; een reparatie kan maximaal twee intervallen toevoegen (theoretisch maximum 1.112 vóór samenvoegen).
7. Bereken de eindminuten opnieuw uit de resterende bezetting plus de daadwerkelijke beginsaldi. Valideer ieder heel plan. Alleen geldige resultaten worden aangeboden.
8. De onafhankelijke eerlijkheidspoort houdt alleen plannen met maximale individuele doelfout binnen beste gevonden fout + `fairnessToleranceMs` (standaard 30 seconden). Dit geldt ook bij 100% tactisch gewicht. De 50/30/20-score rangschikt daarna; in dezelfde procentpunt-scoreband beslist de rustige-wisselvoorkeur. Een vaste band zorgt voor een consistente, transitieve sortering. Toon maximaal vijf scenario's.

Tactische scores gebruiken alleen expliciete kwaliteit voor de bestaande positie/keeperrol. Er is nog geen formatie- of veldslotmodel in CoachMate; de module verzint geen tactische opstelling of ontbrekende positie. Zonder kwaliteit is de tactische score `null` en worden beschikbare scoregewichten herverdeeld. `FIXED` is een keepersvoorkeur bij de kandidaatopbouw; persoonlijke limieten, geschiktheid en eerlijke totale minuten blijven voorgaan. Geldige reparaties mogen daardoor een andere keeper gebruiken.

Dit is een begrensde heuristiek, geen bewijs van een globaal optimum. Een overschreden fairness-tolerantie door reeds gespeelde minuten kan niet worden weggepoetst. De relatieve eerlijkheidspoort vergelijkt de **beste gevonden** oplossing. `SEARCH_EXHAUSTED` betekent dat de zoekmethode geen geldig plan vond; het bewijst geen mathematische onhaalbaarheid. Bij `INFEASIBLE_MINUTE_BUDGET` past het expliciete minutenbudget niet binnen de opgegeven beperkingen. Beide geven geen ongeldige noodoplossing terug.

De module herschrijft of voert geen wissels uit. `validateExecution` is een zuivere controlepoort: acceptatie én bevestiging van uitvoering, huidige status-/beleidsversie, werkelijke uitvoeringstijd en opnieuw geldige volledige bezetting zijn vereist. Integratie met de coachinterface en idempotente adviesbesluiten komt in fase 3, via het bestaande journal/batchpad.

## Verificatie en vervolg

```text
npm run test:optimizer  # unit-, integratie-, regressie-, parametrische en seeded scenariotests
npm run verify:optimizer # onafhankelijk reducer-replay en machineleesbare referentie-uitvoer
npm run test:unit       # alle *.test.mjs, inclusief backend, cache, Forms, mail en Worker
npm run test:runtime    # alle bestaande *.spec.ts via Playwright
npm run build          # runtime-integriteit, TypeScript, Vite en statische Worker-output
```

De referentie heeft 11 synthetische spelers, 8 plaatsen en 3 geschikte keepers. De verificatie speelt alle geplande wissels met ongeronde tijdstippen af door de bestaande reducer en vergelijkt per speler de resulterende totalen met de voorspelling. Daarnaast controleert een onafhankelijke intervalsweep de veld-/keeperbezetting en het volledige budget. `outputs/substitution-reference.json` bevat de meetbare uitkomst, bezetting en totalen, zonder persoonsgegevens. `docs/substitution-test-results.md` rapporteert de laatste volledige testuitvoering.

Fase 3: instellingen- en adviesinterface, geaccepteerde historische targets, coachbesluiten, bevestigde uitvoering en herinneringen. Fase 4: server-side Vertex met actuele officiële SDK/modelcontrole, gestructureerde output en fallback. Vertex-timeouts, ongeldige AI-output en echte AI-responses zijn **niet** geclaimd als getest in fase 2; verouderingscontrole van de deterministische uitvoeringspoort is wel getest. Er zijn voor deze fase geen handmatige Google Cloud-acties nodig.
