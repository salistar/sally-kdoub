# Intégration RevenueCat

> Achats in-app et abonnements unifiés iOS + Android.
> Plus simple que de gérer Google Play Billing + StoreKit séparément.

## 1. Comptes & setup

1. Créer compte → https://app.revenuecat.com
2. Créer un **Project** et y attacher 2 **Apps** : iOS + Android
3. Connecter Google Play (service account) + App Store Connect
4. Récupérer les **API keys publiques** :
   - Android : `goog_XXXXXXXXXXXXXXXXXXXX`
   - iOS : `appl_YYYYYYYYYYYYYYYYYYYY`

## 2. Création des produits

### Côté Google Play Console
- **Subscriptions** → Créer un abonnement (`premium_monthly`, `premium_yearly`)
- **In-app products** → Créer des produits consommables (`coins_100`, `coins_500`)

### Côté App Store Connect
- Mêmes IDs (RevenueCat préfère que les SKUs matchent entre stores)

### Côté RevenueCat dashboard
- **Products** → importer les SKUs Google + Apple
- **Entitlements** → créer `premium` (lié aux subs)
- **Offerings** → créer `default` qui contient les Packages :
  - `monthly` → premium_monthly (Google + Apple)
  - `annual` → premium_yearly
  - `lifetime` → premium_lifetime

## 3. Installation côté app

```powershell
npx expo install react-native-purchases
npx expo prebuild --clean   # nécessaire car module natif
```

## 4. Initialisation

```tsx
// app/_layout.tsx
import { useEffect } from 'react';
import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

export default function RootLayout() {
  useEffect(() => {
    Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN);
    Purchases.configure({
      apiKey: Platform.select({
        android: 'goog_XXXXXXXXXXXXXXXXXXXX',
        ios: 'appl_YYYYYYYYYYYYYYYYYYYY',
      })!,
    });

    // Si vous avez déjà un user ID :
    // Purchases.logIn('user_id_from_your_backend');
  }, []);

  return /* ... */;
}
```

## 5. Hook React pour vérifier le statut

```tsx
// src/hooks/usePremium.ts
import { useEffect, useState } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';

export function usePremium() {
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Purchases.getCustomerInfo()
      .then(setInfo)
      .finally(() => setLoading(false));

    const unsub = Purchases.addCustomerInfoUpdateListener(setInfo);
    return () => { unsub(); };
  }, []);

  return {
    loading,
    isPremium: info?.entitlements.active['premium'] !== undefined,
    expirationDate: info?.entitlements.active['premium']?.expirationDate,
    customerInfo: info,
  };
}
```

## 6. Écran d'achat (Paywall)

```tsx
// app/paywall.tsx
import { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import Purchases, { PurchasesPackage } from 'react-native-purchases';

export default function Paywall() {
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);

  useEffect(() => {
    Purchases.getOfferings().then(o => {
      if (o.current) setPackages(o.current.availablePackages);
    });
  }, []);

  async function buy(pkg: PurchasesPackage) {
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (customerInfo.entitlements.active['premium']) {
        Alert.alert('Premium activé !', 'Merci pour votre soutien.');
        // navigate back
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert('Erreur', e.message);
      }
    }
  }

  return (
    <View>
      {packages.map(pkg => (
        <Pressable key={pkg.identifier} onPress={() => buy(pkg)}>
          <Text>{pkg.product.title}</Text>
          <Text>{pkg.product.priceString}</Text>
          <Text>{pkg.product.description}</Text>
        </Pressable>
      ))}
      <Pressable onPress={() => Purchases.restorePurchases()}>
        <Text>Restaurer mes achats</Text>
      </Pressable>
    </View>
  );
}
```

## 7. Achat consommable (jetons / coins)

```tsx
async function buyCoins(skuOrPackage: string) {
  const products = await Purchases.getProducts(['coins_100', 'coins_500']);
  const product = products.find(p => p.identifier === skuOrPackage);
  if (!product) return;
  const result = await Purchases.purchaseStoreProduct(product);
  // Crediter user dans votre backend (RevenueCat envoie un webhook)
}
```

## 8. Webhooks RevenueCat → backend

Dashboard RevenueCat → **Project Settings** → **Webhooks** :
- URL : `https://api.salistar.com/webhooks/revenuecat`
- Événements : `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`

Côté backend NestJS, valider la signature HMAC du webhook avant de créditer.

## 9. Test sandbox

### Android
- Créer un **License Tester** dans Google Play Console (Setup → License Testing)
- Login sur l'émulateur / device avec un compte tester
- Les achats sont gratuits et auto-renouvellent toutes les 5 min en sandbox

### iOS
- Créer un **Sandbox Tester** dans App Store Connect
- Settings iOS → App Store → Sandbox Account → login

## 10. Erreurs fréquentes

| Erreur | Cause | Fix |
|---|---|---|
| `Offerings is null` | Pas de Current Offering en dashboard | Dashboard → Offerings → mettre `default` en Current |
| `Purchase failed: SKU not found` | Produit pas activé sur le store | Google Play : Setup → onglet "Pricing & distribution" → activer |
| `Entitlement not active after purchase` | Webhook pas configuré | Vérifier webhook dashboard ou rappeler `getCustomerInfo()` |
| `RevenueCat configure called more than once` | Hot-reload appelle plusieurs fois | Wrapper dans une init globale (pas dans un `useEffect` non gardé) |
| Tester ne peut pas acheter Android | Compte pas dans License Tester | Ajouter le compte Gmail dans Google Play Console |
