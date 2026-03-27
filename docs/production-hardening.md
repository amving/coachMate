# Productiehardening

## Concreet Firebase-datamodel

### Prive coach-data

- `seasons/{seasonId}`
  - `id`
  - `name`
  - `startDate`
  - `endDate`
  - `accentColor`
  - `playerIds[]`
  - `createdAt`

- `players/{playerId}`
  - `id`
  - `firstName`
  - `lastName`
  - `jerseyNumber`
  - `parentName`
  - `parentPhone`
  - `createdAt`

- `matches/{matchId}`
  - `id`
  - `seasonId`
  - `opponentName`
  - `location`
  - `kickoffAt`
  - `durationMinutes`
  - `status`
  - `attendance`
  - `playerIds[]`
  - `goalkeeperSlots[]`
  - `goalkeeperPlanMode`
  - `clock`
  - `shifts[]`
  - `goals[]`
  - `notes`
  - `shareMode`
  - `lastWrite`
  - `createdAt`

- `invites/{inviteId}`
  - `id`
  - `matchId`
  - `seasonId`
  - `playerId`
  - `token`
  - `createdAt`
  - `lastOpenedAt`

### Publieke ouderprojectie

- `parentViews/{token}`
  - `token`
  - `inviteId`
  - `matchId`
  - `seasonId`
  - `seasonName`
  - `playerId`
  - `playerName`
  - `opponentName`
  - `location`
  - `kickoffAt`
  - `durationMinutes`
  - `status`
  - `scoreFor`
  - `scoreAgainst`
  - `clock`
  - `goalkeeperPlanMode`
  - `goalkeeperSlots[]` met `playerName`
  - `players[]` met alleen noodzakelijke live velden
  - `goals[]` met `scorerName` en `actorLabel`
  - `shifts[]` met `playerName` en `actorLabel`
  - `notes`
  - `lastWrite`
  - `updatedAt`

## Waarom deze split

- Coach-app leest en schrijft alleen prive collecties.
- Ouder-webapp leest alleen `parentViews/{token}`.
- Ouder-mutaties lopen via `parentAction`, zodat de browser geen directe schrijfrechten meer nodig heeft op `matches`.
- Firestore-regels kunnen daardoor veel strakker.

## Deploy-volgorde

1. Maak een Firebase-project aan.
2. Zet Firestore, Hosting, Functions en Auth aan.
3. Maak in Firebase Auth minstens een coach-account aan met e-mail en wachtwoord.
4. Vul alle waarden in `.env` voor Expo en Vite.
5. Zet `EXPO_PUBLIC_PARENT_WEB_URL` op je toekomstige Hosting-URL.
6. Zet `VITE_PARENT_ACTION_API_URL` op je Functions-URL.
7. Run `npm install`.
8. Run `npm run build:functions`.
9. Deploy eerst Firestore rules en indexes.
10. Deploy daarna Functions.
11. Deploy daarna de parent-webapp naar Hosting.
12. Start de Expo app en log in met het coach-account.
13. Maak een seizoen, spelers en een wedstrijd aan.
14. Controleer of `invites/{inviteId}` en `parentViews/{token}` worden gevuld.
15. Test een gedeelde ouderlink op een telefoon.

## Aanbevolen vervolghardening

- Sla niet het ruwe token op in `invites`, maar alleen een hash plus prefix.
- Voeg rate limiting toe op `parentAction`.
- Voeg inputvalidatie toe per action payload.
- Voeg App Check toe voor coach-app en ouder-webapp.
- Overweeg audit logging in een aparte `activityLogs` collectie.
- Verplaats coachwrites op termijn ook naar server-side functies als je volledige policy-centralisatie wilt.
