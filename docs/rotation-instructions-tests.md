# Concrete wisselinstructies — 18 oktober 2026

Bij Start op de bank staat nu een compacte samenvatting van de echte bezettingswijzigingen. Tijdens de kwarten/helften en tussen de kwarten/in de rust zijn afzonderlijke blokken. Elke rij vermeldt het geplande moment en hoeveel spelers erin en eruit gaan. De tijden beginnen opnieuw bij elk kwart/elke helft; wisselen blijft bij stil spel. De optimizer en zijn rooster zijn niet gewijzigd.

`rotationInstructions` groepeert alleen identieke patronen. Andere aantallen of keeperwissels krijgen een eigen kwart-/helftvermelding. Ongewijzigde intervalgrenzen leveren geen verzonnen wissels op; een pauze zonder wijziging heet Geen wissel. Een keeperrolwissel zonder bankbeweging heet Alleen keeperwissel. De bankaantallen omvatten ook een keeper die van/naar de bank gaat. Er is geen wissel na affluiten. Onberekende coachkeuzes verbergen de oude instructies tot herberekening.

In het huidige bewaarde demoplan: kwart 1, 2 en 4 na 5 en 10 minuten drie spelers erin/eruit; kwart 3 na 5 minuten twee, na 10 minuten drie. Na kwart 1 twee spelers erin/eruit, na kwart 2 en 3 drie. Bij deze pauzes verandert ook de keeper. Dit illustreert waarom één algemeen aantal onvoldoende was. De aantallen volgen het actuele plan en kunnen na nieuwe keuzes anders worden.

## Verificatie

- **152/152 unit- en backendtests geslaagd**. Twee nieuwe instructietests controleren verschillende aantallen van één, twee en drie spelers, afwijkende kwartpatronen, keeperrolwissels zonder bankverplaatsing, ongewijzigde grenzen, geen wissel na affluiten, groepering van identieke patronen en beide periodeformaten.
- **22/22 gerichte browsertests geslaagd**, zonder overgeslagen of flaky gevallen: 14 voorbereidingsgevallen en 8 gevallen voor de lopende assistent. De nieuwe instructiecasus controleert de echte wisselaantallen per kwart en pauze, plus het verbergen en herstellen na gewijzigde keeperkeuzes. Bestaande gevallen controleren lokale opslag, herladen, foutafhandeling en schermranden op 320px, 390px, desktop-iPhone en Pixel.
- TypeScript, productiebuild en integriteit van **28/28 beschermde runtimebestanden** geslaagd. De bestaande waarschuwing over bundlegrootte blijft.
- De bestaande demo is in de in-app browser doorlopen via beide stappen. De specifieke aantallen, gegroepeerde kwarten, pauzewissels en bereikbare bevestigingsactie zijn visueel gecontroleerd.

Rapporten: `outputs/rotation-instructions-unit.txt`, `outputs/rotation-instructions-browser.json`, `outputs/rotation-instructions-build.txt`. De definitieve browserstatus staat in het JSON-rapport. De brede oudere UI-suite is niet volledig herhaald; Google-verkeer is nagebootst. Geen echte upload of deployment uitgevoerd.

![Wisselinstructies per kwart en pauze](../outputs/rotation-instructions-preview.png)
