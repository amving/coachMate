#!/usr/bin/env bash
# Called only by the manually approved production workflow. Never reads .env.
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
PROJECT=coachmate-f4c7a
REGION=europe-west1
SERVICE=coachmate
[[ "${GITHUB_ACTIONS:-}" == true && "${RELEASE_SHA:-}" =~ ^[a-f0-9]{40}$ && "${RELEASE_TAG:-}" =~ ^v[1-9][0-9]*$ ]] || { echo 'Missing reviewed GitHub release context.' >&2; exit 1; }
for tool in gcloud docker python3 curl; do command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }; done
temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT
mkdir -p outputs/github-deploy
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$temp_dir/service.json"
python3 - "$temp_dir/service.json" > "$temp_dir/target" <<'PY'
import json,re,sys
s=json.load(open(sys.argv[1])); containers=s['spec']['template']['spec']['containers']
if len(containers)!=1: sys.exit('Expected the existing single-container service.')
env={e['name']:e for e in containers[0].get('env',[])}
for key in ['APP_ORIGIN','API_ORIGIN','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_SPREADSHEET_ID','COACH_EMAILS']:
    if not env.get(key,{}).get('value') and not env.get(key,{}).get('valueFrom'): sys.exit('Existing Google configuration is incomplete.')
origin=env['APP_ORIGIN'].get('value','')
if not re.fullmatch(r'https://[A-Za-z0-9.-]+',origin) or env['API_ORIGIN'].get('value')!=origin: sys.exit('Existing origins do not match.')
traffic=[t for t in s['status']['traffic'] if t.get('percent',0)>0]
if len(traffic)!=1 or traffic[0].get('percent')!=100 or not traffic[0].get('revisionName'): sys.exit('Expected one revision with 100% traffic.')
image=re.sub(r':[^/]+$','',containers[0]['image'].split('@')[0])
if not re.fullmatch(r'europe-west1-docker\.pkg\.dev/coachmate-f4c7a/[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+',image): sys.exit('Unexpected Artifact Registry image repository.')
print(image);print(origin);print(traffic[0]['revisionName'])
PY
mapfile -t target < "$temp_dir/target"
IMAGE="${target[0]}:git-${RELEASE_SHA}"
APP_URL="${target[1]}"
PREVIOUS_REVISION="${target[2]}"
printf 'gcloud run services update-traffic %q --project=%q --region=%q --to-revisions=%q\n' "$SERVICE" "$PROJECT" "$REGION" "$PREVIOUS_REVISION=100" > outputs/github-deploy/rollback.sh
gcloud auth configure-docker europe-west1-docker.pkg.dev --quiet
docker build --label "org.opencontainers.image.revision=$RELEASE_SHA" --label "org.opencontainers.image.version=$RELEASE_TAG" --tag "$IMAGE" .
docker push "$IMAGE"
DIGEST="$(docker image inspect --format '{{index .RepoDigests 0}}' "$IMAGE")"
[[ "$DIGEST" == "${target[0]}@sha256:"* && "${DIGEST##*@sha256:}" =~ ^[a-f0-9]{64}$ ]] || { echo 'No verified pushed image digest.' >&2; exit 1; }
# A zero-traffic revision needs a tag to stay addressable and undergo startup checks.
gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" --image="$DIGEST" --no-traffic --tag=deployment-check --quiet
NEW_REVISION="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.latestCreatedRevisionName)')"
[[ "$NEW_REVISION" =~ ^coachmate-[a-z0-9-]+$ && "$NEW_REVISION" != "$PREVIOUS_REVISION" ]] || { echo 'No new revision; production was not switched.' >&2; exit 1; }
gcloud run revisions describe "$NEW_REVISION" --project="$PROJECT" --region="$REGION" --format=json > "$temp_dir/revision.json"
python3 - "$temp_dir/revision.json" <<'PY'
import json,sys
conditions={c['type']:c.get('status') for c in json.load(open(sys.argv[1])).get('status',{}).get('conditions',[])}
if any(conditions.get(k)!='True' for k in ['Ready','Active','ContainerHealthy']): sys.exit('Revision is not healthy; production was not switched.')
PY
# Recheck traffic immediately before promotion to detect an intervening manual deployment.
CURRENT_REVISION="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.traffic[0].revisionName)')"
[[ "$CURRENT_REVISION" == "$PREVIOUS_REVISION" ]] || { echo 'Production traffic changed during the build; review before promotion.' >&2; exit 1; }
gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" --to-revisions="$NEW_REVISION=100" --quiet
check_release() {
 curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 10 --max-time 20 "$APP_URL/" > "$temp_dir/index.html" || return 1
 curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 10 --max-time 20 "$APP_URL/api/session" > "$temp_dir/session.json" || return 1
 python3 - "$temp_dir/index.html" "$temp_dir/session.json" <<'PY'
import json,sys
html=open(sys.argv[1]).read();session=json.load(open(sys.argv[2]))
if 'id="root"' not in html or '/assets/' not in html or session.get('configured') is not True: sys.exit('Release health check failed.')
PY
}
if ! check_release; then
 echo 'Release check failed; restoring the previous revision.' >&2
 bash outputs/github-deploy/rollback.sh
 exit 1
fi
gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" --remove-tags=deployment-check --quiet
python3 - "$RELEASE_TAG" "$RELEASE_SHA" "$DIGEST" "$PREVIOUS_REVISION" "$NEW_REVISION" "$APP_URL" > outputs/github-deploy/release.json <<'PY'
import json,sys
print(json.dumps(dict(zip(['tag','sha','image','previousRevision','revision','url'],sys.argv[1:])),indent=2))
PY
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
 printf '### CoachMate %s\n\nCommit: `%s`\n\nRevision: `%s`\n\n[Open CoachMate](%s)\n\nRollback command: deployment artifact `rollback.sh`.\n' "$RELEASE_TAG" "$RELEASE_SHA" "$NEW_REVISION" "$APP_URL" >> "$GITHUB_STEP_SUMMARY"
fi
printf 'Deployed %s (%s) to %s\n' "$RELEASE_TAG" "$NEW_REVISION" "$APP_URL"
