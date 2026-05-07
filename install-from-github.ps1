# install-from-github.ps1
#
# Telecharge l'APK du dernier run reussi sur GitHub Actions
# et l'installe automatiquement sur le tel USB.
#
# Pre-requis :
#   - gh CLI installe et authentifie : gh auth login
#   - Le tel branche en USB + debugging autorise
#
# Usage :
#   .\install-from-github.ps1                # dernier run reussi sur main
#   .\install-from-github.ps1 -Run 12345     # run specifique par ID
#   .\install-from-github.ps1 -KeepZip       # garde le zip apres install

param(
  [string]$Run = "latest",
  [switch]$KeepZip = $false,
  [switch]$NoLaunch = $false,
  [switch]$NoLogcat = $false
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Lit metadata pour connaitre le package
$appJsonPath = Join-Path $repoRoot "app.json"
$appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
$pkg = $appJson.expo.android.package
$appName = $appJson.expo.name
Write-Host "==> App: $appName ($pkg)" -ForegroundColor Cyan

# ---- Step 1 : verifie outils -----------------------------------------------
Write-Host ""
Write-Host "[1/6] Verification outils..." -ForegroundColor Yellow

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
  Write-Host "  gh CLI absent. Installation : winget install GitHub.cli" -ForegroundColor Red
  Write-Host "  Puis : gh auth login" -ForegroundColor Red
  exit 1
}

$ghAuth = & gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "  gh non authentifie. Lance : gh auth login" -ForegroundColor Red
  exit 1
}

$adb = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adb) {
  Write-Host "  adb absent. Verifie ANDROID_HOME et PATH." -ForegroundColor Red
  exit 1
}
Write-Host "  OK gh + adb" -ForegroundColor Green

# ---- Step 2 : verifie tel USB ---------------------------------------------
Write-Host ""
Write-Host "[2/6] Verification tel USB..." -ForegroundColor Yellow
$adbList = & adb devices 2>&1
$deviceLine = $adbList | Where-Object { $_ -match "device$" -and $_ -notmatch "List of" }
if (-not $deviceLine) {
  Write-Host "  Aucun tel autorise. Branche le tel + USB debugging + Allow popup." -ForegroundColor Red
  $adbList | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
  exit 1
}
$deviceId = ($deviceLine -split "\s+")[0]
Write-Host "  OK device : $deviceId" -ForegroundColor Green

# ---- Step 3 : trouver le run -----------------------------------------------
Write-Host ""
Write-Host "[3/6] Recherche du dernier run reussi..." -ForegroundColor Yellow

if ($Run -eq "latest") {
  $runs = & gh run list --workflow=android-build.yml --status=success --limit=1 --json databaseId,headSha,conclusion,createdAt | ConvertFrom-Json
  if (-not $runs -or $runs.Count -eq 0) {
    Write-Host "  Aucun run reussi trouve. Verifie l'onglet Actions sur GitHub." -ForegroundColor Red
    exit 1
  }
  $runId = $runs[0].databaseId
  $sha = $runs[0].headSha.Substring(0, 7)
  Write-Host "  Run #$runId (commit $sha) du $($runs[0].createdAt)" -ForegroundColor Green
} else {
  $runId = $Run
  Write-Host "  Run #$runId (specifie)" -ForegroundColor Green
}

# ---- Step 4 : download artifact --------------------------------------------
Write-Host ""
Write-Host "[4/6] Telechargement de l'APK..." -ForegroundColor Yellow
$dlDir = Join-Path $repoRoot ".gh-artifacts"
if (Test-Path $dlDir) { Remove-Item -Recurse -Force $dlDir }
New-Item -ItemType Directory -Force -Path $dlDir | Out-Null

& gh run download $runId --dir $dlDir 2>&1 | ForEach-Object {
  if ($_ -match "downloaded|complete|Downloading") { Write-Host "  $_" -ForegroundColor Gray }
}

if ($LASTEXITCODE -ne 0) {
  Write-Host "  FAIL telechargement. Le run a peut-etre expire (>14 jours)." -ForegroundColor Red
  exit 1
}

# Trouve l'APK dans le dossier telecharge
$apkFile = Get-ChildItem -Path $dlDir -Filter "app-debug.apk" -Recurse | Select-Object -First 1
if (-not $apkFile) {
  Write-Host "  FAIL : app-debug.apk introuvable dans $dlDir" -ForegroundColor Red
  Write-Host "  Contenu :" -ForegroundColor Gray
  Get-ChildItem -Path $dlDir -Recurse | ForEach-Object { Write-Host "    $($_.FullName)" -ForegroundColor Gray }
  exit 1
}
$sz = $apkFile.Length / 1MB
Write-Host ("  OK APK telecharge : {0:N2} MB" -f $sz) -ForegroundColor Green

# ---- Step 5 : install -----------------------------------------------------
Write-Host ""
Write-Host "[5/6] Installation sur $deviceId..." -ForegroundColor Yellow

# Uninstall ancien (silencieux)
& adb -s $deviceId uninstall $pkg 2>&1 | Out-Null

# Install
$installOut = & adb -s $deviceId install -r $apkFile.FullName 2>&1
if ($installOut -match "Success") {
  Write-Host "  OK installe" -ForegroundColor Green
} else {
  Write-Host "  FAIL install :" -ForegroundColor Red
  $installOut | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
  exit 1
}

# Cleanup
if (-not $KeepZip) {
  Remove-Item -Recurse -Force $dlDir -ErrorAction SilentlyContinue
}

# ---- Step 6 : lance + logcat -----------------------------------------------
if (-not $NoLaunch) {
  Write-Host ""
  Write-Host "[6/6] Lancement de l'app..." -ForegroundColor Yellow
  & adb -s $deviceId shell am start -n "$pkg/.MainActivity" 2>&1 | Out-Null
  Write-Host "  OK lance" -ForegroundColor Green
}

if (-not $NoLogcat) {
  Write-Host ""
  Write-Host "==> Logs (Ctrl+C pour quitter) :" -ForegroundColor Cyan
  & adb -s $deviceId logcat -c
  & adb -s $deviceId logcat *:E ReactNativeJS:V ReactNative:V *:F
} else {
  Write-Host ""
  Write-Host "==> Termine. App installee et lancee sur $deviceId" -ForegroundColor Green
  Write-Host "Pour voir les logs : adb -s $deviceId logcat *:E ReactNativeJS:V" -ForegroundColor Gray
}
