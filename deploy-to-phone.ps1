# deploy-to-phone.ps1
# Pipeline local : un seul script -> APK signe + installe + lance sur le tel USB
#
# Reproduit EXACTEMENT la sequence qui a fonctionne pour Solitaire :
#   1. Verifie device USB
#   2. subst Y: pour contourner MAX_PATH 260 chars Windows
#   3. JAVA_HOME -> Microsoft OpenJDK 17
#   4. Kill processus java/node bloquant (Defender/Gradle locks)
#   5. Cleanup React 19 RC parasite dans jest-expo
#   6. newArchEnabled: false dans app.json (Bridgeless desactive)
#   7. expo prebuild si android/ absent
#   8. npm install si node_modules absent
#   9. expo install expo-linking si manquant
#   10. Bundle JS embarque (--reset-cache)
#   11. gradlew assembleDebug --no-daemon
#   12. adb uninstall (silencieux si pas installe)
#   13. adb install -r
#   14. adb shell am start
#   15. adb logcat tail
#
# Usage :
#   .\deploy-to-phone.ps1                 # full pipeline
#   .\deploy-to-phone.ps1 -SkipBuild      # skip rebuild (re-installe APK existante)
#   .\deploy-to-phone.ps1 -SkipBundle     # skip bundle JS (build APK seul)
#   .\deploy-to-phone.ps1 -NoLogcat       # ne lance pas adb logcat a la fin

param(
  [switch]$SkipBuild = $false,
  [switch]$SkipBundle = $false,
  [switch]$NoLogcat = $false,
  [switch]$Clean = $false
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---- Lit metadata depuis app.json --------------------------------------
$appJsonPath = Join-Path $repoRoot "app.json"
if (-not (Test-Path $appJsonPath)) {
  Write-Host "ERREUR : app.json introuvable a $appJsonPath" -ForegroundColor Red
  exit 1
}
$appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
$appName = $appJson.expo.name
$pkg = $appJson.expo.android.package
Write-Host "==> App: $appName ($pkg)" -ForegroundColor Cyan

# ---- Step 1 : verifie device USB -----------------------------------------
Write-Host ""
Write-Host "[1/15] Verification device USB..." -ForegroundColor Yellow
$adbList = & adb devices 2>&1
$deviceLine = $adbList | Where-Object { $_ -match "device$" -and $_ -notmatch "List of" }
if (-not $deviceLine) {
  Write-Host "  Aucun device autorise. Branche le tel + USB debugging + Allow popup." -ForegroundColor Red
  Write-Host "  Output adb devices :" -ForegroundColor Gray
  $adbList | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
  exit 1
}
$deviceId = ($deviceLine -split "\s+")[0]
Write-Host "  OK device : $deviceId" -ForegroundColor Green

# ---- Step 2 : subst Y: ---------------------------------------------------
Write-Host ""
Write-Host "[2/15] Drive virtuel Y: pour MAX_PATH 260..." -ForegroundColor Yellow
$wantTarget = $repoRoot
$existing = (subst | Where-Object { $_ -match "^Y:" }) -join " "
if ($existing) {
  Write-Host "  Y: deja affecte ($existing) - on garde" -ForegroundColor Gray
} else {
  & subst Y: $wantTarget
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK Y: -> $wantTarget" -ForegroundColor Green
  } else {
    Write-Host "  WARN subst echoue, on continue avec le path original" -ForegroundColor Yellow
  }
}
# bascule cwd sur Y: si dispo
if (Test-Path "Y:\app.json") {
  Set-Location "Y:\"
  $repoRoot = (Get-Location).Path
  Write-Host "  cwd = Y:\" -ForegroundColor Green
} else {
  Set-Location $repoRoot
}

