# Fase 3 — testresultaten, 18 oktober 2026

De nieuwe assistentflows zijn lokaal geïntegreerd en getest. **De volledige bestaande app-regressiesuite is niet groen.** Er is geen Vertex-integratie of deployment uitgevoerd en geen echte Google-teamdata aangepast.

| Controle | Uitkomst |
| --- | --- |
| Alle Node-unit-/backendtests | **124/124 geslaagd**, 0 mislukt |
| Nieuwe advies-/registratietests, onderdeel van Node-run | **16/16 geslaagd** |
| Bestaande optimizertests, onderdeel van Node-run | **31/31 geslaagd**, met 32 seeded herplanningsgevallen in één test |
| Nieuwe assistent-browsertests, gerichte eindcontrole | **8/8 geslaagd** |
| Gerichte eindcontrole: assistent, Live, delen, runtime en lokale cache | **34/35 geslaagd**, **1 mislukt** |
| Volledige browsertestrun | **49/96 geslaagd**, **47 mislukt**, 0 overgeslagen |
| TypeScript, productiebuild en runtime-integriteit | Geslaagd; alle 28 beschermde runtimebestanden intact |
| Onafhankelijke referentieverificatie via bestaande reducer | Geslaagd: **400 speler-minuten**, **50 keeperminuten**, **0 ms doelfout** |

## Nieuwe dekking

De Node-tests controleren genereren/acceptatie zonder uitvoering, atomische uitvoering, precies één actuele geschikte keeper, idempotente event-ID's, veroudering na handmatige wissels en bronwijzigingen, behoud van geaccepteerde adviezen tijdens gewone klokticks, uitstellen/overslaan, handmatige aanpassing met nieuwe validatie en scores, replay met oorspronkelijke tijdstippen, afwijzen van een ongeldige hele backendbatch, historische persoonlijke targets, archieven, exacte keeperwissels, corrupte adviesopslag en club/team-ID-migratie. Spelersprofielen blijven in de bestaande scoped Players-rijen; extra coachcellen blijven behouden.

De acht browsergevallen zijn:

- plan review, explicit acceptance and execution produce one atomic swap then a fresh proposal — **geslaagd**
- skip persists through tabs and reload; clock ticks alone do not replace an accepted plan — **geslaagd**
- a manual substitution automatically prepares another suggestion without executing it — **geslaagd**
- assistant settings keep a local draft; save persists weights, keepers and policy version — **geslaagd**
- missing confirmations explain why a plan is disabled, without inventing availability — **geslaagd**
- manual plan adjustment changes projected occupancy and requires acceptance again — **geslaagd**
- Google advice stays local until explicit save; a failed upload retains the same retry batch — **geslaagd**
- reminder is driven by active playing time and defer waits two active minutes before replanning — **geslaagd**

De Google-flow gebruikt een gemockte backend: vóór expliciet Opslaan zijn er geen POSTs; een gesimuleerde fout bewaart dezelfde lokale batch en de retry slaagt met die oorspronkelijke acties. Er zijn hiervoor geen echte e-mails, Forms of Sheets gewijzigd.

## Gerichte eindcontrole

Deze run gebruikte twee workers tegen de reeds draaiende preview op `http://127.0.0.1:4173`. Alle nieuwe assistenttests, bestaande Live-refinementtests, deeltests en mobiele runtimechecks slagen. De resterende mislukking is:

