# Beschikbaarheid v37

Voorbereiding bestaat uit wedstrijden opslaan en één rondeformulier met alle
persoonlijke codes klaarzetten. Daarna opent de afzonderlijke uitnodigingspagina.
Een gedeeltelijke verzending blijft daar staan, nooit als voorbereidingsstap.

Reacties bijwerken haalt uitsluitend antwoorden op. Een ontbrekend, onvolledig of
niet controleerbaar formulier geeft een zichtbare melding met instellingenactie;
het synchronisatie-icoon opent nooit Wedstrijden/voorbereiding.

Uitnodigingen bekijken opent een kanaalonafhankelijke spelerslijst. Iedere regel
toont afzonderlijk de verzending en het antwoord. Filters: Alle spelers,
Uitnodigen, Wacht op antwoord (bevestigd verstuurd en nog geen inzending),
Gereageerd. Kanaal en ontvangers worden gekozen na Spelers uitnodigen. De
wijzigingslink staat in het spelerdetail, niet bij iedere lijstregel.

WhatsApp openen is geen verzendbewijs. Bij terugkeer wordt een geopende,
onbevestigde speler aangeboden voor bevestiging. In het spelerdetail kan de coach
ook een buiten deze flow verstuurde uitnodiging registreren. De expliciete
bevestiging wordt eerst lokaal opgeslagen met een duurzame batch-ID, en daarna
gedeeld opgeslagen. Na een fout blijft zichtbaar dat de coach verzending heeft
bevestigd maar de registratie nog niet is opgeslagen; een herhaling gebruikt
dezelfde batch en verstuurt niets. Een al ontvangen antwoord blokkeert nieuwe
startuitnodigingen, maar niet het achteraf registreren van de bestaande WhatsApp.
Een bestaande gedeelde verzending/wachtrij/onzekere verzending blokkeert een
tweede registratie; controleer de bestaande status eerst. Geen automatische mails.

Een oud voorbereidingsconcept wordt uitsluitend afgerond bij gelijke opgeslagen
wedstrijden en een bestaande gedeelde uitvraag (verzending in behandeling,
verstuurd, onzeker of een ontvangen inzending), of na verificatie van het
rondeformulier en alle persoonlijke codes. Zo wordt een al gestarte ronde niet
weer voorbereiding als Google tijdelijk onbereikbaar is of het formulier later
gesloten is. De volledige voorbereiding wordt eerst onder de bestaande lokale
account/teamseizoenscope als completed-backup bewaard. Afwijkende wedstrijdkeuzes
blijven actief; de coach kan ze bekijken en expliciet de opgeslagen wedstrijden
gebruiken, met een aparte before-reconcile-backup. Een oudere ronde zet de actieve
ronde nooit terug. Een mislukte controle bewaart het concept.

De lokale demo gebruikt dezelfde uitnodigingscomponent met uitsluitend lokale
verzendsimulatie, herkenbaar benoemd. Werkelijke Google-data, ouders en
verzendingen zijn niet aangepast in de controle.

Validatie: unit-/backendtests voor afzonderlijke statusassen, filters, lokale
attestatie, onzekere/in behandeling zijnde verzending, rondeafronding zonder
gegevensverlies, en idempotente WhatsApp-registratie na een antwoord. Handmatig
in de in-app browser: refresh zonder navigatie, overzicht, filter, spelerdetail,
WhatsApp-bevestiging, kanaalkeuze, uitsluiting reeds verstuurde speler en lokale
e-mailverzending. Fysieke iPhone en ingelogde productieflow zijn nog niet getest.
Geen Apps Script- of bronkolomwijziging; Cloud Run-update nodig.
