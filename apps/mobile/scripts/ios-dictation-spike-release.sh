#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

UPLOAD=0
if [[ "${1:-}" == "--upload" ]]; then
  UPLOAD=1
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--upload]" >&2
  exit 1
fi

export BB_MOBILE_VARIANT=dictation-spike
export EAS_PROJECT_ID="${EAS_PROJECT_ID:-a6586611-fa47-43b6-b2be-51faac776272}"
export EXPO_NO_CAPABILITY_SYNC="${EXPO_NO_CAPABILITY_SYNC:-1}"

pnpm exec eas build \
  --profile dictation-spike-installable \
  --platform ios \
  --local \
  --non-interactive

IPA="$(ls -t "$ROOT"/build-*.ipa 2>/dev/null | head -1)"
if [[ -z "$IPA" ]]; then
  echo "No build-*.ipa found in $ROOT" >&2
  exit 1
fi

install_on_connected_iphone() {
  local device="${IOS_DEVICE:-}"
  if [[ -z "$device" ]]; then
    device="$(
      python3 - <<'PY'
import json, subprocess, sys
raw = subprocess.check_output(
    [
        "xcrun",
        "devicectl",
        "list",
        "devices",
        "--json-output",
        "-",
        "--omit-deprecated-fields-in-json",
    ],
    text=True,
)
phones = []
for device in json.loads(raw)["result"]["devices"]:
    props = device.get("properties") or {}
    hardware = props.get("hardware") or {}
    state = props.get("state") or {}
    if hardware.get("reality") != "physical":
        continue
    if state.get("bootState") != "booted":
        continue
    phones.append(
        (
            hardware.get("udid") or device["identifier"],
            state.get("name") or hardware.get("marketingName") or "iPhone",
        )
    )
if len(phones) == 1:
    print(phones[0][0])
    raise SystemExit(0)
label = "No booted iPhone is connected." if not phones else "More than one iPhone is connected."
print(label, file=sys.stderr)
for udid, name in phones:
    print(f"  {name}  {udid}", file=sys.stderr)
raise SystemExit(2)
PY
    )" || {
      echo "Built $IPA" >&2
      echo "Install it with:" >&2
      echo "  IOS_DEVICE=\"<name or UDID>\" xcrun devicectl device install app --device \"\$IOS_DEVICE\" \"$IPA\"" >&2
      return 0
    }
  fi
  echo "Installing $IPA on $device"
  xcrun devicectl device install app --device "$device" "$IPA"
}

install_on_connected_iphone

if [[ "$UPLOAD" == "1" ]]; then
  pnpm exec eas upload -p ios --build-path "$IPA" --non-interactive
fi

echo "Publish JS-only follow-ups with:"
echo "  BB_MOBILE_VARIANT=dictation-spike EAS_PROJECT_ID=$EAS_PROJECT_ID pnpm exec eas update --channel dictation-spike --message \"<notes>\""