# ---- Step 3 : JAVA_HOME --------------------------------------------------
Write-Host ""
Write-Host "[3/15] Configuration JAVA_HOME..." -ForegroundColor Yellow
$msftJdk = "C:\Program Files\Microsoft\jdk-17.0.15.6-hotspot"
$candidates = @(
  $msftJdk,
  "C:\Program Files\Microsoft\jdk-17.0.13.11-hotspot",
  "C:\Program Files\Java\jdk-17",
  "$env:LOCALAPPDATA\jdk-17"
)
$found = $candidates | Where-Object { Test-Path "$_\bin\java.exe" } | Select-Object -First 1
if ($found) {
  $env:JAVA_HOME = $found
  Write-Host "  OK JAVA_HOME = $found" -ForegroundColor Green
} else {
  Write-Host "  WARN aucun JDK trouve dans les chemins typiques. JAVA_HOME inchange." -ForegroundColor Yellow
}

# ---- Step 4 : kill java/node ---------------------------------------------
Write-Host ""
Write-Host "[4/15] Kill processus java/node (Gradle/Metro locks)..." -ForegroundColor Yellow
Get-Process java, node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "  OK" -ForegroundColor Green

# ---- Step 5 : cleanup jest-expo React 19 RC ------------------------------
Write-Host ""
Write-Host "[5/15] Cleanup React 19 RC parasite dans jest-expo..." -ForegroundColor Yellow
@("react", "react-dom", "react-server-dom-webpack", "react-test-renderer") | ForEach-Object {
  $p = Join-Path $repoRoot "node_modules\jest-expo\node_modules\$_"
  if (Test-Path $p) {
    Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
    Write-Host "  removed $_" -ForegroundColor Gray
  }
}
$p = Join-Path $repoRoot "node_modules\jest-expo\node_modules\@types\react"
if (Test-Path $p) { Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue }
Write-Host "  OK" -ForegroundColor Green

# ---- Step 6 : newArchEnabled false ---------------------------------------
Write-Host ""
Write-Host "[6/15] Desactive Bridgeless (newArchEnabled: false)..." -ForegroundColor Yellow
$content = Get-Content $appJsonPath -Raw
$newContent = $content -replace '"newArchEnabled":\s*true', '"newArchEnabled": false'
if ($newContent -ne $content) {
  Set-Content $appJsonPath -Value $newContent -NoNewline
  Write-Host "  OK newArchEnabled mis a false" -ForegroundColor Green
} else {
  Write-Host "  deja false ou absent" -ForegroundColor Gray
}

# ---- Step 7 : npm install si node_modules absent -------------------------
Write-Host ""
Write-Host "[7/15] npm install si necessaire..." -ForegroundColor Yellow
if (-not (Test-Path "$repoRoot\node_modules")) {
  Write-Host "  node_modules absent, installation..." -ForegroundColor Gray
  & npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAIL npm install" -ForegroundColor Red
    exit 1
  }
  Write-Host "  OK installe" -ForegroundColor Green
} else {
  Write-Host "  OK node_modules existe" -ForegroundColor Green
}

# ---- Step 8 : expo install expo-linking si manquant ----------------------
Write-Host ""
Write-Host "[8/15] Verification expo-linking..." -ForegroundColor Yellow
if (-not (Test-Path "$repoRoot\node_modules\expo-linking")) {
  Write-Host "  expo-linking absent, installation..." -ForegroundColor Gray
  & npx expo install expo-linking
}
Write-Host "  OK" -ForegroundColor Green

# ---- Step 9 : prebuild Android si android/ absent ou Clean ---------------
Write-Host ""
Write-Host "[9/15] Verification dossier android/..." -ForegroundColor Yellow
$androidDir = Join-Path $repoRoot "android"
if ($Clean -or -not (Test-Path "$androidDir\gradlew")) {
  Write-Host "  Generation android/ via expo prebuild..." -ForegroundColor Gray
  if ($Clean) {
    & npx expo prebuild --platform android --clean --non-interactive
  } else {
    & npx expo prebuild --platform android --non-interactive
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAIL prebuild" -ForegroundColor Red
    exit 1
  }
  Write-Host "  OK android/ genere" -ForegroundColor Green
} else {
  Write-Host "  OK android/ deja present" -ForegroundColor Green
}

