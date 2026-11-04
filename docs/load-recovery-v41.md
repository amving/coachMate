# V41 — team laden en lokale wedstrijdconcepten herstellen

## Onderzoek op 4 november 2026

- Gebruiker: `Ongeldige opslag` in de beginscherm-app op iPhone, ingelogd account zonder geladen team.
- Online V40 kon op desktop met hetzelfde coachaccount EDO hfc JO10-2 laden. Geen wedstrijdgegevens gewijzigd.
- De State-JSON uit een alleen-lezen export van de gedeelde sheet doorstaat parseState. Deze privé-export blijft buiten het uploadpakket.
- selectTeam gebruikte dezelfde foutmelding voor remote state en readJournal. Een onleesbaar lokaal concept blokkeerde het team; Settings exporteerde dan de demo in plaats van het journal. Retry herhaalde dezelfde mislukte stap.
- Reproduceerbaar defect: `Number.isSafeInteger(targetMinutes * 60000)` wijst soms minuten af die uit gehele milliseconden kwamen (`59 / 60000 * 60000` is niet exact 59). Accepteer uitsluitend de representatiefout binnen twee ULP, zonder opgeslagen waarden te wijzigen. Werkelijk fractionele milliseconden blijven afgekeurd.
- Welk veld daadwerkelijk in het iPhone-concept faalt, vergt het herstelbestand van dat apparaat. Verwijder geen app- of browsergegevens.

## Herstel

- Onderscheid Google-state en lokaal journal; toon geen demo-teamcontext of demo-instellingen zolang een ingelogde coach geen team kan laden.
- Retry opent gericht herstel. Settings maakt foutacties bereikbaar en sluit de overlappende melding.
- Exporteer het ruwe scoped journal, backups en legacy lokale opslag zonder parsing. Geen cookies/tokens, andere accounts of willekeurige localStorage-keys.
- Reconstructie alleen bij exact gelijke account/team, originele revision en sourceToken, geldige acties en kloppende resulterende wedstrijd. Preview verandert niets; de coach bevestigt expliciet. Backup van originele bytes vóór vervanging. Behoud batch-ID, attempted-status, acties en tijdstippen. Dit herstelt lokaal en uploadt niets.
- Bij gewijzigde bron of onleesbare acties: behoud het origineel en exporteer. Geen automatische samenvoeging of wissen.
- Als Google het batch-ID al heeft bevestigd: archiveer eerst het raw journal, ruim daarna alleen dat bevestigde actieve journal op. Geen replay of dubbele goals.

## Verificatie

- Unit/backendtests, TypeScript/build en beschermde runtime-hashes.
- In-app browser: remote validatiefout; Retry opent sheet; Settings toont herstelacties zonder demo-instellingen.
- Geïsoleerde lokale API en expres onleesbaar journal: raw export bevat originele fout/acties; preview rekent oorspronkelijke score/tijd; na bevestiging opent team met hetzelfde batch-ID en uploadstatus.
- Geen Google-writes, fysieke Safari-test of herstel van de werkelijke iPhone-opslag uitgevoerd.

Na installatie van V41: heropen de beginscherm-app zonder appgegevens te wissen. Als het team nog geblokkeerd is, exporteer eerst het herstelbestand. Gebruik Concept herstellen alleen bij een gecontroleerd voorstel; anders is analyse van export en actuele bron nodig.

Geen Apps Script-update vereist.
