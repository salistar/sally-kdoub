# SallyCards Kdoub

> Kdoub — jeu de cartes traditionnel marocain (Hassan-style).

[![Build APK](https://github.com/salistar/sally-kdoub/actions/workflows/android-build.yml/badge.svg)](https://github.com/salistar/sally-kdoub/actions/workflows/android-build.yml)
[![Lint & Test](https://github.com/salistar/sally-kdoub/actions/workflows/lint-and-test.yml/badge.svg)](https://github.com/salistar/sally-kdoub/actions/workflows/lint-and-test.yml)

App mobile faisant partie de la suite **SallyCards** — Expo SDK 52, React Native 0.76, Hermes, expo-router.

| | |
|---|---|
| **Bundle ID Android** | `com.sallycards.kdoub` |
| **Bundle ID iOS** | `com.sallycards.kdoub` |
| **Couleur thème** | `#0A1929` |
| **Multijoueur** | Oui (Socket.IO + WebRTC voice) |
| **Backend API** | `https://api.salistar.com` (configurable) |
| **TURN/STUN** | **Requis** pour voice chat ([sally-turn-stun](https://github.com/salistar/sally-turn-stun)) |

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Screenshots](#screenshots)
3. [Architecture & technologies](#architecture--technologies)
4. [Déploiement local — toutes les méthodes](#déploiement-local--toutes-les-méthodes)
5. [Build APK Android (debug + production)](#build-apk-android)
6. [Build iOS (TestFlight)](#build-ios)
7. [Build via EAS (cloud)](#build-via-eas-cloud)
8. [Intégration AdMob](#intégration-admob)
9. [Intégration RevenueCat](#intégration-revenuecat)
10. [CI/CD GitHub Actions](#cicd-github-actions)
11. [Erreurs courantes et fixes](#erreurs-courantes-et-fixes)

---

## Fonctionnalités

- Kdoub classique 2-4 joueurs
- Mode tournoi local (manche à manche, score cumulé)
- Online via Socket.IO + voice chat WebRTC
- IA bots avec stratégies différenciées
- Skin visuel premium (cartes dessinées main)
- 5 langues + RTL

---

## Screenshots

> Les screenshots sont à placer dans `docs/screenshots/`. Voir [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md)
> pour les commandes de capture automatisées (adb / iOS Simulator).

| Splash | Onboarding | Menu principal | Partie en cours |
|---|---|---|---|
| ![](docs/screenshots/01-splash.png) | ![](docs/screenshots/02-onboarding.png) | ![](docs/screenshots/03-menu.png) | ![](docs/screenshots/04-game.png) |

| Tableau scores | Paramètres | RTL Arabe | Mode sombre |
|---|---|---|---|
| ![](docs/screenshots/05-scores.png) | ![](docs/screenshots/06-settings.png) | ![](docs/screenshots/07-ar.png) | ![](docs/screenshots/08-dark.png) |

Capture rapide depuis un téléphone Android branché en USB :

```powershell
adb exec-out screencap -p > docs/screenshots/01-splash.png
```

---

## Architecture & technologies

| Couche | Technologie |
|---|---|
| Runtime mobile | Expo SDK 52 / React Native 0.76 / Hermes |
| Navigation | expo-router v4 (file-based routing) |
| State | React Context + AsyncStorage |
| Réseau | Socket.IO client + REST (fetch) |
| Multijoueur | Socket.IO + react-native-webrtc + TURN/STUN |
| i18n | i18next + react-i18next (FR/EN/ES/AR/Darija) |
| UI | StyleSheet RN + LinearGradient + react-native-reanimated |
| Tests | Jest + jest-expo |
| Build natif | Gradle 8.10.2 + AGP 8.6.0 + Kotlin |
| JDK | Microsoft OpenJDK 17 |

---

## Déploiement local — toutes les méthodes

### Méthode 1 — Expo Go (la + rapide pour développer)

```powershell
git clone https://github.com/salistar/sally-kdoub.git
cd sally-kdoub
npm install
npx expo start
# Scanner le QR-code avec Expo Go (Android / iOS)
```

**Logs attendus** :
```
Starting Metro Bundler
› Metro waiting on exp://192.168.x.x:8081
› Web is waiting on http://localhost:8081
› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web
[!] Le voice WebRTC ne marche PAS dans Expo Go — utiliser Méthode 2 (Dev Build)
```

### Méthode 2 — Development build (Expo Dev Client)

Nécessaire si vous utilisez des modules natifs absents d'Expo Go (WebRTC, etc.).

```powershell
npx expo prebuild --platform android --clean
npx expo run:android
# ou pour iOS :
npx expo run:ios
```

**Logs attendus** :
```
✔ Cleared android code
✔ Created native directory
› Bundling app/_layout.tsx
› Building APK
› Installing on R83L20HWJTE
› App started
```

### Méthode 3 — APK debug standalone (pas de Metro)

C'est la méthode utilisée pour le déploiement réel sur téléphone physique.
Voir [SallyCards-APK-Build-Guide.pdf](https://github.com/salistar/sallycards-monorepo/blob/main/SallyCards-APK-Build-Guide.pdf) au monorepo pour la procédure complète Windows (JAVA_HOME, MAX_PATH, Defender, etc.).

```powershell
# Drive virtuel pour contourner MAX_PATH 260
subst Y: C:\Users\$env:USERNAME\Desktop\sally-kdoub
cd Y:\

# Setup
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.15.6-hotspot"
npm install
npx expo prebuild --platform android --clean

# Cleanup React 19 RC parasitaire (jest-expo)
@("react","react-dom","react-server-dom-webpack","react-test-renderer") | ForEach-Object {
  Remove-Item -Recurse -Force "node_modules\jest-expo\node_modules\$_" -ErrorAction SilentlyContinue
}

# Désactive Bridgeless si problème
(Get-Content app.json -Raw) -replace '"newArchEnabled":\s*true','"newArchEnabled": false' | Set-Content app.json

# Bundle JS embarqué
npx expo export:embed `
  --platform android --dev false `
  --entry-file node_modules\expo-router\entry.js `
  --bundle-output android\app\src\main\assets\index.android.bundle `
  --assets-dest android\app\src\main\res `
  --reset-cache

# Build APK
cd android
.\gradlew assembleDebug --no-daemon

# Install + launch
adb uninstall com.sallycards.kdoub 2>$null
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n com.sallycards.kdoub/.MainActivity

# Logcat
adb logcat -c
adb logcat *:E ReactNativeJS:V ReactNative:V *:F
```

### Méthode 4 — Émulateur Android

```powershell
# Lister les AVD
emulator -list-avds
# Lancer
emulator -avd Pixel_7_API_34 -no-snapshot-load -netdelay none -netspeed full
# Une fois booté :
adb devices    # doit afficher emulator-5554
npx expo run:android
```

### Méthode 5 — iOS Simulator (Mac uniquement)

```bash
xcrun simctl list devices
npx expo run:ios --simulator="iPhone 15"
```

---

## Build APK Android

### Debug local

Voir Méthode 3 ci-dessus. APK sortie : `android/app/build/outputs/apk/debug/app-debug.apk` (~230 MB).

### Production (signed AAB pour Play Store)

```powershell
# 1) Générer une keystore (une seule fois)
keytool -genkeypair -v -storetype PKCS12 `
  -keystore kdoub.keystore -alias kdoub `
  -keyalg RSA -keysize 2048 -validity 10000

# 2) Configurer android/gradle.properties
@"
KDOUB_UPLOAD_STORE_FILE=kdoub.keystore
KDOUB_UPLOAD_KEY_ALIAS=kdoub
KDOUB_UPLOAD_STORE_PASSWORD=<password>
KDOUB_UPLOAD_KEY_PASSWORD=<password>
"@ | Add-Content android\gradle.properties

# 3) Build AAB
cd android
.\gradlew bundleRelease

# Sortie : android/app/build/outputs/bundle/release/app-release.aab
```

---

## Build iOS

iOS nécessite un Mac. Workflow :

```bash
npx expo prebuild --platform ios --clean
cd ios
pod install
cd ..
npx expo run:ios --configuration Release
# ou via Xcode :
open ios/kdoub.xcworkspace
```

Pour TestFlight : utiliser EAS (méthode suivante).

---

## Build via EAS (cloud)

EAS = Expo Application Services. Build sur cloud Expo, signing géré, pas besoin de Mac pour iOS.

```powershell
npm i -g eas-cli
eas login
eas build:configure

# Profile preview (APK pour test interne)
eas build --profile preview --platform android

# Profile production (AAB Play Store + iOS App Store)
eas build --profile production --platform all

# Soumission stores
eas submit --platform android --profile production
eas submit --platform ios --profile production
```

`eas.json` configuré dans le repo :
```json
{
  "build": {
    "preview": { "distribution": "internal", "android": { "buildType": "apk" } },
    "production": {
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" },
      "ios": { "image": "latest" }
    }
  }
}
```

---

## Intégration AdMob

Voir le guide complet : [docs/ADMOB.md](docs/ADMOB.md). Résumé :

```powershell
npx expo install react-native-google-mobile-ads
```

`app.json` :
```json
{
  "plugins": [
    ["react-native-google-mobile-ads", {
      "androidAppId": "ca-app-pub-XXXXXX~YYYYYYYY",
      "iosAppId": "ca-app-pub-XXXXXX~ZZZZZZZZ"
    }]
  ]
}
```

Composant banner (FR + Darija) :
```tsx
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

<BannerAd
  unitId={ __DEV__ ? TestIds.BANNER : 'ca-app-pub-XXX/YYY' }
  size={BannerAdSize.ADAPTIVE_BANNER}
  requestOptions={{ requestNonPersonalizedAdsOnly: true }}
/>
```

Interstitial entre parties + Rewarded pour bonus = même pattern, voir docs.

---

## Intégration RevenueCat

Voir le guide complet : [docs/REVENUECAT.md](docs/REVENUECAT.md). Résumé :

```powershell
npx expo install react-native-purchases
```

Init dans `app/_layout.tsx` :
```tsx
import Purchases from 'react-native-purchases';

useEffect(() => {
  if (Platform.OS === 'android') {
    Purchases.configure({ apiKey: 'goog_XXXXXXXXXX' });
  } else {
    Purchases.configure({ apiKey: 'appl_YYYYYYYYYY' });
  }
}, []);
```

Acheter un produit :
```tsx
const offerings = await Purchases.getOfferings();
const pkg = offerings.current?.availablePackages[0];
const result = await Purchases.purchasePackage(pkg);
if (result.customerInfo.entitlements.active['premium']) {
  // débloque le contenu
}
```

---

## CI/CD GitHub Actions

3 workflows fournis dans `.github/workflows/` :

| Workflow | Déclencheur | Action |
|---|---|---|
| `lint-and-test.yml` | push + PR sur `main` | npm install, lint, jest |
| `android-build.yml` | push sur `main` ou tag `v*` | build APK debug + upload artifact |
| `eas-build.yml` | tag `v*` | EAS build preview + production |

Secrets requis dans GitHub :
- `EXPO_TOKEN` (pour `eas-build.yml`)
- `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (pour signed builds)
- `GOOGLE_SERVICES_JSON_BASE64` (pour Play Store submission)

Documentation détaillée : [docs/LOCAL_DEPLOYMENT.md](docs/LOCAL_DEPLOYMENT.md)

---

## Erreurs courantes et fixes

| Erreur | Cause | Fix |
|---|---|---|
| `JAVA_HOME is set to an invalid directory: Eclipse Adoptium` | Path mort vers Java non installé | Définir `JAVA_HOME` vers Microsoft OpenJDK 17 |
| `CMake Error: Filename longer than 260 characters` | MAX_PATH Windows | `subst Y: <path>` avant build |
| `Could not move temporary workspace` (Gradle) | Defender / OneDrive locks | Exclusions Defender + `--no-daemon` |
| `EBUSY: resource busy or locked, rmdir android/` | Daemon Gradle vivant | `gradlew --stop`, `Stop-Process java,node` |
| `Cannot find native module 'ExpoLinking'` | expo-linking absent | `npx expo install expo-linking` |
| `Unable to load script` | APK debug attend Metro | Bundle embarqué via `expo export:embed` |
| `Cannot read property 'useState' of null` | Deux copies physiques de React | metro.config.js avec `resolveRequest` single-instance |
| `Tried to register two views with same name RNCSafeAreaProvider` | Deux copies de react-native-safe-area-context | Idem, metro.config.js |

Tableau complet dans le [SallyCards-APK-Build-Guide.pdf](https://github.com/salistar/sallycards-monorepo/blob/main/SallyCards-APK-Build-Guide.pdf).

---

## Licence

© 2026 Sally Star Company — tous droits réservés.
