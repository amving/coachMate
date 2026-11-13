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

Op 13 november 2026 is V43 succesvol via GitHub CLI uitgerold: [run 43404365303](https://github.com/amving/coachMate/actions/runs/43404365303), commit `d9b13bad18d0e05ba69981920b1d26b12ee3d993`, revisie `coachmate-00036-dod`. De vorige revisie was `coachmate-00032-nub`. Build, tests, OIDC-aanmelding, image-upload en productiecontroles slaagden. De openbare app gaf HTTP 200 en Google-configuratie was aanwezig; een persoonlijke Google-login/teamselectie is daarbij niet opnieuw getest. Releaserecord en rollback zijn als deployment-artifact bewaard. Controleer de actuele toestand vóór iedere volgende uitrol.

## Eenmalige Google Cloud-configuratie

`deploy/setup-github-identity.sh OWNER/REPO REPOSITORY_ID OWNER_ID DEFAULT_BRANCH` is het beheerdersscript voor de eenmalige inrichting. Het is met de hierboven gecontroleerde ID's en expliciete toestemming uitgevoerd. Voer het niet opnieuw uit voor deze bestaande provider; inspecteer de bestaande configuratie bij onderhoud.

Het script maakt een aparte deployment-serviceaccount en een WIF-provider. De trust is beperkt tot die numerieke repository/eigenaar, standaardbranch, handmatige workflow en exact `.github/workflows/deploy.yml`. Rechten: Cloud Run Developer op uitsluitend `coachmate`, Artifact Registry Writer op de bestaande image-repository en Service Account User op uitsluitend het bestaande runtime-account. Geen Owner/Editor, geen toegang tot Sheets en geen Secret Manager-leesrecht voor GitHub.

Het script voert alleen uit met `APPROVE_GITHUB_IDENTITY=YES`. Het verandert geen bestaande provider; bij een bestaande provider eerst inspecteren en gecontroleerd verdergaan. Het maakt geen servicesleutel.

Stel daarna deze twee **Actions repository variables** in met de door het script teruggegeven waarden:

- `GCP_WIF_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`

Er wordt niet automatisch een GitHub environment aangemaakt. Vereiste reviewers voor private repositories hangen af van het GitHub-abonnement. De handmatige workflowbevestiging blijft daarom de basis voor deze inrichting; aanvullende branch-/environmentbescherming kan na controle van het abonnement worden ingesteld.

## Een release uitvoeren

Gebruik voortaan Git en GitHub CLI; handmatige uploads en browserbediening vervallen. GitHub Desktop kan de gebruiker daarnaast gebruiken om diffs en geschiedenis te bekijken. GitHub CLI is als `amving` aangemeld met opslag in de Windows-keyring. Toon geen tokens. Na een nieuwe terminalstart is `gh` beschikbaar via gebruikers-PATH; een al draaiend proces kan nog het volledige pad onder `%LOCALAPPDATA%/Programs/GitHubCLI/2.104.0/bin/gh.exe` nodig hebben.

1. Begin vanaf bijgewerkte `main` en maak één branch per wijziging, bijvoorbeeld `codex/beschikbaarheid-fix`. Behoud andermans lokale wijzigingen. Bekijk de diff, voer `node scripts/check-repository.mjs`, `npm run build` en de relevante tests uit. Voor de volledige testsuite moet de build al bestaan.
2. Stage alleen bedoelde bestanden, commit met een beschrijving van het resultaat en push de branch. Maak de PR via `gh pr create --body-file <bestand>` met probleem, wijziging en validatie. Exports, logs, credentials en wedstrijddata blijven lokaal.
3. Volg CI via `gh pr checks <nummer> --watch`. Controleer dat het resultaat bij de actuele PR-commit hoort. Na review/akkoord en geslaagde checks: merge via `gh pr merge <nummer> --squash --match-head-commit <gecontroleerde-PR-SHA>`. Branchbescherming is een afzonderlijke repository-instelling; deze afspraken vormen op zichzelf geen technische bescherming.
4. Werk lokale `main` bij met `git pull --ff-only`. Controleer de checks op de resulterende main-commit via `gh run list --workflow check.yml --commit <SHA>`. Maak een nieuwe vaste tag, bijvoorbeeld `git tag -a v44 <SHA> -m "CoachMate V44: ..."`, en push uitsluitend die tag. Tags worden nooit verplaatst of met force overschreven. Een nieuwe poging met dezelfde code gebruikt dezelfde tag; alleen gewijzigde code krijgt een nieuwe versie.
5. Start uitsluitend na expliciet release-akkoord de bestaande productie-workflow:

   ```sh
   gh workflow run deploy.yml --repo amving/coachMate --ref main -f release=v44 -f confirmation=DEPLOY
   ```

   Gebruik de door GitHub teruggegeven run-ID. Als de CLI alleen bevestigt dat de workflow gestart is, zoek de juiste nieuwe `workflow_dispatch`-run op aan de hand van starttijd/branch/commit; neem niet blind de laatste run van een ander proces.
6. Volg precies die run met `gh run watch <run-ID> --repo amving/coachMate --interval 15 --exit-status`. Bij fouten: `gh run view <run-ID> --repo amving/coachMate --log-failed`. Herstart nooit blind en zet geen beveiligings- of gezondheidscontrole uit.
7. Download `deployment-<tag>-<run-ID>` met `gh run download <run-ID> --name deployment-<tag>-<run-ID> --dir outputs/deployment-<tag>-<run-ID>`. Vergelijk `release.json` met de aangevraagde tag/commit en controleer `rollback.sh`. Controleer de openbare app en `/api/session` zonder geheime waarden te loggen. Rapporteer pas daarna dat de release live staat, met runlink en revisie. Test een persoonlijke sessie afzonderlijk indien nodig.

Een commit of merge is geen uitrol. Nieuwe wijzigingen mogen samen in een volgende release worden gebundeld; niet elke commit krijgt een nieuw V-nummer. In de chat is het normale ritme: wijziging aanvragen → PR en geslaagde checks bekijken → akkoord op merge/release → CLI-uitrol en controle. Eén expliciet verzoek voor een concrete release geldt als akkoord voor die uitrol en hoeft niet opnieuw bevestigd te worden.

De workflow vereist alleen Actions read toegang tot de broncode plus OIDC in de deploymentjob. PR's krijgen geen Google-identiteit. De rollback zet alleen de applicatierevisie terug, niet de gedeelde Google-data. Apps Script blijft een afzonderlijk beheerd onderdeel en wordt niet automatisch uitgerold.

Een online testomgeving vraagt om een aparte service, testgegevens en passende OAuth-callbacks. Gebruik nooit ongemerkt de productie-Sheet voor tests.

## Bronnen

- https://github.com/google-github-actions/auth
- https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines
- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
