# Déploiement local — guide exhaustif

> Les 5 méthodes pour faire tourner l'app en dev/test, des plus rapides aux plus complètes.

## Méthode 1 — Expo Go (le + rapide, 30 secondes)

```powershell
git clone https://github.com/salistar/sally-kdoub.git
cd sally-kdoub
npm install
npx expo start
```

Scanner le QR-code avec **Expo Go** (Android Play Store / iOS App Store).

**Limitations** :
- ❌ Modules natifs custom (WebRTC) → erreur "Native module not found"
- ❌ AdMob, RevenueCat (modules natifs)
- ✅ Tout le code JS, expo-camera, expo-localization, expo-router, etc.

**Logs attendus** :
```
Starting Metro Bundler
› Metro waiting on exp://192.168.1.42:8081
› Web is waiting on http://localhost:8081

› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web
› Press r │ reload app
› Press m │ toggle menu
```

## Méthode 2 — Development Build (Expo Dev Client)

Pour les modules natifs absents d'Expo Go.

```powershell
# 1) Génère android/ et ios/
npx expo prebuild --platform all --clean

# 2) Compile + installe + lance Metro
npx expo run:android
# ou
npx expo run:ios
```

**Première fois** : ~10 min pour compiler. Ensuite : ~30 sec hot-reload.

**Logs Android** :
```
✔ Cleared android code
✔ Created native directory
✔ Updated package.json

> Configure project :app
> Task :app:installDebug
Installing APK 'app-debug.apk' on 'R83L20HWJTE'
Installed on 1 device.

› Bundling app/_layout.tsx
› Building app
› Opening on R83L20HWJTE
› App started
```

## Méthode 3 — APK debug embarqué (production-like, sans Metro)

Pour tester l'app exactement comme en prod (bundle JS embedded).

Voir README principal section "Build APK Android". Récap :

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.15.6-hotspot"

# Bundle JS dans l'APK
npx expo export:embed `
  --platform android --dev false `
  --entry-file node_modules\expo-router\entry.js `
  --bundle-output android\app\src\main\assets\index.android.bundle `
  --assets-dest android\app\src\main\res `
  --reset-cache

# Compile APK
cd android
.\gradlew assembleDebug --no-daemon

# Install + launch + logs
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n com.sallycards.kdoub/.MainActivity
adb logcat -c ; adb logcat *:E ReactNativeJS:V
```

## Méthode 4 — Émulateur Android

```powershell
# Lister les AVD disponibles
emulator -list-avds

# Si vide, créer via Android Studio → AVD Manager
# Ou en CLI :
avdmanager create avd -n Pixel_7 -k "system-images;android-34;google_apis;x86_64"

# Lancer (sans snapshot pour clean state)
emulator -avd Pixel_7 -no-snapshot-load -netdelay none -netspeed full

# Quand booté (5-10 sec) :
adb devices    # → emulator-5554 device
npx expo run:android
```

## Méthode 5 — Web preview (limité)

```powershell
npx expo start --web
```

**Limitations sévères** :
- ❌ WebRTC ne marche pas pareil
- ❌ AdMob ne marche pas
- ❌ AsyncStorage utilise localStorage (pas de chiffrement)
- ✅ Utile pour vite valider l'UI / la navigation

## Variables d'environnement utiles

| Variable | Valeur | Effet |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.42:3000` | Override l'URL backend en dev |
| `EXPO_PUBLIC_TURN_URL` | `turn:turn.salistar.com:3478` | Override TURN serveur |
| `EXPO_NO_TELEMETRY` | `1` | Désactive tracking Expo |
| `EXPO_DEBUG` | `1` | Logs verbeux |

```powershell
$env:EXPO_PUBLIC_API_URL = "http://192.168.1.42:3000"
npx expo start --clear
```

## Backend local (API + DB + TURN)

L'app a besoin du backend. Lancer en local depuis le monorepo SallyCards :

```powershell
cd C:\Users\$env:USERNAME\Desktop\sdk52\SallyCards
docker compose up -d sallycards-mongo sallycards-redis sallycards-api sallycards-turn

# Vérifier
curl http://localhost:3000/health     # API
curl http://localhost:3478            # TURN (timeout normal sur HTTP)
```

Puis dans l'app, configurer `.env.local` :
```
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000     # 10.0.2.2 = host depuis émulateur Android
EXPO_PUBLIC_API_URL=http://localhost:3000    # iOS simulator
EXPO_PUBLIC_API_URL=http://192.168.1.42:3000 # Téléphone physique sur le même WiFi
```

## Inspecteur React Native

Pendant `expo start` ou `expo run:android`, presser **m** dans le terminal puis **j** sur l'app pour ouvrir le debugger Chrome.

Ou : utiliser **React Native Devtools** (Flipper successor) — ouvre automatiquement avec `expo start`.

## Logs avancés

```powershell
# Logcat filtré niveau erreur uniquement
adb logcat *:E ReactNativeJS:V

# Logcat sur un seul package (filtre par PID)
$pid = (adb shell ps | Select-String "com.sallycards.kdoub").ToString().Split()[1]
adb logcat --pid=$pid

# Logcat persistent dans un fichier
adb logcat -d > logs/$(Get-Date -Format yyyy-MM-dd-HHmm).log

# Effacer les logs avant test
adb logcat -c

# Crash report Android (tombstones)
adb shell ls /data/tombstones/
adb shell cat /data/tombstones/tombstone_00
```

## Profilage performance

```powershell
# Hermes profiler (Android)
adb shell setprop persist.profiler.signpost true
# Reload l'app, jouer, puis :
adb pull /data/local/tmp/profile.cpuprofile

# Charge dans chrome://inspect
```
