#!/usr/bin/env bash
# One-time administrator setup. Inspect and explicitly approve before running.
set -euo pipefail
PROJECT=coachmate-f4c7a
REGION=europe-west1
SERVICE=coachmate
REPOSITORY="${1:-}"
REPOSITORY_ID="${2:-}"
OWNER_ID="${3:-}"
BRANCH="${4:-main}"
[[ "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ && "$REPOSITORY_ID" =~ ^[0-9]+$ && "$OWNER_ID" =~ ^[0-9]+$ && "$BRANCH" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo 'Usage: bash deploy/setup-github-identity.sh OWNER/REPO REPOSITORY_ID OWNER_ID [DEFAULT_BRANCH]' >&2; exit 1; }
[[ "${APPROVE_GITHUB_IDENTITY:-}" == YES ]] || { echo 'Review this script and set APPROVE_GITHUB_IDENTITY=YES to authorize these IAM grants.' >&2; exit 1; }
ACCOUNT=coachmate-github-deploy
SA="$ACCOUNT@$PROJECT.iam.gserviceaccount.com"
POOL=coachmate-github
PROVIDER=github-production
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
[[ "$NUMBER" =~ ^[0-9]+$ ]] || exit 1
RUNTIME_SA="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')"
IMAGE="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(spec.template.spec.containers[0].image)')"
[[ "$RUNTIME_SA" == *".gserviceaccount.com" && "$IMAGE" == europe-west1-docker.pkg.dev/coachmate-f4c7a/*/* ]] || { echo 'Unexpected existing runtime account or image.' >&2; exit 1; }
ARTIFACT_REPO="${IMAGE#europe-west1-docker.pkg.dev/coachmate-f4c7a/}"; ARTIFACT_REPO="${ARTIFACT_REPO%%/*}"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project="$PROJECT"
if ! gcloud iam service-accounts describe "$SA" --project="$PROJECT" >/dev/null 2>&1; then gcloud iam service-accounts create "$ACCOUNT" --display-name='CoachMate GitHub deployment' --project="$PROJECT"; fi
if ! gcloud iam workload-identity-pools describe "$POOL" --location=global --project="$PROJECT" >/dev/null 2>&1; then gcloud iam workload-identity-pools create "$POOL" --location=global --display-name='CoachMate GitHub' --project="$PROJECT"; fi
CONDITION="assertion.repository_id == '$REPOSITORY_ID' && assertion.repository_owner_id == '$OWNER_ID' && assertion.ref == 'refs/heads/$BRANCH' && assertion.event_name == 'workflow_dispatch' && assertion.workflow_ref == '$REPOSITORY/.github/workflows/deploy.yml@refs/heads/$BRANCH'"
if gcloud iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool="$POOL" --location=global --project="$PROJECT" >/dev/null 2>&1; then
 echo 'Provider already exists. Inspect its mapping and condition; this script will not overwrite existing trust.' >&2; exit 1
fi
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --workload-identity-pool="$POOL" --location=global --project="$PROJECT" --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' --attribute-condition="$CONDITION"
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/$REPOSITORY_ID"
gcloud run services add-iam-policy-binding "$SERVICE" --project="$PROJECT" --region="$REGION" --member="serviceAccount:$SA" --role=roles/run.developer
gcloud artifacts repositories add-iam-policy-binding "$ARTIFACT_REPO" --project="$PROJECT" --location="$REGION" --member="serviceAccount:$SA" --role=roles/artifactregistry.writer
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --project="$PROJECT" --member="serviceAccount:$SA" --role=roles/iam.serviceAccountUser
printf '\nSet these GitHub Actions repository variables (not secrets):\nGCP_WIF_PROVIDER=projects/%s/locations/global/workloadIdentityPools/%s/providers/%s\nGCP_DEPLOY_SERVICE_ACCOUNT=%s\n' "$NUMBER" "$POOL" "$PROVIDER" "$SA"
