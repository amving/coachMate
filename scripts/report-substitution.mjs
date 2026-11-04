import { readFileSync, writeFileSync } from 'node:fs';
const read=path=>{
  const bytes=readFileSync(new URL(`../${path}`,import.meta.url));
  return bytes.toString(bytes[0]===255&&bytes[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'');
};
const browser=JSON.parse(read('outputs/phase-2-browser-tests.json'));
const evidence=JSON.parse(read('outputs/substitution-reference.json'));
const finalBrowser=JSON.parse(read('outputs/phase-2-final-browser-check.json'));
const units=read('outputs/phase-2-unit-tests.log');
const value=key=>Number(new RegExp(`^# ${key} (\\d+)`,'m').exec(units)?.[1]??NaN);
const tests=[];
const visit=suites=>{for(const suite of suites){for(const spec of suite.specs??[])for(const test of spec.tests)tests.push({file:spec.file,line:spec.line,title:spec.title,status:test.status,error:test.results.at(-1)?.error?.message??''});visit(suite.suites??[]);}};
visit(browser.suites);
const files=[...new Set(tests.map(t=>t.file))].sort();
const escape=s=>String(s).replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
const table=files.map(file=>`| ${file} | ${tests.filter(t=>t.file===file&&t.status==='expected').length} | ${tests.filter(t=>t.file===file&&t.status==='unexpected').length} |`).join('\n');
const failures=tests.filter(t=>t.status==='unexpected').map(t=>`- \`${t.file}:${t.line}\` — ${escape(t.title)}. ${escape(t.error.split('\n').filter(Boolean).slice(0,2).join(' '))}`).join('\n');
const report=`# Testresultaten wisselassistent — 17 oktober 2026

Fase 1/2 is geïmplementeerd. De deterministische unit-, integratie- en scenariotests zijn groen. De volledige bestaande browsersuite is **niet volledig groen**. UI en Vertex-integratie zijn niet toegevoegd; er is niets gedeployd en er zijn geen echte Google-teamgegevens gewijzigd.

| Controle | Resultaat |
| --- | --- |
| Alle Node-tests, \\*.test.mjs | **${value('pass')}/${value('tests')} geslaagd**, ${value('fail')} mislukt, ${value('skipped')} overgeslagen |
| Nieuwe deterministische tests (onderdeel van bovenstaande) | **31/31 geslaagd**, inclusief één seeded test met 32 herplanningsgevallen |
| Volledige Playwright-run, 21 bestanden | **${browser.stats.expected}/88 geslaagd**, **${browser.stats.unexpected} mislukt**, ${browser.stats.skipped} overgeslagen, ${browser.stats.flaky} flaky |
| Gerichte eindcontrole na exacte wisseltijdregistratie: Live, delen, mobiele runtime | **${finalBrowser.stats.expected}/24 geslaagd**, ${finalBrowser.stats.unexpected} mislukt |
| npm run verify:optimizer | Geslaagd; reproduceerbare replay door de bestaande wedstrijdreducer |
| npm run build | Geslaagd: runtime-integriteit, TypeScript, Vite en Worker-output |
| npm run check:runtime | Geslaagd: alle 28 beschermde bestanden intact |

De Node-run bevat ook alle bestaande backend-, cache-, beschikbaarheidsmail-, distributie-, statische server- en Sites Worker-tests. De default Playwright-configuratie selecteert alle aanwezige \\*.spec.ts; de afzonderlijke app/runtime-scripts zijn filters van dezelfde suite. Geen tests zijn overgeslagen om een groen resultaat te verkrijgen. De browserrun gebruikte twee workers en duurde ${(browser.stats.duration/60000).toFixed(2)} minuten. De build meldt de bestaande waarschuwing over een JavaScriptbundle groter dan 500 kB; dit is geen buildfout.

## Controleerbare referentiewedstrijd

4 × 12,5 minuten, 11 bevestigde spelers, 8 plaatsen inclusief keeper, 3 geschikte keepers:

| Bewijs | Uitkomst |
| --- | --- |
| Werkelijk geregistreerd via reducer-replay | **${evidence.totalPlayerMinutes} speler-minuten** |
| Werkelijk geregistreerde keeperduur | **${evidence.totalKeeperMinutes} minuten**, volledig inbegrepen in speeltijd |
| Grootste individuele afwijking van gezamenlijk berekende streeftijd | **${evidence.maximumTargetDeviationMs} ms** |
| Geschikte keepers daadwerkelijk gebruikt | ${evidence.keeperIdsUsed.join(', ')} |
| Geplande bezettingsintervallen | ${evidence.intervals.length} |
| Eén gemeten optimalisatierun | ${evidence.optimizerDurationMs} ms (indicatief, geen prestatiegarantie) |

De eindtotalen zijn per speler onafhankelijk vergeleken met de echte reducer. De scenario's worden daarnaast per interval gecontroleerd op exact acht unieke spelers, één geschikte keeper, beschikbaarheid, persoonlijke limieten en afwezigheid van overlap tussen bank en veld. De som is niet afgeleid van een AI-tabel. Dezelfde input/policy levert exact hetzelfde resultaat.

Verder getest: historische grenzen en exacte gezamenlijke compensatie; onbekende historie; score-/status-/beleidsveroudering; bevestigde uitvoering; pauzes; keeper/veldwissels; één keeper; lokale minuten na uitstel/afwijkingen; beleidsopslag/herstel/archief; bronprofielen; aantallen tot 50 spelers en wedstrijdlengtes van 40–120 minuten; oude fouttypen met kwartgrenzen, dubbele spelers, minuten en fictieve kwaliteiten.

## Bestaande browsersuite

Er zijn geen appschermen of browsertests gewijzigd in deze opdracht. Concrete gevonden verschillen tussen tests en huidige schermen zijn onder meer ontbrekende oude beschikbaarheidsselects, een verwachting dat wedstrijdinstellingen zonder Opslaan bewaard worden, oude inline timingblokken en het extra bestaande deelscherm na succesvol afsluiten. Andere gevallen eindigden met een timeout. Deze run bewijst daarom geen foutloze totale app. Zonder een eerdere volledige nulmeting wordt niet beweerd dat iedere browserfout al vóór deze wijziging is gereproduceerd.

| Bestand | Geslaagd | Mislukt |
| --- | ---: | ---: |
${table}

### Alle mislukte browsergevallen

${failures}

## Bewijsbestanden en grenzen

- [Volledige Node-uitvoer](../outputs/phase-2-unit-tests.log)
- [Volledig Playwright-rapport met foutmeldingen](../outputs/phase-2-browser-tests.json)
- [Gerichte browser-eindcontrole](../outputs/phase-2-final-browser-check.json)
- [Referentie: bezetting en echte/verwachte minuten per synthetische speler](../outputs/substitution-reference.json)
- [Buildlog](../outputs/phase-2-build.log)
- [Architectuur, configuratie, aannames en zoeklimieten](substitution-optimizer.md)

Vertex-fallback en echte AI-responses behoren tot fase 4 en zijn niet als geslaagd getest opgevoerd. De zuivere controle tegen verouderde status-/beleidsversies is wel getest. De optimizer is een begrensde heuristiek: geldigheid en exacte minuutregistratie zijn gecontroleerd, wereldwijde optimaliteit voor alle mogelijke beperkingen wordt niet geclaimd. Voor fase 3 blijft de UI-regressielijst zichtbaar als vervolgwerk.

De lokale bestaande demo is in de in-app browser geopend en visueel gecontroleerd. Op de aparte previewpoort is de Google-bron niet verbonden; de preview is geen verificatie van echte Google-data of een nieuwe adviesinterface.
`;
writeFileSync(new URL('../docs/substitution-test-results.md',import.meta.url),report);
console.log(JSON.stringify({unit:{passed:value('pass'),failed:value('fail')},browser:browser.stats,report:'docs/substitution-test-results.md'}));
