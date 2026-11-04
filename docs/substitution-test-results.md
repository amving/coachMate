# Testresultaten wisselassistent — 17 oktober 2026

Fase 1/2 is geïmplementeerd. De deterministische unit-, integratie- en scenariotests zijn groen. De volledige bestaande browsersuite is **niet volledig groen**. UI en Vertex-integratie zijn niet toegevoegd; er is niets gedeployd en er zijn geen echte Google-teamgegevens gewijzigd.

| Controle | Resultaat |
| --- | --- |
| Alle Node-tests, \*.test.mjs | **108/108 geslaagd**, 0 mislukt, 0 overgeslagen |
| Nieuwe deterministische tests (onderdeel van bovenstaande) | **31/31 geslaagd**, inclusief één seeded test met 32 herplanningsgevallen |
| Volledige Playwright-run, 21 bestanden | **60/88 geslaagd**, **28 mislukt**, 0 overgeslagen, 0 flaky |
| Gerichte eindcontrole na exacte wisseltijdregistratie: Live, delen, mobiele runtime | **24/24 geslaagd**, 0 mislukt |
| npm run verify:optimizer | Geslaagd; reproduceerbare replay door de bestaande wedstrijdreducer |
| npm run build | Geslaagd: runtime-integriteit, TypeScript, Vite en Worker-output |
| npm run check:runtime | Geslaagd: alle 28 beschermde bestanden intact |

De Node-run bevat ook alle bestaande backend-, cache-, beschikbaarheidsmail-, distributie-, statische server- en Sites Worker-tests. De default Playwright-configuratie selecteert alle aanwezige \*.spec.ts; de afzonderlijke app/runtime-scripts zijn filters van dezelfde suite. Geen tests zijn overgeslagen om een groen resultaat te verkrijgen. De browserrun gebruikte twee workers en duurde 10.49 minuten. De build meldt de bestaande waarschuwing over een JavaScriptbundle groter dan 500 kB; dit is geen buildfout.

## Controleerbare referentiewedstrijd

4 × 12,5 minuten, 11 bevestigde spelers, 8 plaatsen inclusief keeper, 3 geschikte keepers:

| Bewijs | Uitkomst |
| --- | --- |
| Werkelijk geregistreerd via reducer-replay | **400 speler-minuten** |
| Werkelijk geregistreerde keeperduur | **50 minuten**, volledig inbegrepen in speeltijd |
| Grootste individuele afwijking van gezamenlijk berekende streeftijd | **0 ms** |
| Geschikte keepers daadwerkelijk gebruikt | p01, p02, p03 |
| Geplande bezettingsintervallen | 15 |
| Eén gemeten optimalisatierun | 54.08 ms (indicatief, geen prestatiegarantie) |

De eindtotalen zijn per speler onafhankelijk vergeleken met de echte reducer. De scenario's worden daarnaast per interval gecontroleerd op exact acht unieke spelers, één geschikte keeper, beschikbaarheid, persoonlijke limieten en afwezigheid van overlap tussen bank en veld. De som is niet afgeleid van een AI-tabel. Dezelfde input/policy levert exact hetzelfde resultaat.

Verder getest: historische grenzen en exacte gezamenlijke compensatie; onbekende historie; score-/status-/beleidsveroudering; bevestigde uitvoering; pauzes; keeper/veldwissels; één keeper; lokale minuten na uitstel/afwijkingen; beleidsopslag/herstel/archief; bronprofielen; aantallen tot 50 spelers en wedstrijdlengtes van 40–120 minuten; oude fouttypen met kwartgrenzen, dubbele spelers, minuten en fictieve kwaliteiten.

## Bestaande browsersuite

Er zijn geen appschermen of browsertests gewijzigd in deze opdracht. Concrete gevonden verschillen tussen tests en huidige schermen zijn onder meer ontbrekende oude beschikbaarheidsselects, een verwachting dat wedstrijdinstellingen zonder Opslaan bewaard worden, oude inline timingblokken en het extra bestaande deelscherm na succesvol afsluiten. Andere gevallen eindigden met een timeout. Deze run bewijst daarom geen foutloze totale app. Zonder een eerdere volledige nulmeting wordt niet beweerd dat iedere browserfout al vóór deze wijziging is gereproduceerd.