- `local-cache-review.spec.ts:28` — availability popup stages several players and team settings only upload on save. [31mTest timeout of 30000ms exceeded.[39m Error: locator.selectOption: Test timeout of 30000ms exceeded.

Die test probeert nog rechtstreeks een oude beschikbaarheidsselect te bedienen. De huidige beschikbaarheidsweergave start alleen-lezen en opent de correctie-editor via Aanpassen. De fout is niet weggefilterd of als geslaagd gerapporteerd.

## Volledige regressiesuite

De volledige run gebruikte vier workers tegen `http://localhost:4186`. Verschillende bestaande gevallen liepen vast bij navigatie/wachten op page load. Twee echte-telefoontests hadden bovendien hardgecodeerd poort 4173 terwijl daar tijdens die run nog geen server draaide. De nadere eindcontrole hierboven gebruikte de juiste 4173-server en minder parallelle browsers. Die geslaagde controles vervangen de rode volledige uitslag niet. Er wordt geen conclusie getrokken dat alle overige fouten oud of alleen infrastructuur zijn.

Daarnaast blijven bekende oude UI-verwachtingen zichtbaar, waaronder oude beschikbaarheidsselects, inline tijdblokken, oude reserveaantalselectors en een verwachting dat na afsluiten geen deelvenster openstaat. De oorspronkelijke brede fase-2-run had al 28 mislukkingen; de aantallen zijn door de verschillende omstandigheden niet rechtstreeks als regressiemeting te vergelijken.

| Bestand | Geslaagd | Mislukt |
| --- | ---: | ---: |
| attendance-batch-review.spec.ts | 0 | 2 |
| availability-round-review.spec.ts | 0 | 1 |
| backend-app.spec.ts | 0 | 2 |
| coach-app.spec.ts | 0 | 9 |
| dashboard-review.spec.ts | 0 | 1 |
| forms-flow.spec.ts | 0 | 2 |
| invitation-flow.spec.ts | 0 | 2 |
| ios-all-screens.spec.ts | 1 | 6 |
| ios-upgrade.spec.ts | 2 | 6 |
| live-refinement.spec.ts | 10 | 4 |
| live-review.spec.ts | 0 | 2 |
| local-cache-review.spec.ts | 1 | 2 |
| match-share.spec.ts | 2 | 0 |
| mobile-runtime.spec.ts | 8 | 0 |
| player-detail-refinement.spec.ts | 7 | 0 |
| real-device.spec.ts | 1 | 2 |
| round-review.spec.ts | 1 | 1 |
| stats-tab-navigation.spec.ts | 4 | 0 |
| substitution-assistant.spec.ts | 8 | 0 |
| team-size-review.spec.ts | 0 | 1 |
| ux-review.spec.ts | 4 | 2 |
| venue-order.spec.ts | 0 | 2 |

### Alle mislukkingen in de volledige run

- `attendance-batch-review.spec.ts:5` — dashboard drafts do not change availability until saved, survive reload and can be cancelled. [31mTest timeout of 30000ms exceeded.[39m Error: locator.click: Test timeout of 30000ms exceeded.
- `attendance-batch-review.spec.ts:14` — Google batches several players in one request, retains draft on failure and retries together. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `availability-round-review.spec.ts:3` — response rounds only select read-only snapshots for the identified match. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `backend-app.spec.ts:4` — Google team selection isolates seasons, shows conflicts, and leaves local demo intact. [31mTest timeout of 30000ms exceeded.[39m Error: page.evaluate: Test timeout of 30000ms exceeded.
- `backend-app.spec.ts:46` — single Google team loads automatically on login and reload without demo live match. [31mTest timeout of 30000ms exceeded.[39m Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveAttribute[2m([22m[32mexpected[39m[2m)[22m failed
- `coach-app.spec.ts:5` — scores persist across tabs and reload, undo removes exactly one, closing updates dashboard. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `coach-app.spec.ts:32` — viewing responses is read-only until a status is explicitly changed. [31mTest timeout of 30000ms exceeded.[39m Error: locator.click: Test timeout of 30000ms exceeded.
- `coach-app.spec.ts:49` — existing statistics load per match and saved corrections update totals persistently. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `coach-app.spec.ts:69` — corrupt storage is retained instead of replaced with demo values. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `coach-app.spec.ts:76` — storage failure is visible and the app remains usable in memory. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `coach-app.spec.ts:86` — team quarters setting persists and each of four quarters can be played. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `coach-app.spec.ts:110` — own goals for either side persist, undo cleanly, and only increase the appropriate team total. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `coach-app.spec.ts:148` — header and navigation stay fixed while scrolling, and the console stays clean. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `coach-app.spec.ts:162` — historical response selectors are read-only. [31mTest timeout of 30000ms exceeded.[39m Error: locator.click: Test timeout of 30000ms exceeded.
- `dashboard-review.spec.ts:3` — next match coach corrections persist and reconcile Live, with collapsible details. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `forms-flow.spec.ts:39` — round form publication, personal invitations, imports and local coach precedence work together. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `forms-flow.spec.ts:47` — failed imports preserve answers, can retry, and reject a changed questionnaire. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `invitation-flow.spec.ts:4` — whole-round invitations and WhatsApp remain safe with lost response=false. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `invitation-flow.spec.ts:4` — whole-round invitations and WhatsApp remain safe with lost response=true. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `ios-all-screens.spec.ts:12` — dashboard schedule tabs route pending past figures to their own match and advice opens separately. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `ios-all-screens.spec.ts:18` — ranking modes keep unknown values visible and player details open the correct editable match. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `ios-all-screens.spec.ts:31` — historical availability is read-only and notes and history search remain reachable. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
- `ios-all-screens.spec.ts:37` — empty and archived seasons stay navigable without offering editable attendance. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `ios-all-screens.spec.ts:42` — all screens and attendance confirmations fit narrow phones and a calibrated desktop frame. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `ios-all-screens.spec.ts:54` — attendance ranking shows actual appearances against distinct processed team matches and updates after a correction. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `ios-upgrade.spec.ts:12` — goal buttons and undo follow Thuis order without changing score attribution. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `ios-upgrade.spec.ts:12` — goal buttons and undo follow Uit order without changing score attribution. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `ios-upgrade.spec.ts:19` — mouse drag previews pair and swaps once, invalid drop does not swap, values survive reload. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `ios-upgrade.spec.ts:27` — native touch drag from field to bench preserves keeper identity, and touch cancel commits nothing. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `ios-upgrade.spec.ts:33` — keyboard swaps and availability management remain accessible with no horizontal overflow. Error: [2mexpect([22m[31mlocator[39m[2m).not.[22mtoBeVisible[2m([22m[2m)[22m failed Locator:  getByRole('button', { name: 'Nieuwe speelronde', exact: true })
- `ios-upgrade.spec.ts:49` — live targets and swap preview stay inside narrow and large phone screens. [31mTest timeout of 30000ms exceeded.[39m Error: locator.boundingBox: Test timeout of 30000ms exceeded.
- `live-refinement.spec.ts:15` — Thuis: clock action is centered and history follows goal order. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `live-refinement.spec.ts:15` — Uit: clock action is centered and history follows goal order. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `live-refinement.spec.ts:36` — timer opens period detail, uses current-period time, and preserves unknown legacy times. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `live-refinement.spec.ts:53` — selection can be cancelled and own goals on both sides stay team-relative after reload. [31mTest timeout of 30000ms exceeded.[39m Error: page.goto: Test timeout of 30000ms exceeded.
- `live-review.spec.ts:4` — period clock, score history and closing preview show recorded figures. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveText[2m([22m[32mexpected[39m[2m)[22m failed Locator: locator('.match-time-totals > div').filter({ hasText: 'Speeltijd' }).locator('dd')
- `live-review.spec.ts:22` — history page owns entry action, rankings switch and history filters. [31mTest timeout of 30000ms exceeded.[39m Error: locator.click: Test timeout of 30000ms exceeded.
- `local-cache-review.spec.ts:28` — availability popup stages several players and team settings only upload on save. [31mTest timeout of 30000ms exceeded.[39m Error: locator.selectOption: Test timeout of 30000ms exceeded.
- `local-cache-review.spec.ts:38` — failed finish keeps confirmation open and offers sharing only after retry succeeds. Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m Expected: [32m1[39m
- `real-device.spec.ts:3` — real phone fills screen, uses native inputs and preserves navigation and sheets. Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/ Call log:
- `real-device.spec.ts:32` — iPhone sheet dismisses with a downward touch swipe and with close button. Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/ Call log:
- `round-review.spec.ts:4` — new round adds several matches, keeps prior answers and requests one round Form. [31mTest timeout of 30000ms exceeded.[39m Error: locator.click: Test timeout of 30000ms exceeded.
- `team-size-review.spec.ts:3` — team field size updates lineup and reserve advice after reload. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoContainText[2m([22m[32mexpected[39m[2m)[22m failed Locator: locator('.swap-count')
- `ux-review.spec.ts:20` — draft survives tabs and reload and can be explicitly discarded. [31mTest timeout of 30000ms exceeded.[39m Error: locator.click: Test timeout of 30000ms exceeded.
- `ux-review.spec.ts:62` — Google match picker prepares a match without changing historical results. Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m Expected: [32m"m-028"[39m
- `venue-order.spec.ts:3` — Thuis: score order and saved goals remain correctly attributed. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed Locator:  getByRole('dialog')
- `venue-order.spec.ts:3` — Uit: score order and saved goals remain correctly attributed. Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveCount[2m([22m[32mexpected[39m[2m)[22m failed Locator:  getByRole('dialog')

## Uitvoer en reproduceren

- [Volledige Node-uitvoer](../outputs/phase-3-unit-tests.log)
- [Volledige browserrun](../outputs/phase-3-browser-all.json)
- [Gerichte browser-eindcontrole](../outputs/phase-3-browser-final-check.json)
- [Laatste acht assistent-browsertests na behoud van adviesdetails](../outputs/phase-3-browser-targeted-final.json)
- [Referentie met bezetting en minuten per synthetische speler](../outputs/substitution-reference.json)
- [Buildlog](../outputs/phase-3-build.log)
- [Preview](../outputs/phase-3-preview.png)
- [Werking en configuratie](substitution-phase-3.md)

Op Windows kan `npm.cmd run test:unit` of `npm.cmd run test:optimizer` worden gebruikt zonder wijziging van de PowerShell-uitvoeringspolicy. Voor de bestaande draaiende preview kan Playwright met `playwright.preview.config.ts` draaien; `COACH_TEST_ORIGIN` kiest de origin. De eerste zelfgestarte npm/Vite-testserver bleef bij het afsluiten hangen. Daarom is de gerichte controle tegen een reeds draaiende server uitgevoerd. Afgebroken diagnosepogingen zijn niet bij de geslaagde tests opgeteld.

Een buildwaarschuwing over een JavaScriptbundle groter dan 500 kB blijft bestaan. Herinneringen werken in de geopende app; achtergrond-pushberichten en echte Vertex-responses zijn niet geïmplementeerd of als getest opgevoerd. De optimizer blijft een begrensde heuristiek; globale optimaliteit is niet gegarandeerd.
