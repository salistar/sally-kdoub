/**
 * @file googleAuth.ts
 * @description Google Sign-In natif pour SallyCards (Expo SDK 52 / dev build,
 * React Native 0.76 en mode bridgeless).
 *
 * NB : en bridgeless mode, les TurboModules ne sont PAS exposes sur
 * NativeModules.<name>. On detecte donc la presence du module natif via :
 *   1) TurboModuleRegistry.get('RNGoogleSignin')  — chemin officiel
 *   2) NativeModules.RNGoogleSignin               — fallback bridge classique
 *   3) try/catch dynamique autour de configure()  — verite ultime
 *
 * webClientId = audience de l'id_token (verifie cote backend tokeninfo).
 * Env (.env, EXPO_PUBLIC_*) : EXPO_PUBLIC_GOOGLE_CLIENT_ID (Web Client OAuth).
 */
import { useEffect, useRef, useState } from 'react';
import { NativeModules, TurboModuleRegistry } from 'react-native';
import Constants from 'expo-constants';

function getWebClientId(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
    (Constants as any).expoConfig?.extra?.googleClientId ||
    ''
  );
}

// Detection robuste, compatible bridgeless. On NE rejette l'environnement
// que pour Expo Go ; partout ailleurs on tente la presence du module.
function detectNativeGoogleSignin(): boolean {
  const env = (Constants as any).executionEnvironment;
  if (env === 'storeClient') return false; // Expo Go : sera force a false
  try {
    // TurboModuleRegistry.get ne jette pas si absent — il retourne null.
    if (TurboModuleRegistry && typeof (TurboModuleRegistry as any).get === 'function') {
      if ((TurboModuleRegistry as any).get('RNGoogleSignin')) return true;
    }
  } catch {}
  // Fallback bridge classique (RN < 0.76 / non bridgeless)
  if ((NativeModules as any).RNGoogleSignin) return true;
  return false;
}

// Import "soft" du JS — ne plante pas si le package n'est pas resolu.
function loadGoogleSignin(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-google-signin/google-signin');
  } catch {
    return null;
  }
}

export function useGoogleSignIn(
  onIdToken: (idToken: string) => void,
  onError?: (message: string) => void
) {
  const webClientId = getWebClientId();
  const configured = useRef(false);
  const [ready, setReady] = useState<boolean>(false);
  // missingNative passe a true UNIQUEMENT si configure() echoue / TurboModule
  // absent. Par defaut on suppose qu'il est present (cas dev build normal).
  const [missingNative, setMissingNative] = useState<boolean>(
    (Constants as any).executionEnvironment === 'storeClient'
  );

  useEffect(() => {
    if (configured.current || !webClientId) return;
    const mod = loadGoogleSignin();
    if (!mod?.GoogleSignin) {
      // JS non resolu => probablement Expo Go ou package retire
      setMissingNative(true);
      setReady(false);
      return;
    }
    const hasNative = detectNativeGoogleSignin();
    if (!hasNative) {
      // On laisse tout de meme tenter configure() : en bridgeless le test
      // TurboModuleRegistry.get peut renvoyer null malgre la presence du
      // module — la verite est dans le try/catch suivant.
    }
    try {
      mod.GoogleSignin.configure({
        webClientId,
        offlineAccess: false,
        scopes: ['profile', 'email'],
      });
      configured.current = true;
      setReady(true);
      setMissingNative(false);
    } catch (e: any) {
      // Plus probable : TurboModuleRegistry.getEnforcing('RNGoogleSignin')
      // a echoue — pas de module natif. On marque missingNative.
      configured.current = false;
      setReady(false);
      setMissingNative(true);
    }
  }, [webClientId]);

  const promptAsync = async () => {
    if (missingNative) {
      onError?.(
        "Module Google natif absent — lancez un dev build (npx expo run:android), pas Expo Go."
      );
      return;
    }
    const mod = loadGoogleSignin();
    if (!mod?.GoogleSignin) {
      onError?.(
        "Module Google natif absent — lancez un dev build (npx expo run:android)."
      );
      return;
    }
    const { GoogleSignin, statusCodes } = mod;
    try {
      if (!configured.current) {
        GoogleSignin.configure({
          webClientId,
          offlineAccess: false,
          scopes: ['profile', 'email'],
        });
        configured.current = true;
      }
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      // Force l'affichage du selecteur de compte a chaque fois en
      // invalidant la session precedente. Sans ca, Android reconnecte
      // automatiquement le dernier compte choisi (pas d'UI de selection).
      try {
        await GoogleSignin.signOut();
      } catch {
        /* pas de session a fermer */
      }
      const res: any = await GoogleSignin.signIn();
      const idToken =
        res?.data?.idToken ?? res?.idToken ?? res?.user?.idToken ?? null;
      if (res?.type === 'cancelled') {
        onError?.('Connexion Google annulée');
        return;
      }
      if (idToken) {
        onIdToken(idToken);
      } else {
        onError?.("Aucun id_token reçu de Google");
      }
    } catch (e: any) {
      const c = e?.code;
      if (c === statusCodes?.SIGN_IN_CANCELLED) {
        onError?.('Connexion Google annulée');
      } else if (c === statusCodes?.IN_PROGRESS) {
        onError?.('Connexion Google déjà en cours');
      } else if (c === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
        onError?.('Google Play Services indisponible');
      } else if (e?.message && /RNGoogleSignin/i.test(e.message)) {
        setMissingNative(true);
        onError?.(
          "Module natif Google introuvable dans le binaire (re-prebuild necessaire)."
        );
      } else {
        onError?.(e?.message || 'Échec Google Sign-In');
      }
    }
  };

  return {
    ready: !!webClientId && ready,
    promptAsync,
    missingClientId: !webClientId,
    missingNative,
  };
}
