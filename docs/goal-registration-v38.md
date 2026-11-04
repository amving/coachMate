# Goalregistratie v38

Normaal: Goal → actuele veldspeler (keeper inbegrepen) → expliciete knop
Registreer met maker en nieuwe thuis/uitstand. Selecteren alleen wijzigt geen score.
Compacte tweekolomslijst, geen herhaalde veldspelerlabels of standaard eigen-goaltab.
Tegengoal → nieuwe stand → Registreer. Eigen doelpunt van ons team is een aparte
secundaire actie, met verplichte spelerkeuze en zonder verhoging van spelersgoals.

Andere speler / onbekend toont overige teamseizoenspelers, inclusief spelers die
als afwezig staan. De waarschuwing vermeldt hun geregistreerde status. Expliciete
registratie gebruikt allowOffField, gevalideerd tegen dezelfde seizoensroster.
Er wordt geen wissel, aanwezigheidscorrectie of extra persoonlijke tijd verzonnen.
De lopende klok rekent uiteraard door voor de werkelijke geregistreerde bezetting.
Na een uitzondering blijft Opstelling controleren bereikbaar naast Ongedaan maken.

Een normale goal zonder bekende maker gebruikt playerId=null en ownGoal=false,
met een expliciete unknownScorer-opdracht. Hij telt in de score en, na verwerking,
in het seizoensteamtotal, niet als eigen goal of goal voor een verzonnen speler.
Het verwerkingsvoorbeeld benoemt nog onbekende makers. Het wedstrijdbericht
gebruikt Doelpuntenmaker onbekend. Gewone tegengoals behouden playerId=null.

Bij openen wordt de huidige hele speelminuut bevroren; de registratie gebruikt
de huidige werkelijke tijd om klok en minuten te verrekenen. De apart opgegeven
goalminuut mag niet negatief, fractioneel of later dan de werkelijke speeltijd zijn.
Dit voorkomt zowel verschoven doelpuntminuten als teruglopende journal-tijdstempels.
De nieuwe stand blijft tijdens de sluitanimatie staan; er flitst geen volgende goal.

Wedstrijdverloop biedt Aanpassen voor maker en minuut. Correcties veranderen geen
score, volgordenummer, wissel of tijdsverdeling; lege tijd betekent onbekend.
Een exacte event-snapshot plus match-ID voorkomt een correctie op een inmiddels
ander event. Bij het nog getoonde verwerkte Live-duel worden ook diens archief en
spelersgoals samen bijgewerkt; overige wedstrijden en bestaande minuten blijven
intact. Seizoensarchieven blijven read-only. Oudere wedstrijden blijven via de
bestaande statistiekenpagina corrigeerbaar. Geen automatische upload: bestaande
expliciete opslag en batch-idempotentie blijven van toepassing.

De bevestiging toont stand, maker en minuut met Ongedaan maken. Ze verdwijnt na
acht seconden; bij een opstellingsuitzondering blijft ze staan tot sluiten of
Opstelling controleren. Bestaande undo-knoppen naast Goal/Tegengoal blijven.

Validatie: 230 unit-/backendtests, TypeScript/build en 28 runtimehashes. Nieuwe
tests dekken expliciete bank-/afwezig-uitzondering, vreemde speler-ID's, bevroren
minuut met doorlopende klok, journalreplay, onbekende maker/teamtotal, eigen goals,
undo, stale correcties en correctie na verwerking. Handmatige in-app browserdemo:
gewone tegengoal, compact goalformulier, bankspeler met waarschuwing, ongewijzigde
opstelling/minuten, maker aanpassen en onbekende maker. Geen Google-data of
uitgaande WhatsApp-berichten gebruikt. Fysieke iPhone en ingelogde productieflow
zijn niet getest. Geen nieuwe Apps Script- of bronkolomupdate nodig.
