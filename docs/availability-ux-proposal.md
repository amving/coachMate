# Beschikbaarheid — actieve ronde en tweestappenroute

De gebruiker heeft deze vervangende indeling goedgekeurd voor implementatie op 21 oktober 2026. Het hoofdscherm toont de actieve uitvraag met een rustige rondecontext, ontvangen ouderreacties, één Reacties bijwerken-actie, een link naar uitnodigingen en compacte wedstrijdregels. De rondekeuze staat niet bovenaan. Eerdere speelrondes openen afzonderlijk, met alleen-lezen antwoorden. Gewone bron-/publicatie-instructies horen niet op het dagelijkse overzicht.

Nieuwe ronde voorbereiden staat afgescheiden onder de wedstrijden; een lokaal concept krijgt Voorbereiding hervatten. Deze route opent schermvullend, met een vaste terug- en sluitknop en twee stappen:

1. **Wedstrijden**: rondegegevens uit Sheets ophalen, bestaande wedstrijden behouden en aanvullen met invoer in de app. Opslaan en formulier voorbereiden bewaart de wedstrijden en bereidt het rondeformulier voor. Pas na controle van publicatie, vragen en persoonlijke koppelingen kan de coach verder.
2. **Uitnodigen**: spelers en kanaal kiezen, ontbrekende gegevens herkennen, eventueel het ouderformulier bekijken en expliciet versturen of WhatsApp-berichten klaarzetten. Een aparte controlestap vervalt.

Vernieuwen behoudt lokale aanvullingen en vraagt om expliciete oplossing bij gelijktijdige wijzigingen. Een bestaand lokaal wedstrijdjournal wordt nooit door nieuwe brongegevens vervangen. Bestaande rondeformulieren worden hergebruikt; gewijzigde vragen of antwoorden worden niet stilzwijgend vervangen. Alleen expliciet starten van uitnodigingen activeert een volgende ronde. Klaarzetten of openen van WhatsApp is geen verzendbewijs.

Oude drie-stappenconcepten behouden wedstrijden, spelers, kanaal en reeds bekende verzendstatus bij migratie. Ronde, teamseizoen, persoonlijke codes, handmatige voorrang en historische gegevens blijven gescheiden. Google-koppeling, clubopmaak en geavanceerd herstel blijven in Instellingen.

Zie [implementatie en tests](availability-implementation-tests.md) voor de actuele verificatie. De eerdere review hieronder is historische context en beschrijft de inmiddels vervangen indeling.

---

## Historische review van 18 oktober 2026

# Voorstel Beschikbaarheid — annotatie 6

**Status: goedgekeurd door de gebruiker op 18 oktober 2026; geïmplementeerd. Zie [implementatie en tests](availability-implementation-tests.md).** Beoordeeld in de huidige lokale demo, met nieuwe screenshots van de gebruikersreis. De twee doelen zijn de actieve uitvraag volgen en een volgende speelronde voorbereiden en uitvragen.

## Advies

Laat Beschikbaarheid standaard openen op de **actieve uitgevraagde speelronde**, met daaronder één duidelijk gelabelde actie **Nieuwe speelronde voorbereiden**. Houd het bekijken van bestaande reacties en het opbouwen van een volgende ronde herkenbaar gescheiden. Een nieuwe concept-ronde mag de huidige uitvraag niet stilzwijgend vervangen.

Het grootste probleem in het onderzochte scherm is de betekenis van de informatie. **4 wedstrijden** zegt hoeveel wedstrijden bestaan, maar vertelt de coach niet of er al uitnodigingen zijn verstuurd of hoeveel ouders hebben gereageerd. De tekst **Reacties worden pas zichtbaar na bijwerken** staat naast reeds gevulde aanwezigheidsaantallen. In het wedstrijddetail blijken die aantallen coachcorrecties te zijn. Dat onderscheid moet meteen op de hoofdpagina duidelijk zijn.

## Beoordeelde reis

### 1. Actieve ronde bekijken — overzichtelijk, onvoldoende status

![Huidige ronde](../outputs/availability-ux-review/01-active-round.png)

- Goed: de rondekeuze is bovenaan zichtbaar en wedstrijden zijn direct te openen.
- Probleem: uitnodigingsstatus, ontvangen ouderreacties en de volgende coachactie ontbreken in deze demoweergave. De plus heeft visueel weinig gewicht voor een hoofdtaak.
- Verbetering: een compact blok **Actieve uitvraag** met ronde, aantal wedstrijden, werkelijk ontvangen reacties en laatste geslaagde import. Toon **Uitnodigen** en **Reacties bijwerken** als zichtbare acties. Geef een uitgeschreven ingang naar de nieuwe ronde.

### 2. Eén wedstrijd bekijken — veilig, onderscheid tussen bronnen komt laat

![Wedstrijddetail](../outputs/availability-ux-review/02-match-detail.png)

- Goed: het detail begint alleen-lezen en onderscheidt coachcorrecties per speler.
- Probleem: op het hoofdoverzicht was nog niet duidelijk dat de aanwezigheidsaantallen geen bewijs van een ouderreactie zijn. In deze opname vraagt de actie onderaan extra scrollen.
- Verbetering: behoud het leesdetail met **Aanpassen**, noem de wedstrijd herkenbaar in de titel en toon bij iedere speler de bron. Laat een coachcorrectie zichtbaar voorgaan op een later formulierantwoord.

