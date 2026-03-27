# CoachMate

CoachMate is opgezet als een monorepo met:

- een Expo React Native coach-app voor iPhone in `apps/coach-app`
- een mobiele React webapp voor ouders in `apps/parent-web`
- Firebase Functions in `apps/firebase-functions`
- gedeelde domeinlogica in `packages/shared`

## Wat deze versie afdekt

- seizoenen beheren en spelers aan een seizoen koppelen
- wedstrijden per seizoen aanmaken
- per speler een unieke invite-link opslaan in Firestore
- ouder-webpagina zonder login op `/invite/:token`
- realtime synchronisatie via een publieke read-only `parentViews/{token}` projectie
- ouderacties via een server-side `parentAction` function in plaats van directe Firestore-writes
- automatische keepersplanning op basis van aanwezige spelers
- cumulatieve statistieken per seizoen of over alle seizoenen
- laatste schrijfactie wint bij gelijktijdige wijzigingen
- coach-login via Firebase Auth, zodat Firestore-regels niet meer open hoeven te staan

## Structuur

- `apps/coach-app`: Expo app voor de coach
- `apps/parent-web`: Vite webapp voor ouders
- `apps/firebase-functions`: Cloud Functions voor ouderacties en sync van parent views
- `packages/shared`: gedeelde types, formattering, statistieken en keeperslogica
- `firebase.json`: Hosting, Functions en Firestore-configuratie
- `firestore.rules`: productiegerichte regels voor coach-data en publieke parent views
- `docs/production-hardening.md`: concreet datamodel en deploy-volgorde

## Omgevingsvariabelen

Kopieer `.env.example` naar een lokale env-file en vul alle Firebase-waarden in.

- Coach-app gebruikt `EXPO_PUBLIC_*`
- Webapp gebruikt `VITE_*`
- `EXPO_PUBLIC_PARENT_WEB_URL` moet wijzen naar je Firebase Hosting domein, bijvoorbeeld `https://jouw-project.web.app`
- `VITE_PARENT_ACTION_API_URL` moet wijzen naar de gedeployde `parentAction` function

## Ontwikkelstappen

1. Installeer Node.js en npm op de machine.
2. Voer in de root `npm install` uit.
3. Maak in Firebase Auth een coach-account aan met e-mail en wachtwoord.
4. Start de coach-app met `npm run dev:app`.
5. Start de ouder-webapp met `npm run dev:web`.
6. Build de functions met `npm run build:functions`.
7. Deploy daarna Functions, Firestore rules en Hosting via je Firebase CLI workflow.

## Firestore datamodel

- `seasons/{seasonId}`
- `players/{playerId}`
- `matches/{matchId}`
- `invites/{inviteId}`
- `parentViews/{token}`

Invites zijn per speler en wedstrijd uniek. De ouder-webapp leest niet meer direct uit `invites` of `matches`, maar uit `parentViews/{token}`. Die projecties worden door Functions opgebouwd op basis van coach-data.

## Belangrijke notitie

Deze versie is een stuk dichter bij productie: coach-data vereist Firebase Auth, ouderwrites lopen server-side en de publieke ouderlink leest alleen een gesanitiseerde projectie. Een volgende echte securitystap zou token-hashing, rate limiting en App Check zijn.

## Beperkingen van deze omgeving

Op deze Windows-machine zijn Node.js, npm en Expo niet aanwezig. Daardoor kon ik de code wel opzetten en handmatig nalopen, maar niet lokaal installeren, typechecken of draaien.