| Bestand | Geslaagd | Mislukt |
| --- | ---: | ---: |
| attendance-batch-review.spec.ts | 1 | 1 |
| availability-round-review.spec.ts | 0 | 1 |
| backend-app.spec.ts | 0 | 2 |
| coach-app.spec.ts | 4 | 5 |
| dashboard-review.spec.ts | 0 | 1 |
| forms-flow.spec.ts | 0 | 2 |
| invitation-flow.spec.ts | 1 | 1 |
| ios-all-screens.spec.ts | 3 | 4 |
| ios-upgrade.spec.ts | 7 | 1 |
| live-refinement.spec.ts | 14 | 0 |
| live-review.spec.ts | 0 | 2 |
| local-cache-review.spec.ts | 2 | 1 |
| match-share.spec.ts | 2 | 0 |
| mobile-runtime.spec.ts | 8 | 0 |
| player-detail-refinement.spec.ts | 7 | 0 |
| real-device.spec.ts | 2 | 1 |
| round-review.spec.ts | 1 | 1 |
| stats-tab-navigation.spec.ts | 4 | 0 |
| team-size-review.spec.ts | 0 | 1 |
| ux-review.spec.ts | 4 | 2 |
| venue-order.spec.ts | 0 | 2 |

### Alle mislukte browsergevallen