### 3. Aanwezigheid corrigeren — duidelijke expliciete verwerking

![Correctie-editor](../outputs/availability-ux-review/03-correction-editor.png)

- Goed: selecties hebben labels en de verwerking is een aparte handeling. De knop is terecht uitgeschakeld als er niets gewijzigd is.
- Verbetering: behoud deze bestaande lokale correctie-editor. Maak bij wijzigingen de telling **2 wijzigingen nog niet verwerkt** en **Annuleren / Wijzigingen verwerken** steeds bereikbaar. Vermijd een tweede afwijkende editor voor hetzelfde matchgegeven.

### 4. Nieuwe ronde maken — formulier bruikbaar, reis stopt te vroeg

![Nieuwe ronde](../outputs/availability-ux-review/04-new-round.png)

- Goed: één wedstrijd tegelijk invullen is begrijpelijk en extra wedstrijden toevoegen is zichtbaar.
- Probleem: **Speelronde en wedstrijden opslaan** benoemt alleen gegevensopslag. De tekst over daarna een beschikbaarheidsformulier maken introduceert nog een technische taak; ontvangers kiezen en echt uitvragen liggen buiten dit overzicht.
- Verbetering: maak hier een begeleide route van die eindigt met de uitnodiging. De coach moet kunnen zien wat lokaal concept is, wat wordt voorbereid, en wat daadwerkelijk is uitgevraagd.

## Voorgestelde indeling

1. **Actieve uitvraag**: rondekeuze met gewone tekst zoals *Speelronde 3 · 4 wedstrijden*. Toon alleen werkelijke aantallen: *ontvangen ouderreacties*, *nog geen reactie*, *uitnodigingen verstuurd / mislukt / onzeker*. Onbekende of nog niet geladen status blijft expliciet onbekend. Een handmatige aanwezigheidswijziging verhoogt nooit de telling ontvangen ouderreacties.
2. **Acties**: **Uitnodigen** en **Reacties bijwerken**, met een korte status na afronding. Een importtijdstip verschijnt uitsluitend na bevestigde succesvolle verwerking. Bij een fout blijven de eerder bekende gegevens staan. Technische Form-problemen krijgen één concrete herstelactie; gewone coaches hoeven geen Google-vragenstructuur te beheren.
3. **Per wedstrijd**: compacte leesbare datum, tegenstander, tijd/thuis-uit en *aanwezig / afwezig / onbekend*. De eerstvolgende relevante wedstrijd staat bovenaan. Eerdere wedstrijden en afgesloten rondes blijven bereikbaar zonder ze voor de huidige uitvraag aan te zien.
4. **Nieuwe speelronde voorbereiden**: een zichtbare gelabelde knop. Een bewaard concept krijgt **Voorbereiding hervatten**. Rondeselectie blijft beschikbaar, maar vervangt deze ingang niet.

## Voorgestelde nieuwe-ronderoute

| Stap | Wat de coach doet | Duidelijke vervolgstap |
| --- | --- | --- |
| 1 · Wedstrijden | Datums, tegenstanders, tijden en thuis/uit invoeren; meerdere wedstrijden toevoegen | Verder naar spelers |
| 2 · Spelers en kanaal | Spelers selecteren, e-mail of WhatsApp kiezen en ontbrekende contactgegevens herkennen | Uitvraag controleren |
| 3 · Controleren en uitvragen | Ronde, wedstrijden, ontvangers en persoonlijke berichttekst controleren | Uitnodigingen versturen of WhatsApp-berichten klaarzetten |

Teruggaan behoudt het lokale concept. Er gaat geen uitnodiging uit door alleen een ronde aan te maken of een kanaal te kiezen. E-mail blijft één expliciete coachhandeling met afzonderlijke persoonlijke berichten. Bij WhatsApp opent de coach de persoonlijke gesprekken en verstuurt zelf; **klaargezet/geopend** wordt niet **verzonden** genoemd. Na uitvragen toont het scherm de echte uitkomst per speler, inclusief mislukte en onzekere bezorging, en biedt het een gerichte vervolgactie.

## Toegankelijkheid en grenzen van deze beoordeling

- De plus heeft al een toegankelijke naam, maar een zichtbaar tekstlabel helpt de taak ook zonder uitleg te vinden.
- Houd acties en selects minimaal circa 44 px hoog, geef secundaire labels voldoende contrast en benoem status ook in tekst. De onderzochte correctie-editor heeft labels; dat is een patroon om te behouden.
- Meld een afgeronde import of mislukte verzending ook voor schermlezers en laat focus na teruggaan terugkeren naar de juiste ronde/wedstrijd.
- Dit was een beoordeling van de **lokale demo** en de zichtbare interacties. De echte Google-tak bevat volgens de broncode al Uitnodigen en Reacties bijwerken, maar login, publicatie, mailbezorging, echte formulierantwoorden en foutmeldingen van Google zijn in deze UX-review niet doorlopen. Er is geen uitnodiging verzonden en geen ronde aangemaakt.
- Screenshots bewijzen geen WCAG-conformiteit. Toetsenbordbediening, focus na fouten, schermlezers, kleurcontrast en echte touchapparaten moeten bij een implementatie afzonderlijk worden gecontroleerd.

De voorgestelde wijziging is dus een herordening rond twee coachdoelen, met behoud van lokale concepten, ronde-/seizoensscope, bestaande persoonlijke links en handmatige voorrang. **Goedgekeurd voor implementatie van annotatie 6.**
