#!/usr/bin/env bash
# Self-host the two typefaces instead of loading them from Google's CDN.
#
# Run this, then in weekform/templates/index.html replace the two <link> tags
# pointing at fonts.googleapis.com with:
#
#   <link rel="stylesheet" href="{{ url_for('static', filename='css/fonts.css') }}">
#
# Both faces are SIL Open Font License, so redistributing them is fine.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p static/fonts

UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64)'   # asks Google for woff2
BASE='https://fonts.googleapis.com/css2'

fetch() {
  local family="$1" out="$2"
  curl -sf -A "$UA" "${BASE}?family=${family}&display=swap" \
    | grep -oE 'https://[^)]+\.woff2' | sort -u | while read -r url; do
        curl -sfL "$url" -o "static/fonts/$(basename "$url")"
      done
  echo "fetched ${out}"
}

fetch 'Space+Grotesk:wght@400;500;700' 'Space Grotesk'
fetch 'Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700' 'Bricolage Grotesque'

echo
echo "Downloaded into static/fonts:"
ls -1 static/fonts
echo
echo "Now write @font-face rules into static/css/fonts.css pointing at these"
echo "files, and swap the CDN links in index.html for that stylesheet."
