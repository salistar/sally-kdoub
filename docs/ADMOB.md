# Intégration AdMob

> Affichage de publicités Google AdMob dans l'app.
> Repose sur **react-native-google-mobile-ads** (le successeur officiel de @react-native-firebase/admob).

## 1. Comptes & IDs

1. Créer compte Google AdMob → https://apps.admob.com
2. Créer une **app** dans AdMob → noter l'**App ID** :
   - Format : `ca-app-pub-1234567890123456~9876543210` (avec `~`)
3. Créer les **ad units** : Banner, Interstitial, Rewarded → noter chaque **Unit ID** :
   - Format : `ca-app-pub-1234567890123456/1122334455` (avec `/`)

## 2. Installation

```powershell
npx expo install react-native-google-mobile-ads
```

## 3. Configuration `app.json`

```json
{
  "expo": {
    "plugins": [
      [
        "react-native-google-mobile-ads",
        {
          "androidAppId": "ca-app-pub-1234567890123456~9876543210",
          "iosAppId": "ca-app-pub-1234567890123456~5555555555",
          "userTrackingPermission": "Cette app utilise vos données pour afficher des annonces personnalisées."
        }
      ]
    ]
  }
}
```

Puis : `npx expo prebuild --clean` pour régénérer android/ et ios/.

## 4. Banner (en bas d'écran)

```tsx
// src/components/AdBanner.tsx
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { View } from 'react-native';

const UNIT_ID = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : 'ca-app-pub-1234567890123456/1111111111';

export function AdBanner() {
  return (
    <View style={{ alignItems: 'center' }}>
      <BannerAd
        unitId={UNIT_ID}
        size={BannerAdSize.ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
          networkExtras: { collapsible: 'bottom' },
        }}
      />
    </View>
  );
}
```

## 5. Interstitial (entre parties)

```tsx
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';

const UNIT = __DEV__ ? TestIds.INTERSTITIAL : 'ca-app-pub-XXX/YYY_INT';
const ad = InterstitialAd.createForAdRequest(UNIT, {
  requestNonPersonalizedAdsOnly: true,
});

export function useInterstitial() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const u1 = ad.addAdEventListener(AdEventType.LOADED, () => setLoaded(true));
    const u2 = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setLoaded(false);
      ad.load(); // recharge pour la prochaine
    });
    ad.load();
    return () => { u1(); u2(); };
  }, []);

  return {
    show: () => loaded && ad.show(),
    loaded,
  };
}
```

Usage :
```tsx
const { show } = useInterstitial();
// À la fin d'une partie :
onGameEnd: () => {
  show();
  navigation.navigate('Results');
}
```

## 6. Rewarded (récompense in-game)

```tsx
import { RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';

const ad = RewardedAd.createForAdRequest('ca-app-pub-XXX/YYY_REW');
ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
  console.log('User earned:', reward.amount, reward.type);
  giveCoinsToUser(reward.amount);
});
ad.load();
```

## 7. RGPD / consentement (Europe)

Avant de servir une pub, demander le consentement utilisateur :

```tsx
import * as MobileAds from 'react-native-google-mobile-ads';

await MobileAds.default().setRequestConfiguration({
  maxAdContentRating: MobileAds.MaxAdContentRating.PG,
  tagForChildDirectedTreatment: false,
  tagForUnderAgeOfConsent: false,
});

// SDK consentement (UMP) :
import { AdsConsent, AdsConsentStatus } from 'react-native-google-mobile-ads';
const info = await AdsConsent.requestInfoUpdate();
if (info.isConsentFormAvailable) await AdsConsent.showForm();
```

## 8. Test des pubs

En `__DEV__`, **toujours** utiliser `TestIds.*` (Banner, Interstitial, Rewarded). Sinon AdMob bannit votre compte si vous cliquez sur de vraies pubs.

## 9. Mise en production

1. Créer les ad units en prod dans AdMob console
2. Vérifier que `ads.txt` du Play Store a bien la ligne `google.com, pub-XXX, DIRECT, f08c47fec0942fa0`
3. Soumettre l'app au Play Store / App Store
4. Activer les pubs **après** validation par AdMob (~48h)

## 10. Erreurs fréquentes

| Erreur | Cause | Fix |
|---|---|---|
| `BannerAd: Ad failed to load` | App ID mal configuré dans app.json | Re-vérifier `androidAppId` / `iosAppId` |
| `requestNonPersonalizedAdsOnly` ignoré | Mauvaise API | Utiliser `requestOptions` directement, pas `setRequestConfiguration` |
| Pub blanche en prod | Inventaire AdMob vide / nouveau compte | Patienter 24-72h après go-live |
| AdMob bannit le compte | Clics sur prod en dev | **Toujours** utiliser `TestIds` pendant le dev |