- `attendance-batch-review.spec.ts:5` — dashboard drafts do not change availability until saved, survive reload and can be cancelled. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveValue[2m([22m[32mexpected[39m[2m)[22m failed Locator: getByLabel('Beschikbaarheid Daan', { exact: true })
- `availability-round-review.spec.ts:3` — response rounds only select read-only snapshots for the identified match. [31mTest timeout of 20000ms exceeded.[39m
- `backend-app.spec.ts:4` — Google team selection isolates seasons, shows conflicts, and leaves local demo intact. [31mTest timeout of 20000ms exceeded.[39m
- `backend-app.spec.ts:46` — single Google team loads automatically on login and reload without demo live match. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveValue[2m([22m[32mexpected[39m[2m)[22m failed Locator: getByLabel('Seizoen en team')
- `coach-app.spec.ts:5` — scores persist across tabs and reload, undo removes exactly one, closing updates dashboard. [31mTest timeout of 20000ms exceeded.[39m
- `coach-app.spec.ts:32` — viewing responses is read-only until a status is explicitly changed. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveValue[2m([22m[32mexpected[39m[2m)[22m failed Locator: getByLabel('Beschikbaarheid Milan')
- `coach-app.spec.ts:86` — team quarters setting persists and each of four quarters can be played. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveText[2m([22m[32mexpected[39m[2m)[22m failed Locator:  getByTestId('match-phase')
- `coach-app.spec.ts:110` — own goals for either side persist, undo cleanly, and only increase the appropriate team total. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed Locator:  getByRole('dialog')
- `coach-app.spec.ts:162` — historical response selectors are read-only. [31mTest timeout of 20000ms exceeded.[39m
- `dashboard-review.spec.ts:3` — next match coach corrections persist and reconcile Live, with collapsible details. [31mTest timeout of 20000ms exceeded.[39m
- `forms-flow.spec.ts:39` — round form publication, personal invitations, imports and local coach precedence work together. [31mTest timeout of 20000ms exceeded.[39m
- `forms-flow.spec.ts:47` — failed imports preserve answers, can retry, and reject a changed questionnaire. [31mTest timeout of 20000ms exceeded.[39m
- `invitation-flow.spec.ts:4` — whole-round invitations and WhatsApp remain safe with lost response=true. [31mTest timeout of 20000ms exceeded.[39m
- `ios-all-screens.spec.ts:18` — ranking modes keep unknown values visible and player details open the correct editable match. [31mTest timeout of 20000ms exceeded.[39m
- `ios-all-screens.spec.ts:31` — historical availability is read-only and notes and history search remain reachable. [31mTest timeout of 20000ms exceeded.[39m
- `ios-all-screens.spec.ts:37` — empty and archived seasons stay navigable without offering editable attendance. [31mTest timeout of 20000ms exceeded.[39m
- `ios-all-screens.spec.ts:42` — all screens and attendance confirmations fit narrow phones and a calibrated desktop frame. [31mTest timeout of 20000ms exceeded.[39m
- `ios-upgrade.spec.ts:33` — keyboard swaps and availability management remain accessible with no horizontal overflow. Error: [2mexpect([22m[31mlocator[39m[2m).not.[22mtoBeVisible[2m([22m[2m)[22m failed Locator:  getByRole('button', { name: 'Nieuwe speelronde', exact: true })
- `live-review.spec.ts:4` — period clock, score history and closing preview show recorded figures. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveText[2m([22m[32mexpected[39m[2m)[22m failed Locator: locator('.match-time-totals > div').filter({ hasText: 'Speeltijd' }).locator('dd')
- `live-review.spec.ts:22` — history page owns entry action, rankings switch and history filters. [31mTest timeout of 20000ms exceeded.[39m
- `local-cache-review.spec.ts:28` — availability popup stages several players and team settings only upload on save. [31mTest timeout of 20000ms exceeded.[39m
- `real-device.spec.ts:3` — real phone fills screen, uses native inputs and preserves navigation and sheets. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoBeVisible[2m([22m[2m)[22m failed Locator: getByRole('heading', { name: 'Spelersstatistieken' })
- `round-review.spec.ts:4` — new round adds several matches, keeps prior answers and requests one round Form. [31mTest timeout of 20000ms exceeded.[39m
- `team-size-review.spec.ts:3` — team field size updates lineup and reserve advice after reload. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoContainText[2m([22m[32mexpected[39m[2m)[22m failed Locator: locator('.swap-count')
- `ux-review.spec.ts:20` — draft survives tabs and reload and can be explicitly discarded. [31mTest timeout of 20000ms exceeded.[39m
- `ux-review.spec.ts:62` — Google match picker prepares a match without changing historical results. Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m Expected: [32m"m-028"[39m
- `venue-order.spec.ts:3` — Thuis: score order and saved goals remain correctly attributed. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed Locator:  getByRole('dialog')
- `venue-order.spec.ts:3` — Uit: score order and saved goals remain correctly attributed. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed Locator:  getByRole('dialog')

## Bewijsbestanden en grenzen

- [Volledige Node-uitvoer](../outputs/phase-2-unit-tests.log)
- [Volledig Playwright-rapport met foutmeldingen](../outputs/phase-2-browser-tests.json)
- [Gerichte browser-eindcontrole](../outputs/phase-2-final-browser-check.json)
- [Referentie: bezetting en echte/verwachte minuten per synthetische speler](../outputs/substitution-reference.json)
- [Buildlog](../outputs/phase-2-build.log)
- [Architectuur, configuratie, aannames en zoeklimieten](substitution-optimizer.md)

Vertex-fallback en echte AI-responses behoren tot fase 4 en zijn niet als geslaagd getest opgevoerd. De zuivere controle tegen verouderde status-/beleidsversies is wel getest. De optimizer is een begrensde heuristiek: geldigheid en exacte minuutregistratie zijn gecontroleerd, wereldwijde optimaliteit voor alle mogelijke beperkingen wordt niet geclaimd. Voor fase 3 blijft de UI-regressielijst zichtbaar als vervolgwerk.

De lokale bestaande demo is in de in-app browser geopend en visueel gecontroleerd. Op de aparte previewpoort is de Google-bron niet verbonden; de preview is geen verificatie van echte Google-data of een nieuwe adviesinterface.
