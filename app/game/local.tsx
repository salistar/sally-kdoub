/**
 * @file game/local.tsx
 * @description Route wrapper for local Kdoub game (vs bot or 2-player). Reads the mode parameter and delegates to the appropriate game screen component.
 * @author Idriss Kriouile
 * @date 2026-04-05
 * @project SallyCards - Kdoub
 */

import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import KdoubGameScreen from '../../src/screens/KdoubGameScreen';
import LocalTwoPlayerScreen from '../../src/screens/LocalTwoPlayerScreen';

export default function LocalGameRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  // Log when the local game route mounts and which mode is selected
  useEffect(() => {
    console.log('[Kdoub/LocalGameRoute] Component mounted');
    console.log('[Kdoub/LocalGameRoute] State update: mode =', mode);
  }, [mode]);

  // Conditional rendering based on mode parameter:
  // "local" mode renders the 2-player local screen; anything else renders the bot game screen
  if (mode === 'local') {
    console.log('[Kdoub/LocalGameRoute] Rendering LocalTwoPlayerScreen');
    return <LocalTwoPlayerScreen />;
  }

  console.log('[Kdoub/LocalGameRoute] Rendering KdoubGameScreen (bot mode)');
  return <KdoubGameScreen />;
}

/* === End of game/local.tsx — Kdoub — SallyCards === */
