# Beschikbaarheid en uitnodigingen — 22 oktober 2026

De rondekaart opent nu met **Lopende speelronde**, het rondenummer, de datums en
het aantal wedstrijden. De reacties zijn kleiner weergegeven. Reacties bijwerken
staat als synchronisatie-icoon naast de titel; Uitnodigingen beheren is de blauwe hoofdknop; de voorbereiding van een nieuwe ronde blijft
apart staan.

Uitnodigingen heeft een uitklapbare berichteditor, Standaardtekst herstellen en
een persoonlijk voorbeeld. Het bericht blijft lokaal bewaard per account,
teamseizoen en formulier en wordt door beide kanalen gebruikt. Beschikbare
vervangingen zijn `{speler}`, `{team}`, `{seizoen}`, `{speelronde}` en
`{wedstrijden}`. Naam, context, persoonlijke links en de uitleg over inzenden
worden automatisch toegevoegd. Een e-mailvoorbeeld toont benoemde klikbare
links; een WhatsApp-voorbeeld toont het daadwerkelijke adres.

Een verzendbatch bewaart een snapshot van de tekst. Herhalen met een andere tekst
geeft een conflict; herstel na een verloren antwoord verstuurt geen tweede batch.
Ook een WhatsApp-rij bewaart zijn oorspronkelijke tekst bij herladen. De tekst
kan tijdens een nog lopende rij of onzekere e-mailbatch niet worden veranderd.
De daadwerkelijke mailworker gebruikt dezelfde opgeslagen tekst, met HTML-escaping.

## Korte persoonlijke links

De bestaande Google Apps Script-koppeling gebruikt
[Form.shortenFormUrl](https://developers.google.com/apps-script/reference/forms/form#shortenFormUrl(String))
voor het volledige persoonlijke startadres en, na inzending, het afzonderlijke
Google-bewerkadres. Er is geen externe verkortingsdienst toegevoegd. Een generieke
formulierlink zonder code wordt nooit gebruikt als vervanging.

FormInvites behoudt zijn bestaande acht kolommen en krijgt achteraan
`shortUrl`, `shortUrlSource`, `shortEditUrl` en `shortEditUrlSource`. De lange
start-/bewerkadressen, codes, antwoord-ID's en tijden blijven bestaan. De backend
en app gebruiken een kort adres alleen bij een toegestane Google-host én een exact
overeenkomend opgeslagen doel. Na een code/default-/antwoordwijziging wordt een
verouderde verkorting niet hergebruikt. Bij een fout blijft de werkende lange link
beschikbaar en geeft WhatsApp aan dat de korte link nog ontbreekt.

De bestaande minuutworker vult oude uitnodigingen in kleine batches aan; dit
verstuurt geen uitnodigingen en verandert geen formulier-vraag-ID's of antwoorden.
FormDeliveries krijgt één optionele kolom `message`. Oude tabellen blijven leesbaar.
De bijgewerkte worker meldt `worker-invitations-v2`; aangepaste tekst wordt niet
stilzwijgend door een oude worker genegeerd: de backend blokkeert dan de verzendactie.

Voor gebruik in productie moeten **frontend/backend én de bestaande Apps Script-
bestanden AvailabilityMail.gs en Distribution.gs** worden bijgewerkt. Bij een al
geïnstalleerde worker zijn daarvoor geen nieuwe triggers nodig. Controleer daarna
de workerstatus, echte verkorte omleidingen en pas vervolgens een expliciete
proefuitnodiging. Deze wijziging is nog niet naar Google uitgerold; er zijn geen
echte berichten verstuurd of formulierantwoorden gewijzigd.

## Scrollen

De React-portaalgrens van AvailabilityPage houdt pointergebeurtenissen binnen de
geopende pagina. De achtergrond-MobileScroll kan hierdoor geen pointercapture
overnemen. De bestaande scrollfysica, scrollbar en kliksuppressie blijven intact;
de beschermde runtime is niet gewijzigd. De demo heeft nu ook een werkende
spelersselectie en berichteditor; de echte verzendactie blijft daar uitgeschakeld.

## Verificatie

- **178/178 unit- en backendtests** geslaagd, zonder skips. Dit omvat scope,
  oude tabellen, volledige persoonlijke shortener-input, verouderde doelen,
  daadwerkelijke workertekst, HTML-escaping, batchherstel en legacy match-Forms.
- **43/43 gerichte browsertests** geslaagd, zonder skips of flaky gevallen:
  availability-journey (25), invitation-refinement (5), invitation-flow (2),
  round-review (2), availability-round-review (1), mobile-runtime (8).
- Scrolltests voeren een echte pointerdrag en wielbeweging uit op spelersrijen in
  de desktoppreview en op 390px. De achtergrond blijft staan en de selectie wijzigt
  niet. De editor bewaart tekst bij herladen en is gescheiden per account. Het
  WhatsApp-bericht bevat de juiste start-/bewerklinks; er wordt niets verzonden.
- TypeScript, productiebuild en **28/28 beschermde runtimebestanden** slagen.
  De bestaande waarschuwing over de JavaScriptbundle boven 500 kB blijft bestaan.

Rapporten: `outputs/invitation-refinement-unit.txt`,
`outputs/invitation-refinement-browser-all.json`,
`outputs/invitation-refinement-build.txt`. De Google-API en Apps Script-omgeving
zijn in tests nagebootst. Echte Google-verkortingen en een fysiek toestel zijn nog
niet getest; de overige oudere brede UI-suites zijn niet volledig herhaald.

![Rondekaart](../outputs/invitation-refinement-overview.png)

![Berichteditor](../outputs/invitation-refinement-editor.png)
