# Screenshots

Les screenshots de l'app vont dans ce dossier (`docs/screenshots/`). Conventions de nommage :

| Nom de fichier | Contenu attendu |
|---|---|
| `01-splash.png` | Écran de démarrage avec logo |
| `02-onboarding.png` | Slides de bienvenue / sélection de langue |
| `03-menu.png` | Menu principal de l'app |
| `04-game.png` | Une partie en cours (gameplay typique) |
| `05-scores.png` | Tableau des scores / résultats de fin de partie |
| `06-settings.png` | Écran paramètres |
| `07-ar.png` | Mode RTL Arabe (layout inversé) |
| `08-dark.png` | Mode sombre |

## Capture depuis téléphone Android (USB)

```powershell
# Brancher le tél, USB debugging activé
adb devices  # vérifier connexion

# Capture d'écran simple
adb exec-out screencap -p > docs/screenshots/01-splash.png

# Avec timestamp pour batch
$ts = Get-Date -Format "HHmmss"
adb exec-out screencap -p > docs/screenshots/raw-$ts.png

# Vidéo d'écran (max 3 min)
adb shell screenrecord /sdcard/demo.mp4
# Ctrl+C pour arrêter
adb pull /sdcard/demo.mp4 docs/demo.mp4
```

## Capture depuis émulateur

Bouton "Take Screenshot" dans la barre latérale de l'émulateur, ou :

```powershell
adb -s emulator-5554 exec-out screencap -p > docs/screenshots/01-splash.png
```

## Capture depuis iOS Simulator

```bash
# macOS uniquement
xcrun simctl io booted screenshot docs/screenshots/01-splash.png
```

## Sur appareil iOS physique

Bouton **Volume haut + Power** simultanément → AirDrop vers Mac → renommer.

## Recommandations Play Store

Pour soumettre l'app :
- **Phone screenshots** : 16:9 ou 9:16, min 320 px côté court, max 3840 px
- 2 à 8 screenshots par taille d'écran
- Texte localisé en surimpression (utiliser Figma / Photoshop)

## Génération automatique via E2E

Avec **Detox** (E2E framework), on peut scripter la capture des screenshots :

```javascript
// e2e/screenshots.test.ts
describe('Screenshots', () => {
  it('captures splash', async () => {
    await device.takeScreenshot('01-splash');
  });
  it('captures menu after onboarding', async () => {
    await element(by.id('btn-skip-onboarding')).tap();
    await device.takeScreenshot('03-menu');
  });
});
```

À documenter au cas par cas selon les écrans de l'app.
