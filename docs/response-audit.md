# Formulierimport herleiden naar de speler — 25 oktober 2026

## Oorzaak

De mailtrigger bewaart `FormResponse.getId()` uit Apps Script op FormInvites.
De backend importeert `responseId` uit de Forms REST API op FormResponses.
Bij de onderzochte inzending waren deze ID's verschillend. De persoonlijke code,
het formulier en de inzendtijd bevestigden dat het dezelfde inzending was.
Het oude importlog bevatte alleen formId, responseId, updatedAt en result; geen
speleridentiteit. De antwoorden waren wel verwerkt, maar niet eenvoudig op naam
of op het andere antwoord-ID terug te vinden.

## Correctie

De oorspronkelijke vier kolommen en de API-ID als idempotentiesleutel blijven
behouden. Achteraan komen teamSeasonId, playerId, playerName, round en
appsScriptResponseId. De import koppelt de speler uitsluitend met de bestaande
persoonlijke code binnen het exacte formulier en actieve teamseizoen/rooster.
Naam of e-mail wordt nooit als identiteit gebruikt.

Het Apps Script-ID wordt alleen gekoppeld wanneer ook de inzendtijd overeenkomt
op milliseconden, omdat Apps Script die precisie gebruikt. Bij meerdere API-ID's
met dezelfde code en milliseconde blijft deze alias leeg; er wordt niet gegokt.
Een oudere inzending krijgt nooit het ID van een latere reactie.

Bij Reacties bijwerken worden reeds verwerkte logregels ook aangevuld. Het
oorspronkelijke resultaat en tijdstip blijven staan; beschikbaarheid, handmatige
voorrang en Live worden niet opnieuw verwerkt. Een import zonder toegepaste
antwoorden schrijft alleen het log en verhoogt de wedstrijdrevisie niet.
Oude vierkolomsbladen blijven leesbaar; de extra kolommen worden bij de eerste
import met de nieuwe backend toegevoegd. Andere teams/logregels blijven behouden.

## Uitrol

Pakket v35 bevat de backendcorrectie. Geen nieuwe Apps Script-update of triggers
nodig: behoud het huidige v3-mailscript en de bestaande responseId's, editlinks en
mailSentAt. Pas na deployment één keer Reacties bijwerken voor de betreffende
ronde gebruiken om oude regels met de beschikbare Google-reacties aan te vullen.
Verwijder geen bestaande logs om opnieuw te kunnen importeren.

## Verificatie

216 unit-/backendtests geslaagd. Nieuwe regressies controleren verschillende
ID's, precisieverschil, idempotente metadata-aanvulling, behoud van handmatige
correcties en het oorspronkelijke resultaat, foute/ambigue codes, vreemde
formulieren/rosters, gewijzigde antwoorden, oudere inzendingen en veilige
migratie van het vierkolomslog met behoud van andere rijen.
TypeScript/build en de 28 beschermde runtimebestanden slagen. Productiesmoketest
gebeurt bij verpakken. Geen live import, Google-bronmutaties of uitrol uitgevoerd
tijdens deze correctie.

Google beschrijft de afzonderlijke interfaces in
[Apps Script FormResponse](https://developers.google.com/apps-script/reference/forms/form-response)
en [Forms API FormResponse](https://developers.google.com/workspace/forms/api/reference/rest/v1/forms.responses).
De afwijkende ID's bij deze inzending zijn vastgesteld in de bron, niet afgeleid
van een veronderstelde conversie tussen beide API's.
