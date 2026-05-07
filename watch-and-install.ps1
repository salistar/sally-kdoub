# watch-and-install.ps1
#
# Demon : surveille GitHub Actions et installe l'APK automatiquement
# des qu'un build reussit.
#
# Lance UNE FOIS et oublie. A chaque git push :
#   1. GitHub Actions build l'APK (~10 min)
#   2. Ce watcher detecte le nouveau run reussi
#   3. Download l'APK + install sur le tel + lance l'app
#   4. Toast Windows "App installee !"
#
# Pre-requis :
#   - gh CLI authentifie (gh auth login)
#   - Tel branche en USB + debugging autorise
#
# Usage :
#   .\watch-and-install.ps1                    # poll toutes les 30s
#   .\watch-and-install.ps1 -Interval 60       # custom interval
#   .\watch-and-install.ps1 -Once              # juste verifie une fois et stop

param(
  [int]$Interval = 30,
  [switch]$Once = $false,
  [switch]$NoToast = $false
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stateFile = Join-Path $repoRoot ".gh-watch-state"

$appJsonPath = Join-Path $repoRoot "app.json"
$appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
$pkg = $appJson.expo.android.package
$appName = $appJson.expo.name

# ---- Toast helper ---------------------------------------------------------
function Show-Toast {
  param([string]$Title, [string]$Message, [string]$Icon = "Info")
  if ($NoToast) { return }
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
    $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $textNodes = $template.GetElementsByTagName("text")
    $textNodes.Item(0).AppendChild($template.CreateTextNode($Title)) | Out-Null
    $textNodes.Item(1).AppendChild($template.CreateTextNode($Message)) | Out-Null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("SallyCards").Show($toast)
  } catch {
    # Fallback : balloon notification
    Add-Type -AssemblyName System.Windows.Forms
    $balloon = New-Object System.Windows.Forms.NotifyIcon
    $balloon.Icon = [System.Drawing.SystemIcons]::Information
    $balloon.BalloonTipTitle = $Title
    $balloon.BalloonTipText = $Message
    $balloon.Visible = $true
    $balloon.ShowBalloonTip(5000)
    Start-Sleep -Seconds 6
    $balloon.Dispose()
  }
}

# ---- Helpers --------------------------------------------------------------
function Get-LastRunId {
  $runs = & gh run list --workflow=android-build.yml --status=success --limit=1 --json databaseId,headSha,createdAt 2>$null | ConvertFrom-Json
  if ($runs -and $runs.Count -gt 0) { return $runs[0] }
  return $null
}

function Install-Apk {
  param([string]$RunId, [string]$Sha)

  Write-Host ""
  Write-Host "==> Nouveau build detecte : run #$RunId (commit $Sha)" -ForegroundColor Green

  # Verifie tel branche
  $devices = & adb devices 2>&1 | Where-Object { $_ -match "device$" -and $_ -notmatch "List of" }
  if (-not $devices) {
    Write-Host "  Tel non branche. Saut de l'install." -ForegroundColor Yellow
    Show-Toast "Tel non branche" "Build #$RunId pret mais aucun tel detecte" "Warning"
    return $false
  }
  $deviceId = ($devices -split "\s+")[0]
  Write-Host "  Tel : $deviceId" -ForegroundColor Gray

  # Download
  $dlDir = Join-Path $repoRoot ".gh-artifacts"
  if (Test-Path $dlDir) { Remove-Item -Recurse -Force $dlDir }
  New-Item -ItemType Directory -Force -Path $dlDir | Out-Null

  # ---- Download (foreground, simple, fiable) -------------------------
  $ghCmd = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $ghCmd) {
    Write-Host "  FAIL : gh CLI introuvable. winget install GitHub.cli" -ForegroundColor Red
    return $false
  }
  $ghPath = $ghCmd.Source

  # Detecte le repo
  $repoSlug = & $ghPath repo view --json nameWithOwner -q .nameWithOwner 2>$null
  if (-not $repoSlug) {
    Write-Host "  FAIL : impossible de detecter le repo. Verifier 'git remote -v'" -ForegroundColor Red
    return $false
  }
  Write-Host "  Repo : $repoSlug" -ForegroundColor Gray

  $maxRetries = 3
  $apk = $null
  for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
    if ($attempt -gt 1) {
      Write-Host "  Retry $attempt/$maxRetries..." -ForegroundColor Yellow
      Start-Sleep -Seconds 3
      Remove-Item -Recurse -Force $dlDir -ErrorAction SilentlyContinue
      New-Item -ItemType Directory -Force -Path $dlDir | Out-Null
    }

    Write-Host "  Telechargement (peut prendre 30-90s)..." -ForegroundColor Gray
    $start = Get-Date

    # Execution directe en foreground - gh affiche son propre progress
    & $ghPath run download $RunId --dir $dlDir --repo $repoSlug 2>&1 | ForEach-Object {
      Write-Host "    $_" -ForegroundColor DarkGray
    }
    $exitCode = $LASTEXITCODE
    $elapsed = ((Get-Date) - $start).TotalSeconds

    # Verifie qu'on a bien recu l'APK
    $apk = Get-ChildItem -Path $dlDir -Filter "app-debug.apk" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($apk) {
      $sz = $apk.Length / 1MB
      Write-Host ("  OK APK : {0:N2} MB en {1:N1}s" -f $sz, $elapsed) -ForegroundColor Green
      break
    }

    Write-Host "  Echec tentative $attempt (exit $exitCode, $($elapsed.ToString('N1'))s)" -ForegroundColor Yellow
  }

  if (-not $apk) {
    Write-Host "  FAIL : impossible de telecharger apres $maxRetries tentatives" -ForegroundColor Red
    Show-Toast "Download echoue" "Build #$RunId : reseau ou auth ?" "Warning"
    return $false
  }

  # ---- Install (foreground simple) -----------------------------------
  Write-Host "  Installation sur $deviceId (10-30s)..." -ForegroundColor Gray
  & adb -s $deviceId uninstall $pkg 2>&1 | Out-Null

  $installStart = Get-Date
  $out = & adb -s $deviceId install -r $apk.FullName 2>&1
  $installElapsed = ((Get-Date) - $installStart).TotalSeconds

  if ($out -notmatch "Success") {
    Write-Host "  FAIL install :" -ForegroundColor Red
    $out | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    return $false
  }
  Write-Host ("  Install OK en {0:N1}s" -f $installElapsed) -ForegroundColor Green

  # Lance
  & adb -s $deviceId shell am start -n "$pkg/.MainActivity" 2>&1 | Out-Null

  # Cleanup
  Remove-Item -Recurse -Force $dlDir -ErrorAction SilentlyContinue

  Write-Host "  ✓ App installee + lancee sur $deviceId" -ForegroundColor Green
  Show-Toast "$appName installee !" "Build #$RunId deploye sur $deviceId"
  return $true
}

