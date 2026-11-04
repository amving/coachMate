# Naambloksleep op touch — v40

V39 bevatte de muisgestuurde naamblokwissel en de stabiele previewpositie.
Een touch-pointer kan echter impliciet aan een binnenste naam-/nummer-element
gebonden worden. Een lostpointercapture van dat kind bubbelt naar de knop.
De vorige handler annuleerde dan ook de wisselsleep die juist naar die knop
werd overgedragen. Dit is een touch-specifiek risico dat de muiscontrole miste.

Het volledige naamblok is nu één pointerdoel: kinderen van naamknop en greep
hebben pointer-events:none. Een verlies van capture annuleert alleen bij het
eigen actieve pointer-ID, als de eigenaar daadwerkelijk capture verliest;
overdracht van een kind of naar de eigenaar is geen annulering. Touch/pen
gebruiken de primaire pointer, zonder afhankelijkheid van de mouse-buttoncode.
Extra vingers kunnen het lopende gebaar niet overnemen.

touch-action:none staat op de naamknop net als op de greep. Verticale bewegingen
blijven via de bestaande MobileScroll-handler lopen; horizontale bewegingen
claimen de wissel. De beschermde runtime is niet aangepast. De 3px lift,
oorspronkelijke afmetingen, het vastpakpunt en expliciete drop blijven behouden.

233 unit-/backendtests, TypeScript/build en 28 runtimehashes slagen. De nieuwe
capturetest dekt de kind→eigenaar-overdracht, geldige capture bij de eigenaar,
werkelijk verlies, een ander pointer-ID en een reeds afgesloten gebaar.
Geen fysieke iPhone/Safari-verificatie: de oorzaak is uit pointercode en de
gebruikersmelding afgeleid; de uiteindelijke fysieke aanraaktest blijft nodig.
Geen Apps Script-update of wijziging aan Google-brongegevens.
