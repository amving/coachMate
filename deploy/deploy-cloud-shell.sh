#!/usr/bin/env bash
# Uitvoeren vanuit het uitgepakte CoachMate-uploadpakket in Google Cloud Shell.
set -euo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

PROJECT="coachmate-f4c7a"
REGION="europe-west1"
SERVICE="coachmate"
for tool in gcloud python3 curl sha256sum; do
  command -v "$tool" >/dev/null || { echo "Ontbrekend programma: $tool. Gebruik Google Cloud Shell." >&2; exit 1; }
done
for file in Dockerfile package-lock.json SHA256SUMS; do
  test -f "$file" || { echo "Onvolledig pakket: $file ontbreekt." >&2; exit 1; }
done
echo "Pakket controleren..."
sha256sum --check --quiet SHA256SUMS
temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT

# Alleen lokale tijdelijke metadata; nooit configuratiewaarden of geheimen loggen.
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$temp_dir/service.json"
python3 - "$temp_dir/service.json" > "$temp_dir/target" <<'PY'
import json, re, sys
service = json.load(open(sys.argv[1], encoding='utf-8'))
containers = service['spec']['template']['spec']['containers']
if len(containers) != 1:
    sys.exit('Dit pakket verwacht de bestaande service met een container.')
container = containers[0]
env = {item['name']: item for item in container.get('env', [])}
required = ['APP_ORIGIN', 'API_ORIGIN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_SPREADSHEET_ID', 'COACH_EMAILS']
if any(not env.get(name, {}).get('value') and not env.get(name, {}).get('valueFrom') for name in required):
    sys.exit('Bestaande Google-configuratie is onvolledig. Er zijn nog geen wijzigingen uitgevoerd.')
origin = env['APP_ORIGIN'].get('value', '')
if not re.fullmatch(r'https://[A-Za-z0-9.-]+', origin) or env['API_ORIGIN'].get('value') != origin:
    sys.exit('APP_ORIGIN en API_ORIGIN moeten hetzelfde bestaande HTTPS-adres bevatten.')
traffic = [item for item in service.get('status', {}).get('traffic', []) if item.get('percent', 0) > 0]
if len(traffic) != 1 or traffic[0].get('percent') != 100 or not traffic[0].get('revisionName'):
    sys.exit('Verwacht een bestaande revisie met 100% verkeer. Eerst de verkeersverdeling controleren.')
image = container['image'].split('@')[0]
image = re.sub(r':[^/]+$', '', image)
if not re.fullmatch(r'(?:[a-z0-9-]+-docker\.pkg\.dev|(?:[a-z0-9-]+\.)?gcr\.io)/coachmate-f4c7a/[A-Za-z0-9_./-]+', image):
    sys.exit('Bestaande image staat niet in een ondersteunde repository van coachmate-f4c7a.')
print(image)
print(origin)
print(traffic[0]['revisionName'])
PY
mapfile -t target < "$temp_dir/target"
IMAGE="${target[0]}:upload-$(date -u +%Y%m%d-%H%M%S)-${RANDOM}"
APP_URL="${target[1]}"
PREVIOUS_REVISION="${target[2]}"
printf 'Project: %s\nService: %s (%s)\nVorige revisie: %s\n' "$PROJECT" "$SERVICE" "$REGION" "$PREVIOUS_REVISION"

# Bewaar een concrete terugzetopdracht voordat er iets wordt veranderd.
printf 'gcloud run services update-traffic %q --project=%q --region=%q --to-revisions=%q\n' \
  "$SERVICE" "$PROJECT" "$REGION" "$PREVIOUS_REVISION=100" > rollback-cloud-shell.sh
echo "Image bouwen in de bestaande repository..."
gcloud builds submit . --project="$PROJECT" --region="$REGION" --ignore-file=.gcloudignore --tag="$IMAGE" --timeout=1200s

echo "Nieuwe revisie starten; het verkeer blijft voorlopig op de vorige revisie."
gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --image="$IMAGE" --concurrency=1 --max-instances=1 --no-traffic --tag=deployment-check --quiet
# services update does not consistently return a Service object for --format.
# Read the completed service separately instead of parsing its operation output.
NEW_REVISION="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --format='value(status.latestCreatedRevisionName)')"
if [[ ! "$NEW_REVISION" =~ ^coachmate-[a-z0-9-]+$ || "$NEW_REVISION" == "$PREVIOUS_REVISION" ]]; then
  echo "Geen nieuwe gereedstaande revisie gevonden. Verkeer is niet omgezet." >&2
  exit 1
fi
gcloud run revisions describe "$NEW_REVISION" --project="$PROJECT" --region="$REGION" --format=json > "$temp_dir/revision.json"
python3 - "$temp_dir/revision.json" <<'PY'
import json, sys
revision = json.load(open(sys.argv[1], encoding='utf-8'))
conditions = {row['type']: row.get('status') for row in revision.get('status', {}).get('conditions', [])}
if any(conditions.get(key) != 'True' for key in ['Ready', 'Active', 'ContainerHealthy']):
    sys.exit('Nieuwe revisie is nog niet actief en gezond. Productieverkeer blijft ongewijzigd.')
PY
gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" --to-revisions="$NEW_REVISION=100" --quiet

check_release() {
  curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 10 --max-time 20 \
    "$APP_URL/" > "$temp_dir/index.html" || return 1
  curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 10 --max-time 20 \
    "$APP_URL/api/session" > "$temp_dir/session.json" || return 1
  python3 - "$temp_dir/index.html" "$temp_dir/session.json" <<'PY'
import json, sys
html = open(sys.argv[1], encoding='utf-8').read()
session = json.load(open(sys.argv[2], encoding='utf-8'))
if 'id="root"' not in html or '/assets/' not in html or session.get('configured') is not True:
    sys.exit('Frontend of Google-configuratie is niet gereed.')
PY
}
if ! check_release; then
  echo "Controle mislukt. Vorige revisie wordt teruggezet." >&2
  bash rollback-cloud-shell.sh
  exit 1
fi
gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" --remove-tags=deployment-check --quiet
printf '\nGereed: %s\nActieve revisie: %s\nTerugzetten: bash rollback-cloud-shell.sh\n' "$APP_URL" "$NEW_REVISION"
echo "Controleer nu Google-login, je team en Beschikbaarheid in de app."
