#!/usr/bin/env bash
# Local one-time setup: the private certificate and Apple API key never leave
# the maintainer's Mac except via encrypted GitHub Actions secret uploads.
set -euo pipefail
set +x
umask 077

repo=memolabs-dev/drop
identity='Developer ID Application: Guillaume Flambard (Q52VN4UT34)'
expected_fingerprint=C49C57BEC261852ED317722BAA1C5532C4F737C5

for command in gh openssl xcrun security jq; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required program: $command" >&2
    exit 1
  fi
done
gh auth status >/dev/null
if ! security find-identity -v -p codesigning | grep -Fq "$identity"; then
  echo 'The Apple Developer ID identity is not available in your login Keychain.' >&2
  exit 1
fi

echo 'Before starting, export only the Developer ID Application identity (with private key)'
echo 'from macOS Keychain Access as a password-protected .p12 file.'
echo 'Generate and download an APP STORE CONNECT TEAM API key (not an individual key).'
echo 'Apple offers each API private key only once. Do not put these files in this repository.'
read -r -p 'Full path to exported Developer ID .p12 file: ' p12_path
read -r -p 'Full path to downloaded AuthKey_<KeyID>.p8 file: ' api_path
if [[ ! -f "$p12_path" || ! -f "$api_path" ]]; then
  echo 'Cannot find one of the two private files.' >&2
  exit 1
fi
read -r -p 'Apple Team API Issuer ID: ' api_issuer
read -r -p 'Apple Team API Key ID: ' api_id
if [[ ! "$api_issuer" =~ ^[a-fA-F0-9-]{36}$ || ! "$api_id" =~ ^[A-Za-z0-9]{10}$ ]]; then
  echo 'Invalid Issuer ID or Key ID.' >&2
  exit 1
fi
read -r -s -p 'Password chosen when exporting the .p12: ' p12_password
printf '\n'

# Verify the specific certificate, not just that the archive is parseable.
fingerprint="$(
  APPLE_P12_PASSWORD="$p12_password" openssl pkcs12 -in "$p12_path" -clcerts -nokeys \
    -passin env:APPLE_P12_PASSWORD 2>/dev/null |
    openssl x509 -noout -fingerprint -sha1 |
    tr -d ':' | sed 's/.*=//'
)"
if [[ "$fingerprint" != "$expected_fingerprint" ]]; then
  echo 'Exported certificate does not match the known Developer ID certificate on this Mac.' >&2
  exit 1
fi
echo 'Developer ID certificate fingerprint matches the installed Apple identity.'

# A TEAM API key is needed; individual App Store Connect keys cannot notarize.
# Validate against Apple's service before writing any GitHub secrets.
if ! xcrun notarytool history --issuer "$api_issuer" --key-id "$api_id" \
  --key "$api_path" --output-format json >/dev/null; then
  echo 'Apple notarization rejected the API credentials. Check that this is a Team key.' >&2
  exit 1
fi
echo 'Apple notarization authentication succeeded.'

base64 < "$p12_path" | tr -d '\n' | gh secret set APPLE_CERTIFICATE --repo "$repo"
printf '%s' "$p12_password" | gh secret set APPLE_CERTIFICATE_PASSWORD --repo "$repo"
cat "$api_path" | gh secret set APPLE_API_PRIVATE_KEY --repo "$repo"
printf '%s' "$api_issuer" | gh secret set APPLE_API_ISSUER --repo "$repo"
printf '%s' "$api_id" | gh secret set APPLE_API_KEY --repo "$repo"
printf '%s' "$identity" | gh secret set APPLE_SIGNING_IDENTITY --repo "$repo"
unset p12_password
echo 'Apple signing secrets uploaded. Only their names will be displayed:'
gh secret list --repo "$repo" --json name |
  jq -r '.[].name | select(startswith("APPLE_"))'
echo 'Keep the .p12 and .p8 in encrypted, protected storage; do not commit them.'
echo 'Run the preflight from the main branch with:'
echo 'gh workflow run apple-signing-check.yml --repo memolabs-dev/drop --ref main'
