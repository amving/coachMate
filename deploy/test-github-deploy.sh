#!/usr/bin/env bash
# Offline: Docker, Google Cloud and HTTP are replaced by local test functions.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
source_script="$PWD/deploy-github.sh"
test_dir="$(mktemp -d)"
trap 'rm -rf -- "$test_dir"' EXIT
if ! python3 --version >/dev/null 2>&1; then
 python3() { python "$@" | tr -d '\r'; }; export -f python3
fi
gcloud() {
 printf 'gcloud %s\n' "$*" >> "$FAKE_LOG"
 case "$*" in
  'run services describe '*)
   if [[ "$*" == *'value(status.latestCreatedRevisionName)'* ]]; then printf 'coachmate-new\n'; return; fi
   if [[ "$*" == *'value(status.traffic[0].revisionName)'* ]]; then
    if [[ "$SCENARIO" == traffic-change ]]; then printf 'coachmate-other\n'; else printf 'coachmate-old\n'; fi; return
   fi
   if [[ "$SCENARIO" == invalid-config ]]; then printf '{}\n'; return; fi
   printf '%s\n' '{"spec":{"template":{"spec":{"containers":[{"image":"europe-west1-docker.pkg.dev/coachmate-f4c7a/cloud-run-source-deploy/coachmate@sha256:old","env":[{"name":"APP_ORIGIN","value":"https://coachmate.example"},{"name":"API_ORIGIN","value":"https://coachmate.example"},{"name":"GOOGLE_CLIENT_ID","value":"fake"},{"name":"GOOGLE_CLIENT_SECRET","valueFrom":{"secretKeyRef":{"name":"fake","key":"latest"}}},{"name":"GOOGLE_SPREADSHEET_ID","value":"fake"},{"name":"COACH_EMAILS","value":"coach@example.invalid"}]}]}}},"status":{"traffic":[{"revisionName":"coachmate-old","percent":100}]}}'
   ;;
  'run revisions describe '*)
   if [[ "$SCENARIO" == unhealthy ]]; then printf '{"status":{"conditions":[{"type":"Ready","status":"False"}]}}\n'
   elif ! grep -q -- '--no-traffic --tag=deployment-check' "$FAKE_LOG"; then printf '{"status":{"conditions":[{"type":"Ready","status":"True","reason":"Retired"},{"type":"Active","status":"False","reason":"Retired"},{"type":"ContainerReady","status":"True"}]}}\n'
   else printf '{"status":{"conditions":[{"type":"Ready","status":"True"},{"type":"Active","status":"True"},{"type":"ContainerHealthy","status":"True"}]}}\n'; fi ;;
  'auth configure-docker '*|'run services update '*|'run services update-traffic '*) return 0 ;;
  *) echo 'Unexpected gcloud test call' >&2; return 99 ;;
 esac
}
docker() {
 printf 'docker %s\n' "$*" >> "$FAKE_LOG"
 case "$1" in
  build) [[ "$SCENARIO" != build-fail ]] ;;
  push) [[ "$SCENARIO" != push-fail ]] ;;
  image)
   if [[ "$SCENARIO" == wrong-digest ]]; then printf 'unexpected-image\n'
   else printf 'europe-west1-docker.pkg.dev/coachmate-f4c7a/cloud-run-source-deploy/coachmate@sha256:%064d\n' 0; fi ;;
  *) return 99 ;;
 esac
}
curl() {
 printf 'curl %s\n' "$*" >> "$FAKE_LOG"
 if [[ "${*: -1}" == */api/session ]]; then
  if [[ "$SCENARIO" == smoke-fail ]]; then printf '{"configured":false}'; else printf '{"configured":true}'; fi
 else printf '<div id="root"></div><script src="/assets/test.js"></script>'; fi
}
export -f gcloud docker curl
export GITHUB_ACTIONS=true RELEASE_SHA=0123456789abcdef0123456789abcdef01234567 RELEASE_TAG=v42
for SCENARIO in success build-fail push-fail invalid-config wrong-digest unhealthy traffic-change smoke-fail bad-release; do
 export SCENARIO
 dir="$test_dir/$SCENARIO";mkdir -p "$dir/deploy"
 cp "$source_script" "$dir/deploy/deploy-github.sh"
 export FAKE_LOG="$dir/calls";touch "$FAKE_LOG"
 # Offline fixtures must never append a fake deployment to the real Actions summary.
 export GITHUB_STEP_SUMMARY="$dir/summary"
 status=0
 if [[ "$SCENARIO" == bad-release ]]; then RELEASE_TAG='v42;not-a-command' bash "$dir/deploy/deploy-github.sh" > "$dir/result" 2>&1 || status=$?
 else bash "$dir/deploy/deploy-github.sh" > "$dir/result" 2>&1 || status=$?; fi
 if [[ "$SCENARIO" == success ]]; then
  [[ "$status" == 0 ]] || { cat "$dir/result";exit 1; }
  grep -q -- '--no-traffic' "$FAKE_LOG"
  grep -q -- '--tag=deployment-check' "$FAKE_LOG"
  grep -q -- '--remove-tags=deployment-check' "$FAKE_LOG"
  grep -q -- '--to-revisions=coachmate-new=100' "$FAKE_LOG"
  grep -q -- '--to-revisions=coachmate-old=100' "$dir/outputs/github-deploy/rollback.sh"
  grep -q '"tag": "v42"' "$dir/outputs/github-deploy/release.json"
 else
  [[ "$status" != 0 ]] || { echo "Expected failure: $SCENARIO";exit 1; }
  case "$SCENARIO" in
   build-fail|push-fail|invalid-config|wrong-digest|bad-release) ! grep -q 'gcloud run services update ' "$FAKE_LOG" ;;
   unhealthy|traffic-change) ! grep -q 'gcloud run services update-traffic' "$FAKE_LOG" ;;
   smoke-fail) grep -q -- '--to-revisions=coachmate-old=100' "$FAKE_LOG" ;;
  esac
 fi
 ! grep -Eq -- '--set-env-vars|--set-secrets|--allow-unauthenticated|add-iam|services enable|builds submit' "$FAKE_LOG"
 echo "PASS: $SCENARIO"
done
