# Startplan — annotaties 1–5

Dit document beschrijft de eerdere implementatie van annotaties 1–5. Beschikbaarheid is daarna met goedkeuring geïmplementeerd; zie [de beschikbaarheidsverificatie](availability-implementation-tests.md). De nieuwste startplanroute heeft twee aparte schermen; zie [de actuele UX-wijziging en tests](start-plan-two-step-tests.md).

| Controle | Uitkomst |
| --- | --- |
| Alle Node-unit- en backendtests | **146/146 geslaagd** |
| Voorbereidings-/startopstellingstests daarbinnen | **22/22 geslaagd** |
| Gerichte browsertests: voorbereiding en lopende wisselassistent | **15/15 geslaagd** |
| Daarbinnen de gewijzigde startflow | **7/7 geslaagd** |
| TypeScript en productiebuild | Geslaagd |
| Beschermde mobiele runtime | Alle 28 bestanden intact |
| Vrije referentie-optimizer via bestaande wedstrijdreducer | **400 speler-minuten, 50 keeperminuten, 0 ms maximale doelfout** |

De eerdere brede app-run bleef rood: **73/102 geslaagd, 29 mislukt**. Die run is niet opnieuw als volledige suite uitgevoerd voor deze annotaties en wordt niet als groen opgevoerd. De resultaten en concrete fouten staan in [het eerdere rapport](match-preparation-tests.md). Deze eindcontrole gebruikt één worker tegen de bestaande preview op poort 4190, zonder app-bronwijzigingen tijdens de geslaagde run. Een eerste gerichte poging vond twee verouderde selectors voor de uitklapbare startopstelling; na correctie van die testlocators slaagt de gerichte suite volledig.

## Geteste wijzigingen

- Spelersbevestiging berekent direct het eerste voorstel. Er is geen verplichte tussenstap voor keepers vóór die berekening.
- Vier keeperkeuzes gelden voor de hele wedstrijd, ook bij twee helften. De eerste suggestie gebruikt twee kandidaten; expliciet ongeschikte bronkandidaten worden niet automatisch voorgesteld. De coach kan voor deze wedstrijd één tot vier aanwezige keepers aanwijzen. Een eerste keeperkeuze wisselt de startrol direct met een andere reeds gekozen keeper zonder duplicaten.
- Wisselritme staat in het blok Start op de bank. De lijst Alle wisselmomenten is uit het startplan verwijderd.
- Startopstelling groepeert de keeper en Verdediging/Middenveld/Spits. Onbekende posities blijven onbekend tot een coachkeuze. Startposities en starterskeuze gelden per wedstrijd; seizoensposities, profielen en kwaliteitsscores blijven behouden.
- Een handmatig gekozen startveld is een harde optimizerconstraint, ook bij vrije wisselmomenten. Alle aangeboden scenario's respecteren de starters. De volledige bezetting, keeper, beschikbaarheid en persoonlijke limieten worden opnieuw gevalideerd.
- Handmatige keeper-, ritme-, positie- en bankwijzigingen blijven eerst als scoped lokaal concept staan. De oorspronkelijke berekende toestand blijft behouden totdat Wijzigingen doorrekenen slaagt. Definitief bevestigen is geblokkeerd zolang wijzigingen nog niet zijn berekend.
- Aanpassingen en de definitieve startopstelling overleven tabs en herladen. Opnieuw de ongewijzigde spelersgroep bevestigen behoudt de handmatige starters en posities.
- Geen gespeelde wissels, keepercorrecties, klokstart of speelminuten door voorbereiding. Ongeldige starters, onbekende/afwezige spelers, dubbele keepers, een vijfde keeper en onhaalbare limieten worden atomisch afgewezen.
- Herberekening en acceptatie gebruiken het bestaande lokale journal. De browsercontrole gebruikt een gemockte Google-backend: geen losse writes bij bewerken; één expliciete upload, met behoud van batch-ID en acties na een gesimuleerde fout en een idempotente retry.
- De dashboardknop staat bij Wisselplan. Berekend voorstel, handmatig aangepast voorstel en door de coach bevestigd plan hebben verschillende tekstlabels.

## Uitvoer

- [Node-uitvoer](../outputs/start-plan-refinement-unit.txt)
- [Geslaagde gerichte browserrun](../outputs/start-plan-refinement-browser-final.json)
- [Build en runtimecheck](../outputs/start-plan-refinement-build.txt)
- [Referentieverificatie](../outputs/start-plan-refinement-reference.txt)
- [UX-voorstel annotatie 6](availability-ux-proposal.md)

Er is niets gedeployd en er zijn geen echte Google-teamgegevens, Forms of berichten gewijzigd. Vertex AI is niet toegevoegd. De bekende buildwaarschuwing voor de JavaScriptbundle groter dan 500 kB blijft bestaan.