# ---- Step 10 : Bundle JS ------------------------------------------------
if (-not $SkipBundle) {
  Write-Host ""
  Write-Host "[10/15] Bundle JS embarque (--reset-cache)..." -ForegroundColor Yellow
  $bundleOut = Join-Path $repoRoot "android\app\src\main\assets\index.android.bundle"
  $assetsOut = Join-Path $repoRoot "android\app\src\main\res"
  Remove-Item -Force $bundleOut -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force "$env:TEMP\metro-*" -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force "$env:TEMP\haste-map-*" -ErrorAction SilentlyContinue

  & npx expo export:embed `
    --platform android `
    --dev false `
    --entry-file node_modules\expo-router\entry.js `
    --bundle-output $bundleOut `
    --assets-dest $assetsOut `
    --reset-cache
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAIL bundle JS" -ForegroundColor Red
    exit 1
  }
  $sz = (Get-Item $bundleOut).Length / 1MB
  Write-Host ("  OK bundle.js {0:N2} MB" -f $sz) -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "[10/15] Bundle JS skipped (-SkipBundle)" -ForegroundColor Gray
}

# ---- Step 11 : gradlew assembleDebug -------------------------------------
$apkPath = Join-Path $repoRoot "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not $SkipBuild) {
  Write-Host ""
  Write-Host "[11/15] Build APK (gradlew assembleDebug --no-daemon)..." -ForegroundColor Yellow
  Write-Host "  ~1-2 min en incremental, ~20 min au premier build (CMake)..." -ForegroundColor Gray
  Push-Location $androidDir
  & .\gradlew assembleDebug --no-daemon
  $gradleExit = $LASTEXITCODE
  Pop-Location
  if ($gradleExit -ne 0) {
    Write-Host "  FAIL gradle build" -ForegroundColor Red
    exit 1
  }
  if (-not (Test-Path $apkPath)) {
    Write-Host "  FAIL APK introuvable a $apkPath" -ForegroundColor Red
    exit 1
  }
  $sz = (Get-Item $apkPath).Length / 1MB
  Write-Host ("  OK APK {0:N2} MB" -f $sz) -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "[11/15] Build skipped (-SkipBuild)" -ForegroundColor Gray
  if (-not (Test-Path $apkPath)) {
    Write-Host "  FAIL APK introuvable - relance sans -SkipBuild" -ForegroundColor Red
    exit 1
  }
}

# ---- Step 12 : adb uninstall ---------------------------------------------
Write-Host ""
Write-Host "[12/15] adb uninstall $pkg..." -ForegroundColor Yellow
& adb -s $deviceId uninstall $pkg 2>&1 | Out-Null
Write-Host "  OK (silencieux)" -ForegroundColor Green

# ---- Step 13 : adb install -----------------------------------------------
Write-Host ""
Write-Host "[13/15] adb install $apkPath..." -ForegroundColor Yellow
$installOut = & adb -s $deviceId install -r $apkPath 2>&1
if ($installOut -match "Success") {
  Write-Host "  OK installe" -ForegroundColor Green
} else {
  Write-Host "  FAIL install :" -ForegroundColor Red
  $installOut | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
  exit 1
}

# ---- Step 14 : adb am start ----------------------------------------------
Write-Host ""
Write-Host "[14/15] Lancement app..." -ForegroundColor Yellow
& adb -s $deviceId shell am start -n "$pkg/.MainActivity" 2>&1 | Out-Null
Write-Host "  OK lance sur $deviceId" -ForegroundColor Green

# ---- Step 15 : logcat ----------------------------------------------------
if (-not $NoLogcat) {
  Write-Host ""
  Write-Host "[15/15] Logcat (Ctrl+C pour quitter)..." -ForegroundColor Yellow
  Write-Host ""
  & adb -s $deviceId logcat -c
  & adb -s $deviceId logcat *:E ReactNativeJS:V ReactNative:V *:F
} else {
  Write-Host ""
  Write-Host "[15/15] Logcat skipped (-NoLogcat)" -ForegroundColor Gray
  Write-Host ""
  Write-Host "Pour voir les logs : adb -s $deviceId logcat *:E ReactNativeJS:V" -ForegroundColor Gray
}

Write-Host ""
Write-Host "==> Pipeline TERMINE - app deployee sur $deviceId" -ForegroundColor Green
