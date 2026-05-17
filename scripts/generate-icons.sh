#!/usr/bin/env bash
# Regenerate Android app icons + splash screens from the source master.
#
# Run this once after a fresh `npx cap add android` (since android/ is
# gitignored, the generated PNGs don't travel with the repo) or any
# time you swap out resources/icon.png for a new brand mark.
#
# Reads:
#   resources/icon.png    1024x1024 (logo composition with dark bg)
#   resources/splash.png  2732x2732 (logo centred on charcoal canvas)
#
# Writes:
#   android/app/src/main/res/mipmap-*/ic_launcher.png            (5 densities)
#   android/app/src/main/res/mipmap-*/ic_launcher_round.png      (5 densities)
#   android/app/src/main/res/mipmap-*/ic_launcher_foreground.png (5 densities)
#   android/app/src/main/res/drawable[-port|-land]-*/splash.png  (11 files)
#
# Requires ImageMagick `convert` on $PATH (preinstalled on most Linux
# and macOS dev boxes; Windows users: install via Chocolatey or use
# WSL).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RES="$REPO_ROOT/android/app/src/main/res"
ICON="$REPO_ROOT/resources/icon.png"
SPLASH_SRC="$REPO_ROOT/resources/icon.png"  # we re-pad the icon for splash

if [[ ! -f "$ICON" ]]; then
  echo "Missing $ICON — drop a 1024x1024 PNG there and rerun." >&2
  exit 1
fi
if ! command -v convert &>/dev/null; then
  echo "ImageMagick 'convert' not found. Install it and retry." >&2
  exit 1
fi

echo "▸ Generating Android app icons from $ICON"
# Standard launcher + round + adaptive foreground per density.
# Adaptive foreground uses the 108dp-scaled size (108/162/216/324/432)
# while ic_launcher and ic_launcher_round are the canonical mipmap
# sizes (48/72/96/144/192). The same master image fills all three —
# Android applies its own circular / squircle mask at runtime.
for spec in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  d=${spec%%:*}
  rest=${spec#*:}
  std=${rest%%:*}
  fg=${rest##*:}
  convert "$ICON" -resize ${std}x${std} "$RES/mipmap-$d/ic_launcher.png"
  convert "$ICON" -resize ${std}x${std} "$RES/mipmap-$d/ic_launcher_round.png"
  convert "$ICON" -resize ${fg}x${fg}  "$RES/mipmap-$d/ic_launcher_foreground.png"
  echo "   mipmap-$d   ic_launcher=${std} foreground=${fg}"
done

echo "▸ Generating splash screens"
# Splash content size per density (~33% of the shorter screen edge so
# the logo reads at a glance without looking lonely). All variants
# sit on a #0F0F0F charcoal canvas to match the SplashScreen plugin
# backgroundColor in capacitor.config.json. Sizes follow Capacitor's
# legacy splash table (which the @capacitor/splash-screen plugin
# still uses when androidSplashResourceName = "splash").
for spec in "mdpi:320x480:480x320:80" "hdpi:480x800:800x480:140" "xhdpi:720x1280:1280x720:220" "xxhdpi:960x1600:1600x960:300" "xxxhdpi:1280x1920:1920x1280:400"; do
  IFS=':' read -r d port land logo <<< "$spec"
  convert "$SPLASH_SRC" -resize ${logo}x${logo} -gravity center -background "#0F0F0F" -extent $port "$RES/drawable-port-$d/splash.png"
  convert "$SPLASH_SRC" -resize ${logo}x${logo} -gravity center -background "#0F0F0F" -extent $land "$RES/drawable-land-$d/splash.png"
  echo "   drawable-$d port=${port} land=${land}"
done
# Base splash for legacy /drawable lookup
convert "$SPLASH_SRC" -resize 320x320 -gravity center -background "#0F0F0F" -extent 480x320 "$RES/drawable/splash.png"
echo "   drawable/splash.png 480x320"

echo "✓ Done. Run \`npx cap sync android\` then rebuild the APK."