# ---- Main loop ------------------------------------------------------------
Write-Host ""
Write-Host "=== Watcher SallyCards ===" -ForegroundColor Cyan
Write-Host "App      : $appName ($pkg)" -ForegroundColor Gray
Write-Host "Interval : $Interval s" -ForegroundColor Gray
Write-Host "Mode     : $(if ($Once) { 'one-shot' } else { 'daemon (Ctrl+C pour stop)' })" -ForegroundColor Gray
Write-Host ""

# Lit le dernier run installe (depuis state file)
$lastInstalled = if (Test-Path $stateFile) { Get-Content $stateFile -Raw } else { "" }
$lastInstalled = $lastInstalled.Trim()

# Premier check : recupere le run actuel sans installer (sauf si state file vide)
$current = Get-LastRunId
if (-not $current) {
  Write-Host "Aucun run reussi trouve. Lance un build d'abord (push sur main)." -ForegroundColor Yellow
  exit 1
}

if (-not $lastInstalled) {
  # Premier lancement : installe le run actuel
  Write-Host "Premier lancement - install du run actuel..." -ForegroundColor Yellow
  if (Install-Apk -RunId $current.databaseId -Sha $current.headSha.Substring(0, 7)) {
    $current.databaseId | Set-Content $stateFile -NoNewline
  }
} else {
  Write-Host "Dernier run installe : $lastInstalled" -ForegroundColor Gray
  if ([string]$current.databaseId -ne $lastInstalled) {
    Write-Host "Run plus recent dispo - install..." -ForegroundColor Yellow
    if (Install-Apk -RunId $current.databaseId -Sha $current.headSha.Substring(0, 7)) {
      $current.databaseId | Set-Content $stateFile -NoNewline
      $lastInstalled = "$($current.databaseId)"
    }
  } else {
    Write-Host "Deja a jour. En attente d'un nouveau build..." -ForegroundColor Gray
  }
}

if ($Once) { exit 0 }

# Loop
while ($true) {
  Start-Sleep -Seconds $Interval
  try {
    $current = Get-LastRunId
    if ($current -and ([string]$current.databaseId -ne $lastInstalled)) {
      $sha = $current.headSha.Substring(0, 7)
      if (Install-Apk -RunId $current.databaseId -Sha $sha) {
        $current.databaseId | Set-Content $stateFile -NoNewline
        $lastInstalled = "$($current.databaseId)"
      }
    } else {
      $now = Get-Date -Format "HH:mm:ss"
      Write-Host "[$now] pas de nouveau build" -ForegroundColor DarkGray
    }
  } catch {
    Write-Host "Erreur poll : $_" -ForegroundColor Red
  }
}
