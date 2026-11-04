#!/usr/bin/env bash
# Offline test: all Google commands and HTTP requests are replaced by functions.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
source_script="$PWD/deploy-cloud-shell.sh"
test_dir="$(mktemp -d)"
trap 'rm -rf -- "$test_dir"' EXIT
if ! command -v python3 >/dev/null; then
  python3() { python "$@" | tr -d '\r'; }
  export -f python3
fi
gcloud() {
  printf '%s\n' "$*" >> "$FAKE_LOG"
  case "$*" in
    'run services describe '*)
      if [[ "$*" == *'value(status.latestCreatedRevisionName)'* ]]; then
        if [[ "$SCENARIO" == revision-fail ]]; then printf 'coachmate-old\n'; else printf 'coachmate-new\n'; fi
        return
      fi
      if [[ "$SCENARIO" == invalid-config ]]; then printf '{}\n'; return; fi
      cat <<'JSON'
{"spec":{"template":{"spec":{"containers":[{"image":"europe-west1-docker.pkg.dev/coachmate-f4c7a/cloud-run-source-deploy/coachmate@sha256:123","env":[{"name":"APP_ORIGIN","value":"https://coachmate.example"},{"name":"API_ORIGIN","value":"https://coachmate.example"},{"name":"GOOGLE_CLIENT_ID","value":"fake"},{"name":"GOOGLE_CLIENT_SECRET","valueFrom":{"secretKeyRef":{"name":"fake","key":"latest"}}},{"name":"GOOGLE_SPREADSHEET_ID","value":"fake"},{"name":"COACH_EMAILS","value":"coach@example.invalid"}]}]}}},"status":{"traffic":[{"revisionName":"coachmate-old","percent":100}]}}
JSON
      ;;
    'builds submit '*) [[ "$SCENARIO" != build-fail ]] || return 17 ;;
    'run services update-traffic '*) return 0 ;;
    'run services update '*) return 0 ;;
    'run revisions describe '*)
      if [[ "$SCENARIO" == unhealthy-revision ]]; then
        printf '{"status":{"conditions":[{"type":"Ready","status":"False"}]}}\n'
      else
        printf '{"status":{"conditions":[{"type":"Ready","status":"True"},{"type":"Active","status":"True"},{"type":"ContainerHealthy","status":"True"}]}}\n'
      fi ;;
    *) echo "Unexpected fake gcloud call" >&2; return 99 ;;
  esac
}
curl() {
  printf 'curl %s\n' "$*" >> "$FAKE_LOG"
  if [[ "${*: -1}" == */api/session ]]; then
    if [[ "$SCENARIO" == smoke-fail ]]; then printf '{"configured":false}'; else printf '{"configured":true}'; fi
  else
    printf '<div id="root"></div><script src="/assets/fake.js"></script>'
  fi
}
export -f gcloud curl
for SCENARIO in success build-fail invalid-config smoke-fail revision-fail unhealthy-revision corrupt-package; do
  export SCENARIO
  scenario_dir="$test_dir/$SCENARIO"
  mkdir -p "$scenario_dir"
  cp "$source_script" "$scenario_dir/deploy-cloud-shell.sh"
  printf 'test\n' > "$scenario_dir/Dockerfile"
  printf '{}\n' > "$scenario_dir/package-lock.json"
  (cd "$scenario_dir" && sha256sum Dockerfile package-lock.json deploy-cloud-shell.sh > SHA256SUMS)
  if [[ "$SCENARIO" == corrupt-package ]]; then printf 'changed\n' >> "$scenario_dir/Dockerfile"; fi
  export FAKE_LOG="$scenario_dir/calls"
  touch "$FAKE_LOG"
  status=0
  bash "$scenario_dir/deploy-cloud-shell.sh" > "$scenario_dir/result" 2>&1 || status=$?
  if [[ "$SCENARIO" == success ]]; then
    [[ "$status" == 0 ]] || { cat "$scenario_dir/result"; exit 1; }
    grep -q -- '--to-revisions=coachmate-new=100' "$FAKE_LOG"
    grep -q -- '--no-traffic' "$FAKE_LOG"
    grep -q -- '--ignore-file=.gcloudignore' "$FAKE_LOG"
    grep -q -- '--to-revisions=coachmate-old=100' "$scenario_dir/rollback-cloud-shell.sh"
  else
    [[ "$status" != 0 ]] || { echo "Expected failure: $SCENARIO"; exit 1; }
    case "$SCENARIO" in
      build-fail|invalid-config|corrupt-package) ! grep -q 'run services update' "$FAKE_LOG" ;;
      revision-fail|unhealthy-revision) ! grep -q 'run services update-traffic' "$FAKE_LOG" ;;
      smoke-fail) grep -q -- '--to-revisions=coachmate-old=100' "$FAKE_LOG" ;;
    esac
  fi
  ! grep -Eq -- '--set-env-vars|--set-secrets|--allow-unauthenticated|add-iam|services enable' "$FAKE_LOG"
  echo "PASS: $SCENARIO"
done
