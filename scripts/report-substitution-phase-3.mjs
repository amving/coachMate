import {readFileSync,writeFileSync} from 'node:fs';
const read=path=>{const b=readFileSync(new URL(`../${path}`,import.meta.url));return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'');};
const full=JSON.parse(read('outputs/phase-3-browser-all.json')),targeted=JSON.parse(read('outputs/phase-3-browser-final-check.json'));
const newFinal=JSON.parse(read('outputs/phase-3-browser-targeted-final.json'));
const unit=read('outputs/phase-3-unit-tests.log'),reference=JSON.parse(read('outputs/substitution-reference.json'));
const unitNumber=key=>Number(new RegExp(`^# ${key} (\\d+)`,'m').exec(unit)?.[1]);
function tests(report){const rows=[];function visit(suites){for(const suite of suites){for(const spec of suite.specs??[])for(const t of spec.tests)rows.push({file:spec.file,line:spec.line,title:spec.title,status:t.status,errors:(t.results.at(-1)?.errors??[]).map(e=>e.message).join('\n')});visit(suite.suites??[]);}}visit(report.suites);return rows;}
const all=tests(full),final=tests(targeted),newTests=tests(newFinal).filter(t=>t.file==='substitution-assistant.spec.ts');
const clean=s=>String(s).replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
const failed=rows=>rows.filter(t=>t.status==='unexpected').map(t=>`- \`${t.file}:${t.line}\` — ${clean(t.title)}. ${clean(t.errors.split('\n').filter(Boolean).slice(0,2).join(' '))}`).join('\n');
const count=rows=>rows.filter(t=>t.status==='expected').length;
const files=[...new Set(all.map(t=>t.file))].sort();
const report=`# Fase 3 — testresultaten, 18 oktober 2026

De nieuwe assistentflows zijn lokaal geïntegreerd en getest. **De volledige bestaande app-regressiesuite is niet groen.** Er is geen Vertex-integratie of deployment uitgevoerd en geen echte Google-teamdata aangepast.

| Controle | Uitkomst |
| --- | --- |
| Alle Node-unit-/backendtests | **${unitNumber('pass')}/${unitNumber('tests')} geslaagd**, ${unitNumber('fail')} mislukt |
| Nieuwe advies-/registratietests, onderdeel van Node-run | **16/16 geslaagd** |
| Bestaande optimizertests, onderdeel van Node-run | **31/31 geslaagd**, met 32 seeded herplanningsgevallen in één test |
| Nieuwe assistent-browsertests, gerichte eindcontrole | **${count(newTests)}/${newTests.length} geslaagd** |
| Gerichte eindcontrole: assistent, Live, delen, runtime en lokale cache | **${targeted.stats.expected}/${final.length} geslaagd**, **${targeted.stats.unexpected} mislukt** |
| Volledige browsertestrun | **${full.stats.expected}/${all.length} geslaagd**, **${full.stats.unexpected} mislukt**, ${full.stats.skipped} overgeslagen |
| TypeScript, productiebuild en runtime-integriteit | Geslaagd; alle 28 beschermde runtimebestanden intact |
| Onafhankelijke referentieverificatie via bestaande reducer | Geslaagd: **${reference.totalPlayerMinutes} speler-minuten**, **${reference.totalKeeperMinutes} keeperminuten**, **${reference.maximumTargetDeviationMs} ms doelfout** |

## Nieuwe dekking

De Node-tests controleren genereren/acceptatie zonder uitvoering, atomische uitvoering, precies één actuele geschikte keeper, idempotente event-ID's, veroudering na handmatige wissels en bronwijzigingen, behoud van geaccepteerde adviezen tijdens gewone klokticks, uitstellen/overslaan, handmatige aanpassing met nieuwe validatie en scores, replay met oorspronkelijke tijdstippen, afwijzen van een ongeldige hele backendbatch, historische persoonlijke targets, archieven, exacte keeperwissels, corrupte adviesopslag en club/team-ID-migratie. Spelersprofielen blijven in de bestaande scoped Players-rijen; extra coachcellen blijven behouden.

De acht browsergevallen zijn:

${newTests.map(t=>`- ${clean(t.title)} — **${t.status==='expected'?'geslaagd':'mislukt'}**`).join('\n')}

De Google-flow gebruikt een gemockte backend: vóór expliciet Opslaan zijn er geen POSTs; een gesimuleerde fout bewaart dezelfde lokale batch en de retry slaagt met die oorspronkelijke acties. Er zijn hiervoor geen echte e-mails, Forms of Sheets gewijzigd.

## Gerichte eindcontrole

Deze run gebruikte twee workers tegen de reeds draaiende preview op \`http://127.0.0.1:4173\`. Alle nieuwe assistenttests, bestaande Live-refinementtests, deeltests en mobiele runtimechecks slagen. De resterende mislukking is:

${failed(final)}

Die test probeert nog rechtstreeks een oude beschikbaarheidsselect te bedienen. De huidige beschikbaarheidsweergave start alleen-lezen en opent de correctie-editor via Aanpassen. De fout is niet weggefilterd of als geslaagd gerapporteerd.

## Volledige regressiesuite

De volledige run gebruikte vier workers tegen \`http://localhost:4186\`. Verschillende bestaande gevallen liepen vast bij navigatie/wachten op page load. Twee echte-telefoontests hadden bovendien hardgecodeerd poort 4173 terwijl daar tijdens die run nog geen server draaide. De nadere eindcontrole hierboven gebruikte de juiste 4173-server en minder parallelle browsers. Die geslaagde controles vervangen de rode volledige uitslag niet. Er wordt geen conclusie getrokken dat alle overige fouten oud of alleen infrastructuur zijn.

Daarnaast blijven bekende oude UI-verwachtingen zichtbaar, waaronder oude beschikbaarheidsselects, inline tijdblokken, oude reserveaantalselectors en een verwachting dat na afsluiten geen deelvenster openstaat. De oorspronkelijke brede fase-2-run had al 28 mislukkingen; de aantallen zijn door de verschillende omstandigheden niet rechtstreeks als regressiemeting te vergelijken.

| Bestand | Geslaagd | Mislukt |
| --- | ---: | ---: |
${files.map(file=>`| ${file} | ${all.filter(t=>t.file===file&&t.status==='expected').length} | ${all.filter(t=>t.file===file&&t.status==='unexpected').length} |`).join('\n')}

### Alle mislukkingen in de volledige run

${failed(all)}

## Uitvoer en reproduceren

- [Volledige Node-uitvoer](../outputs/phase-3-unit-tests.log)
- [Volledige browserrun](../outputs/phase-3-browser-all.json)
- [Gerichte browser-eindcontrole](../outputs/phase-3-browser-final-check.json)
- [Laatste acht assistent-browsertests na behoud van adviesdetails](../outputs/phase-3-browser-targeted-final.json)
- [Referentie met bezetting en minuten per synthetische speler](../outputs/substitution-reference.json)
- [Buildlog](../outputs/phase-3-build.log)
- [Preview](../outputs/phase-3-preview.png)
- [Werking en configuratie](substitution-phase-3.md)

Op Windows kan \`npm.cmd run test:unit\` of \`npm.cmd run test:optimizer\` worden gebruikt zonder wijziging van de PowerShell-uitvoeringspolicy. Voor de bestaande draaiende preview kan Playwright met \`playwright.preview.config.ts\` draaien; \`COACH_TEST_ORIGIN\` kiest de origin. De eerste zelfgestarte npm/Vite-testserver bleef bij het afsluiten hangen. Daarom is de gerichte controle tegen een reeds draaiende server uitgevoerd. Afgebroken diagnosepogingen zijn niet bij de geslaagde tests opgeteld.

Een buildwaarschuwing over een JavaScriptbundle groter dan 500 kB blijft bestaan. Herinneringen werken in de geopende app; achtergrond-pushberichten en echte Vertex-responses zijn niet geïmplementeerd of als getest opgevoerd. De optimizer blijft een begrensde heuristiek; globale optimaliteit is niet gegarandeerd.
`;
writeFileSync(new URL('../docs/substitution-phase-3-tests.md',import.meta.url),report);
console.log(JSON.stringify({unit:unitNumber('pass'),newBrowser:`${count(newTests)}/${newTests.length}`,targeted:`${targeted.stats.expected}/${final.length}`,full:`${full.stats.expected}/${all.length}`,report:'docs/substitution-phase-3-tests.md'}));
