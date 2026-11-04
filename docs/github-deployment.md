# CoachMate via GitHub

## Wat gereedstaat

- `.github/workflows/check.yml`: bij push/PR automatisch repositorycontrole, unit/backendtests, runtimecontrole via build en offline deploymenttests. De gebouwde frontend is zeven dagen beschikbaar als Actions-artifact. Dit is een downloadbaar bouwartefact, geen online testomgeving.
- `.github/workflows/deploy.yml`: uitsluitend handmatig, vanuit de standaardbranch, met een bestaande releasetag (`v42`) en bevestiging `DEPLOY`. De tag moet in de geschiedenis van de standaardbranch zitten; tests draaien opnieuw op exact die commit.
- Productie gebruikt tijdelijke GitHub OIDC-credentials via Google Workload Identity Federation. Geen Google-servicesleutel in repository of GitHub Secrets.
- Docker bouwt/pusht in GitHub naar de bestaande Artifact Registry. Cloud Run krijgt de image-digest en behoudt URL, runtime-account, instellingen en secretverwijzingen. Eerst revisie zonder verkeer, dan gezondheidscontrole, verkeersomzetting en HTTP-controle. Bij een mislukte HTTP-controle wordt de vorige revisie teruggezet.
- Actions bewaart een releaserecord met tag/commit/digest/revisie en `rollback.sh`. Gewone pushes rollen nooit uit.
- `.gitignore` sluit lokale credentials, herstelbestanden, exports, gegenereerde pakketten en logs uit. Er wordt geen wedstrijddata naar GitHub gekopieerd.

## Koppeling ingericht op 4 november 2026

De bestaande repository is `amving/coachMate`, standaardbranch `main`, repository-ID `1193512205`, eigenaar-ID `271487963`. De V41-app en workflows zijn gepusht. GitHub Actions-run `41917898958` op commit `4f40525` is geslaagd nadat build vóór de tests is geplaatst: de packagingtest heeft gebouwde bestanden nodig.

Na expliciete goedkeuring is het gecontroleerde installatiescript uitgevoerd via Cloud Shell. Provider `projects/496317493719/locations/global/workloadIdentityPools/coachmate-github/providers/github-production` is actief. De repository-variabelen `GCP_WIF_PROVIDER` en `GCP_DEPLOY_SERVICE_ACCOUNT` zijn opgeslagen en gecontroleerd. Het deploymentaccount is `coachmate-github-deploy@coachmate-f4c7a.iam.gserviceaccount.com` en heeft de hieronder beschreven resourcegebonden rechten.

Er is nog geen productie-uitrol vanuit GitHub uitgevoerd en geen GitHub OIDC-aanmelding in een echte deploymentrun geverifieerd. Bij afronding van deze inrichting stond Cloud Run nog op `coachmate-00032-nub` met 100% verkeer. Een geslaagde checks-run of de voorbeeldsamenvatting uit offline deploymenttests is geen productie-uitrol.

## Eenmalige Google Cloud-configuratie

`deploy/setup-github-identity.sh OWNER/REPO REPOSITORY_ID OWNER_ID DEFAULT_BRANCH` is het beheerdersscript voor de eenmalige inrichting. Het is met de hierboven gecontroleerde ID's en expliciete toestemming uitgevoerd. Voer het niet opnieuw uit voor deze bestaande provider; inspecteer de bestaande configuratie bij onderhoud.

Het script maakt een aparte deployment-serviceaccount en een WIF-provider. De trust is beperkt tot die numerieke repository/eigenaar, standaardbranch, handmatige workflow en exact `.github/workflows/deploy.yml`. Rechten: Cloud Run Developer op uitsluitend `coachmate`, Artifact Registry Writer op de bestaande image-repository en Service Account User op uitsluitend het bestaande runtime-account. Geen Owner/Editor, geen toegang tot Sheets en geen Secret Manager-leesrecht voor GitHub.

Het script voert alleen uit met `APPROVE_GITHUB_IDENTITY=YES`. Het verandert geen bestaande provider; bij een bestaande provider eerst inspecteren en gecontroleerd verdergaan. Het maakt geen servicesleutel.

Stel daarna deze twee **Actions repository variables** in met de door het script teruggegeven waarden:

- `GCP_WIF_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`

Er wordt niet automatisch een GitHub environment aangemaakt. Vereiste reviewers voor private repositories hangen af van het GitHub-abonnement. De handmatige workflowbevestiging blijft daarom de basis voor deze inrichting; aanvullende branch-/environmentbescherming kan na controle van het abonnement worden ingesteld.

## Een release uitvoeren

1. Review/merge de PR. Laat `CoachMate checks` slagen.
2. Maak een vaste tag op die gecontroleerde commit, bijvoorbeeld `v42`. De eerste release via deze route moet de workflows en deploymentscripts bevatten.
3. Open Actions → CoachMate production → Run workflow op de standaardbranch. Vul de releasetag in en bevestig met `DEPLOY`.
4. Controleer de workflow en de app na uitrol. De workflow toont commit/revisie en bewaart het deployment-artifact met terugzetopdracht.

De workflow vereist alleen Actions read toegang tot de broncode plus OIDC in de deploymentjob. PR's krijgen geen Google-identiteit. De rollback zet alleen de applicatierevisie terug, niet de gedeelde Google-data. Apps Script blijft een afzonderlijk beheerd onderdeel en wordt niet automatisch uitgerold.

Een online testomgeving vraagt om een aparte service, testgegevens en passende OAuth-callbacks. Gebruik nooit ongemerkt de productie-Sheet voor tests.

## Bronnen

- https://github.com/google-github-actions/auth
- https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines
- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
