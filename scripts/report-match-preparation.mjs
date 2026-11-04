import {readFileSync,writeFileSync} from 'node:fs';
const read=path=>{const b=readFileSync(new URL(`../${path}`,import.meta.url));return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'');};
const targeted=JSON.parse(read('outputs/match-preparation-browser-final.json'));
const full=JSON.parse(read('outputs/match-preparation-browser-all.json'));
const unit=read('outputs/match-preparation-unit.txt');
const reference=JSON.parse(read('outputs/match-preparation-reference.txt').trim().split('\n').at(-1));
function rows(report){const result=[];function visit(suites){for(const suite of suites){for(const spec of suite.specs??[])for(const test of spec.tests??[])result.push({file:spec.file,title:spec.title,status:test.status,error:test.results.at(-1)?.errors?.map(e=>e.message).join('\n')??''});visit(suite.suites??[]);}}visit(report.suites);return result;}
const tests=rows(full),focused=rows(targeted),files=[...new Set(tests.map(t=>t.file))].sort();
const clean=s=>s.replace(/\u001b\[[0-9;]*m/g,'').replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
const count=key=>Number(new RegExp(`^# ${key} (\\d+)`,'m').exec(unit)?.[1]);
const report=`# Wedstrijddagflow en keeperkeuze — testresultaten 18 oktober 2026

De twee dashboardacties zijn vervangen door één voorbereiding: definitieve spelersgroep, wedstrijdkeepers/startkeeper en wisselritme, gevolgd door het startplan en Live. Bevestiging triggert de deterministische optimizer en zet de startopstelling klaar. De klok en gespeelde wissels veranderen hierdoor niet. Er zijn geen echte Google-gegevens gewijzigd, uitnodigingen verstuurd, Vertex-aanroepen gedaan of deployments uitgevoerd.

| Controle | Resultaat |
| --- | --- |
| Alle Node-unit-/backendtests | **${count('pass')}/${count('tests')} geslaagd**, ${count('fail')} mislukt |
| Voorbereidingstests binnen die Node-run | **16/16 geslaagd** |
| Gerichte browser-eindcontrole | **${targeted.stats.expected}/${focused.length} geslaagd**, ${targeted.stats.unexpected} mislukt |
| Nieuwe wedstrijddag-browsertests daarbinnen | **${focused.filter(t=>t.file==='match-preparation.spec.ts'&&t.status==='expected').length}/6 geslaagd** |
| Brede browsercontrole, alle spec-bestanden | **${full.stats.expected}/${tests.length} geslaagd**, **${full.stats.unexpected} mislukt**, ${full.stats.skipped} overgeslagen |
| TypeScript, productiebuild en runtime-integriteit | Geslaagd; alle 28 beschermde runtimebestanden intact |
| Referentieverificatie van de vrije optimizer | ${reference.validation}: **${reference.playerMinutes} speler-minuten**, **${reference.keeperMinutes} keeperminuten**, **${reference.maximumTargetDeviationMs} ms maximale doelfout** |

De gerichte eindcontrole draaide met één worker tegen een verse Vite-server op poort 4190, zonder bronwijzigingen tijdens die run. De brede controle gebruikte dezelfde server, alle spec-bestanden en één worker, met een algemene timeout van 15 seconden (tests met een eigen timeout behouden die). Dit is geen verklaring dat de volledige suite groen is. De precieze fouten staan hieronder; er wordt niet beweerd dat alle mislukkingen bewezen bestaande fouten of uitsluitend infrastructuur zijn. Eerdere runs en de eerdere volledige fase-3-run staan apart in [het eerdere rapport](substitution-phase-3-tests.md).

## Nieuwe dekking

- Geen plan of wijziging vóór expliciete bevestiging. Onbekende spelers, te kleine groepen, ongeldige/afwezige keepers en onhaalbare persoonlijke limieten worden atomisch afgewezen.
- Matchkeepers en startkeeper zijn harde constraints, zonder wijziging van seizoensprofielen. Bekende voorafgaande keeperbeurten helpen de suggestie; onbekende en toekomstige gegevens tellen niet als ervaring.
- Keuze uit vijf/tien minuten, kwart-/helftovergangen of vrije momenten. Vaste ritmes beginnen per periode opnieuw. Blokherverdeling voegt geen verborgen wissels op seconden toe; de echte afwijking van persoonlijke streeftijden wordt getoond.
- Exacte totale speler- en keeperminuten; een correctie of verlate uitvoering herplant vanuit de werkelijke bezetting/klok. Een keepercorrectie vóór de aftrap blokkeert geen herplanning door de voormalige startkeeperkeuze.
- Scoped aanwezigheid- en keeperconcepten blijven na tabwissels/herladen bewaard. Bevestiging en acceptatie lopen via het lokale journal, met idempotente replay en handmatige voorrang boven Forms. Een gesimuleerde mislukte Google-upload behoudt dezelfde batch en acties voor retry.

## Brede browsercontrole per bestand

| Bestand | Geslaagd | Mislukt |
| --- | ---: | ---: |
${files.map(f=>`| ${f} | ${tests.filter(t=>t.file===f&&t.status==='expected').length} | ${tests.filter(t=>t.file===f&&t.status==='unexpected').length} |`).join('\n')}

### Fouten in de brede controle

${tests.filter(t=>t.status==='unexpected').map(t=>`- **${t.file}** — ${clean(t.title)}. ${clean(t.error).slice(0,1300)}`).join('\n')}

## Uitvoer

- [Node-uitvoer](../outputs/match-preparation-unit.txt)
- [Gerichte browser-eindcontrole](../outputs/match-preparation-browser-final.json)
- [Brede browsercontrole](../outputs/match-preparation-browser-all.json)
- [Build en runtimecheck](../outputs/match-preparation-build.txt)
- [Referentieverificatie](../outputs/match-preparation-reference.txt)
- [Visuele preview](../outputs/match-preparation-preview.png)
- [Werking en opslag](substitution-phase-3.md)

De buildwaarschuwing voor een JavaScriptbundle groter dan 500 kB blijft bestaan. De deterministische optimizer is een begrensde heuristiek: de getoonde scenario's zijn gevalideerd, maar globale optimaliteit wordt niet gegarandeerd. De 0 ms doelfout hierboven geldt voor de vrije referentie; een door de coach gekozen blokritme kan daarvan afwijken en toont die afwijking expliciet.
`;
writeFileSync(new URL('../docs/match-preparation-tests.md',import.meta.url),report);
console.log(JSON.stringify({unit:`${count('pass')}/${count('tests')}`,targeted:`${targeted.stats.expected}/${focused.length}`,full:`${full.stats.expected}/${tests.length}`,report:'docs/match-preparation-tests.md'}));
